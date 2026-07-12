"""Snapshot comparison: raw diffs, semantic changes, and suspect ranking.

Three layers, from least to most interpreted:
1. Raw unified diff per device — ground truth, always available.
2. Semantic changes — typed objects (interface/ACL/route/VLAN) that were
   added, removed or modified, each pointing at evidence lines in both
   snapshots.
3. Suspect ranking — given a flow that used to work, deterministically score
   which changes could plausibly have broken it. This is explicitly a
   heuristic and is labeled `confidence: inferred`; it never overrides
   Batfish results, it prioritizes human investigation.
"""

from __future__ import annotations

import difflib
import ipaddress
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..models import Acl, Device, Snapshot
from .cisco_parser import AclAddress, AclPortMatch


def _load_devices(db: Session, snapshot_id: str) -> dict[str, Device]:
    devices = (
        db.execute(
            select(Device)
            .where(Device.snapshot_id == snapshot_id)
            .options(
                selectinload(Device.interfaces),
                selectinload(Device.vlans),
                selectinload(Device.routes),
                selectinload(Device.acls).selectinload(Acl.entries),
            )
        )
        .scalars()
        .all()
    )
    return {d.hostname: d for d in devices}


def compare_snapshots(db: Session, base: Snapshot, target: Snapshot) -> dict[str, Any]:
    base_devices = _load_devices(db, base.id)
    target_devices = _load_devices(db, target.id)

    added = sorted(set(target_devices) - set(base_devices))
    removed = sorted(set(base_devices) - set(target_devices))
    common = sorted(set(base_devices) & set(target_devices))

    device_diffs: list[dict] = []
    all_changes: list[dict] = []

    for hostname in common:
        b, t = base_devices[hostname], target_devices[hostname]
        if b.config_hash == t.config_hash:
            continue
        raw_diff = list(difflib.unified_diff(
            b.raw_config.splitlines(),
            t.raw_config.splitlines(),
            fromfile=f"{hostname} @ {base.display_name}",
            tofile=f"{hostname} @ {target.display_name}",
            lineterm="",
            n=3,
        ))
        changes = _semantic_changes(hostname, b, t)
        all_changes.extend(changes)
        device_diffs.append({
            "hostname": hostname,
            "base_device_id": b.id,
            "target_device_id": t.id,
            "raw_diff": raw_diff,
            "changes": changes,
        })

    return {
        "base_snapshot": {"id": base.id, "name": base.display_name},
        "target_snapshot": {"id": target.id, "name": target.display_name},
        "devices_added": added,
        "devices_removed": removed,
        "devices_changed": [d["hostname"] for d in device_diffs],
        "devices_unchanged": [h for h in common
                              if base_devices[h].config_hash == target_devices[h].config_hash],
        "device_diffs": device_diffs,
        "changes": all_changes,
    }


# ---------------------------------------------------------------------------
# Semantic change extraction
# ---------------------------------------------------------------------------


def _change(hostname: str, category: str, kind: str, obj: str, detail: str,
            base_lines: list[int] | None = None, target_lines: list[int] | None = None,
            extra: dict | None = None) -> dict:
    return {
        "hostname": hostname,
        "category": category,       # interface | acl | route | vlan
        "kind": kind,               # added | removed | modified
        "object": obj,
        "detail": detail,
        "base_evidence_lines": base_lines or [],
        "target_evidence_lines": target_lines or [],
        **(extra or {}),
    }


def _semantic_changes(hostname: str, b: Device, t: Device) -> list[dict]:
    changes: list[dict] = []

    # Interfaces ---------------------------------------------------------------
    b_if = {i.name: i for i in b.interfaces}
    t_if = {i.name: i for i in t.interfaces}
    for name in sorted(set(t_if) - set(b_if)):
        changes.append(_change(hostname, "interface", "added", name,
                               f"Interface {name} added.",
                               target_lines=t_if[name].evidence_lines))
    for name in sorted(set(b_if) - set(t_if)):
        changes.append(_change(hostname, "interface", "removed", name,
                               f"Interface {name} removed.",
                               base_lines=b_if[name].evidence_lines))
    watched = [
        ("admin_state", "administrative state"),
        ("switchport_mode", "switchport mode"),
        ("access_vlan", "access VLAN"),
        ("native_vlan", "native VLAN"),
        ("trunk_allowed_vlans", "trunk allowed VLANs"),
        ("acl_in", "inbound ACL"),
        ("acl_out", "outbound ACL"),
        ("vrf", "VRF"),
        ("description", "description"),
    ]
    for name in sorted(set(b_if) & set(t_if)):
        bi, ti = b_if[name], t_if[name]
        for attr, label in watched:
            bv, tv = getattr(bi, attr), getattr(ti, attr)
            if bv != tv:
                changes.append(_change(
                    hostname, "interface", "modified", name,
                    f"{name}: {label} changed from {bv!r} to {tv!r}.",
                    base_lines=bi.evidence_lines, target_lines=ti.evidence_lines,
                    extra={"field": attr, "base_value": bv, "target_value": tv},
                ))
        b_ips = sorted(f"{ip['address']}/{ip['prefix_length']}" for ip in (bi.ip_addresses or []))
        t_ips = sorted(f"{ip['address']}/{ip['prefix_length']}" for ip in (ti.ip_addresses or []))
        if b_ips != t_ips:
            changes.append(_change(
                hostname, "interface", "modified", name,
                f"{name}: IP addressing changed from {b_ips} to {t_ips}.",
                base_lines=bi.evidence_lines, target_lines=ti.evidence_lines,
                extra={"field": "ip_addresses", "base_value": b_ips, "target_value": t_ips},
            ))

    # VLANs ---------------------------------------------------------------------
    b_vl = {v.vlan_id: v for v in b.vlans}
    t_vl = {v.vlan_id: v for v in t.vlans}
    for vid in sorted(set(t_vl) - set(b_vl)):
        changes.append(_change(hostname, "vlan", "added", f"VLAN {vid}",
                               f"VLAN {vid} ({t_vl[vid].name or 'unnamed'}) added.",
                               target_lines=t_vl[vid].evidence_lines))
    for vid in sorted(set(b_vl) - set(t_vl)):
        changes.append(_change(hostname, "vlan", "removed", f"VLAN {vid}",
                               f"VLAN {vid} ({b_vl[vid].name or 'unnamed'}) removed.",
                               base_lines=b_vl[vid].evidence_lines))

    # Static routes ---------------------------------------------------------------
    def route_key(r) -> tuple:
        return (r.vrf or "", r.prefix, r.next_hop_ip or "", r.next_hop_interface or "")

    b_rt = {route_key(r): r for r in b.routes}
    t_rt = {route_key(r): r for r in t.routes}
    for key in sorted(set(t_rt) - set(b_rt)):
        r = t_rt[key]
        changes.append(_change(hostname, "route", "added", r.prefix,
                               f"Static route {r.prefix} via "
                               f"{r.next_hop_ip or r.next_hop_interface} added.",
                               target_lines=r.evidence_lines,
                               extra={"prefix": r.prefix}))
    for key in sorted(set(b_rt) - set(t_rt)):
        r = b_rt[key]
        changes.append(_change(hostname, "route", "removed", r.prefix,
                               f"Static route {r.prefix} via "
                               f"{r.next_hop_ip or r.next_hop_interface} removed.",
                               base_lines=r.evidence_lines,
                               extra={"prefix": r.prefix}))

    # ACLs ------------------------------------------------------------------------
    b_acl = {a.name: a for a in b.acls}
    t_acl = {a.name: a for a in t.acls}
    for name in sorted(set(t_acl) - set(b_acl)):
        changes.append(_change(hostname, "acl", "added", name, f"ACL {name} added.",
                               target_lines=t_acl[name].evidence_lines,
                               extra={"acl_name": name}))
    for name in sorted(set(b_acl) - set(t_acl)):
        changes.append(_change(hostname, "acl", "removed", name, f"ACL {name} removed.",
                               base_lines=b_acl[name].evidence_lines,
                               extra={"acl_name": name}))
    for name in sorted(set(b_acl) & set(t_acl)):
        ba, ta = b_acl[name], t_acl[name]
        b_entries = {e.text.strip(): e for e in ba.entries if e.action != "remark"}
        t_entries = {e.text.strip(): e for e in ta.entries if e.action != "remark"}
        for text in sorted(set(t_entries) - set(b_entries)):
            e = t_entries[text]
            changes.append(_change(
                hostname, "acl", "modified", name,
                f"ACL {name}: entry added: '{text}'.",
                target_lines=[e.line_number],
                extra={"acl_name": name, "entry_kind": "added", "entry": _entry_dict(e)},
            ))
        for text in sorted(set(b_entries) - set(t_entries)):
            e = b_entries[text]
            changes.append(_change(
                hostname, "acl", "modified", name,
                f"ACL {name}: entry removed: '{text}'.",
                base_lines=[e.line_number],
                extra={"acl_name": name, "entry_kind": "removed", "entry": _entry_dict(e)},
            ))

    return changes


def _entry_dict(e) -> dict:
    return {
        "action": e.action,
        "protocol": e.protocol,
        "src": e.src,
        "dst": e.dst,
        "src_port": e.src_port,
        "dst_port": e.dst_port,
        "established": bool(e.established),
        "text": e.text,
        "line_number": e.line_number,
    }


# ---------------------------------------------------------------------------
# Suspect ranking ("which change most likely broke this flow?")
# ---------------------------------------------------------------------------


def _entry_matches_flow(entry: dict, src_ip: str, dst_ip: str,
                        protocol: str, dst_port: int | None) -> bool:
    proto = (entry.get("protocol") or "ip").lower()
    if proto != "ip" and protocol != "ip" and proto != protocol:
        return False
    src = entry.get("src")
    dst = entry.get("dst")
    try:
        if src and not AclAddress(**src).matches(src_ip):
            return False
        if dst and not AclAddress(**dst).matches(dst_ip):
            return False
    except ValueError:
        return False
    port_match = entry.get("dst_port")
    if port_match and dst_port is not None:
        if not AclPortMatch(op=port_match["op"], values=port_match["values"]).matches(dst_port):
            return False
    return True


def rank_suspects(changes: list[dict], src_ip: str, dst_ip: str,
                  protocol: str, dst_port: int | None) -> list[dict]:
    """Deterministically score semantic changes against a broken flow.

    Returns changes annotated with {score, reasons, confidence:"inferred"},
    highest score first. Scores are ordinal, not probabilities.
    """
    suspects: list[dict] = []
    for change in changes:
        score = 0
        reasons: list[str] = []

        if change["category"] == "acl":
            entry = change.get("entry")
            if entry and _entry_matches_flow(entry, src_ip, dst_ip, protocol, dst_port):
                if change.get("entry_kind") == "removed" and entry["action"] == "permit":
                    score += 100
                    reasons.append(
                        "A permit entry matching this exact flow was removed; traffic that "
                        "previously matched it now falls through to later entries "
                        "(typically an implicit or explicit deny)."
                    )
                elif change.get("entry_kind") == "added" and entry["action"] == "deny":
                    score += 100
                    reasons.append("A deny entry matching this exact flow was added.")
                else:
                    score += 40
                    reasons.append("An ACL entry matching this flow changed.")
            elif change["kind"] in ("added", "removed"):
                score += 25
                reasons.append(f"ACL {change.get('acl_name')} was {change['kind']} entirely.")

        elif change["category"] == "route":
            prefix = change.get("prefix")
            if prefix:
                try:
                    net = ipaddress.ip_network(prefix)
                    if ipaddress.ip_address(dst_ip) in net:
                        score += 80 if change["kind"] == "removed" else 50
                        reasons.append(
                            f"A static route covering the destination ({prefix}) was "
                            f"{change['kind']}."
                        )
                    elif ipaddress.ip_address(src_ip) in net:
                        score += 60 if change["kind"] == "removed" else 35
                        reasons.append(
                            f"A static route covering the source ({prefix}) was {change['kind']}."
                        )
                except ValueError:
                    pass

        elif change["category"] == "interface":
            if change.get("field") == "admin_state" and change.get("target_value") == "shutdown":
                score += 70
                reasons.append(f"Interface {change['object']} was shut down.")
            elif change.get("field") in ("acl_in", "acl_out"):
                score += 55
                reasons.append(
                    f"The ACL applied to interface {change['object']} changed "
                    f"({change.get('base_value')!r} → {change.get('target_value')!r})."
                )
            elif change.get("field") == "ip_addresses":
                score += 45
                reasons.append(f"IP addressing on {change['object']} changed.")
            elif change["kind"] == "removed":
                score += 40
                reasons.append(f"Interface {change['object']} was removed.")
            elif change.get("field") == "description":
                score += 0  # cosmetic
            else:
                score += 10
                reasons.append(f"Interface {change['object']} configuration changed.")

        elif change["category"] == "vlan":
            score += 30 if change["kind"] == "removed" else 5
            if change["kind"] == "removed":
                reasons.append(f"{change['object']} was removed.")

        if score > 0:
            suspects.append({
                **change,
                "score": score,
                "reasons": reasons,
                "confidence": "inferred",
            })

    suspects.sort(key=lambda s: (-s["score"], s["hostname"], s["object"]))
    return suspects
