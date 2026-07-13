"""Deterministic findings engine.

Scans a snapshot's parsed data for conditions a network engineer would want
flagged. Rules are deterministic and evidence-backed; each finding carries:

* severity   — high / medium / low / info. Severity reflects *operational
  impact if the condition is real*, not style. Hygiene observations (unused
  ACLs, open trunks) are explicitly labeled as hygiene, never dressed up as
  security vulnerabilities.
* category   — correctness | hygiene | analysis_coverage | freshness
* confidence — confirmed (stated by config lines) / inferred (deduction).
* evidence   — device + exact config line numbers, same links as everywhere
  else in the product.

When the Batfish engine is reachable, its file-parse status and
snapshot-initialization issues are included as analysis_coverage findings so
the user knows how much the behavioral engine actually understood.
"""

from __future__ import annotations

import ipaddress
import logging
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..models import Acl, Device, Snapshot
from .batfish_client import batfish_status

logger = logging.getLogger(__name__)

STALE_AFTER_DAYS = 90

_SEVERITY_RANK = {"high": 0, "medium": 1, "low": 2, "info": 3}


def _finding(kind: str, key: str, severity: str, category: str, title: str,
             explanation: str, confidence: str,
             affected: list[dict] | None = None,
             evidence: list[dict] | None = None,
             data: dict | None = None) -> dict:
    return {
        "id": f"{kind}:{key}",
        "kind": kind,
        "severity": severity,
        "category": category,
        "title": title,
        "explanation": explanation,
        "confidence": confidence,
        "affected": affected or [],
        "evidence": evidence or [],
        "data": data or {},
    }


def _dev(device: Device) -> dict:
    return {"device_id": device.id, "hostname": device.hostname}


def _ev(device: Device, lines: list[int]) -> dict:
    return {"device_id": device.id, "hostname": device.hostname, "lines": lines}


def compute_findings(db: Session, snapshot: Snapshot,
                     include_batfish: bool = True) -> dict[str, Any]:
    devices = list(
        db.execute(
            select(Device)
            .where(Device.snapshot_id == snapshot.id)
            .options(selectinload(Device.interfaces),
                     selectinload(Device.acls).selectinload(Acl.entries))
            .order_by(Device.hostname)
        ).scalars().all()
    )

    findings: list[dict] = []
    findings += _rule_duplicate_ip(devices)
    findings += _rule_overlapping_subnets(devices)
    findings += _rule_acl_unused(devices)
    findings += _rule_acl_undefined(devices)
    findings += _rule_trunk_all_vlans(devices)
    findings += _rule_duplicate_config(devices)
    findings += _rule_hostname_mismatch(snapshot, devices)
    findings += _rule_stale_snapshot(snapshot)
    findings += _rule_unsupported_syntax(devices)

    status = batfish_status()
    batfish_ran = False
    if include_batfish and status["available"]:
        try:
            findings += _batfish_findings(db, snapshot, devices)
            batfish_ran = True
        except Exception as exc:  # engine hiccups must not break findings
            logger.exception("Batfish findings failed")
            findings.append(_finding(
                "batfish_error", snapshot.id, "info", "analysis_coverage",
                "Analysis engine could not be consulted",
                f"Batfish is reachable but returned an error while analyzing this "
                f"snapshot: {exc}. Engine-derived findings are unavailable.",
                "confirmed",
            ))

    findings.sort(key=lambda f: (_SEVERITY_RANK.get(f["severity"], 9), f["title"]))
    return {
        "snapshot_id": snapshot.id,
        "batfish": {**status, "consulted": batfish_ran},
        "counts": {sev: sum(1 for f in findings if f["severity"] == sev)
                   for sev in ("high", "medium", "low", "info")},
        "findings": findings,
    }


# ---------------------------------------------------------------------------
# Rules
# ---------------------------------------------------------------------------


def _iter_addresses(devices: list[Device]):
    for device in devices:
        for iface in device.interfaces:
            for ip in iface.ip_addresses or []:
                yield device, iface, ip


def _rule_duplicate_ip(devices: list[Device]) -> list[dict]:
    seen: dict[str, list] = {}
    for device, iface, ip in _iter_addresses(devices):
        seen.setdefault(ip["address"], []).append((device, iface))
    out = []
    for addr, owners in sorted(seen.items()):
        if len(owners) < 2:
            continue
        out.append(_finding(
            "duplicate_ip", addr, "high", "correctness",
            f"IP address {addr} is configured on {len(owners)} interfaces",
            f"The address {addr} is assigned on "
            + ", ".join(f"{d.hostname} {i.name}" for d, i in owners)
            + ". If more than one of these interfaces is active in the same "
              "routing domain, forwarding to this address is unpredictable. "
              "Note: first-hop redundancy virtual addresses (HSRP/VRRP) are "
              "not modeled by the parser and would also appear here.",
            "confirmed",
            affected=[_dev(d) for d, _ in owners],
            evidence=[_ev(d, i.evidence_lines or []) for d, i in owners],
            data={"address": addr},
        ))
    return out


def _rule_overlapping_subnets(devices: list[Device]) -> list[dict]:
    nets: list[tuple] = []
    for device, iface, ip in _iter_addresses(devices):
        try:
            net = ipaddress.ip_network(f"{ip['address']}/{ip['prefix_length']}", strict=False)
        except ValueError:
            continue
        if net.prefixlen >= 32:
            continue
        nets.append((net, device, iface))
    out = []
    reported: set[tuple[str, ...]] = set()
    for i, (n1, d1, i1) in enumerate(nets):
        for n2, d2, i2 in nets[i + 1:]:
            if n1 == n2:
                continue  # same subnet on two routers is a normal shared segment
            if n1.overlaps(n2):
                key = tuple(sorted([str(n1), str(n2)]))
                if key in reported:
                    continue
                reported.add(key)
                out.append(_finding(
                    "overlapping_subnets", f"{key[0]}|{key[1]}", "medium", "correctness",
                    f"Connected subnets overlap: {n1} and {n2}",
                    f"{d1.hostname} {i1.name} is configured in {n1} while "
                    f"{d2.hostname} {i2.name} is configured in {n2}. One prefix "
                    "contains the other, so part of the address space is claimed "
                    "by two different connected networks — hosts in the overlap "
                    "may be unreachable from one side. This is a deduction from "
                    "addressing alone; an intentional design (e.g. migration in "
                    "progress) can look identical.",
                    "inferred",
                    affected=[_dev(d1), _dev(d2)],
                    evidence=[_ev(d1, i1.evidence_lines or []),
                              _ev(d2, i2.evidence_lines or [])],
                    data={"subnets": list(key)},
                ))
    return out


def _rule_acl_unused(devices: list[Device]) -> list[dict]:
    out = []
    for device in devices:
        applied = {name for i in device.interfaces for name in (i.acl_in, i.acl_out) if name}
        for acl in device.acls:
            if acl.name not in applied:
                out.append(_finding(
                    "acl_unused", f"{device.hostname}:{acl.name}", "info", "hygiene",
                    f"ACL '{acl.name}' on {device.hostname} is not applied to any interface",
                    "The ACL is defined but no interface in this snapshot applies it "
                    "with 'ip access-group'. This is a hygiene observation, not a "
                    "security finding: the ACL may be used by features this parser "
                    "does not model (vty access-class, SNMP, NAT, route-maps), or it "
                    "may be leftover configuration.",
                    "confirmed",
                    affected=[_dev(device)],
                    evidence=[_ev(device, acl.evidence_lines or [])],
                    data={"acl_name": acl.name},
                ))
    return out


def _rule_acl_undefined(devices: list[Device]) -> list[dict]:
    out = []
    for device in devices:
        defined = {acl.name for acl in device.acls}
        for iface in device.interfaces:
            for direction, name in (("in", iface.acl_in), ("out", iface.acl_out)):
                if name and name not in defined:
                    out.append(_finding(
                        "acl_undefined", f"{device.hostname}:{iface.name}:{name}",
                        "high", "correctness",
                        f"{device.hostname} {iface.name} references undefined ACL '{name}'",
                        f"'ip access-group {name} {direction}' is configured but no ACL "
                        f"named '{name}' exists in this configuration. On IOS, applying "
                        "a non-existent ACL filters nothing — traffic that an engineer "
                        "believes is filtered is actually permitted.",
                        "confirmed",
                        affected=[_dev(device)],
                        evidence=[_ev(device, iface.evidence_lines or [])],
                        data={"acl_name": name, "interface": iface.name,
                              "direction": direction},
                    ))
    return out


def _rule_trunk_all_vlans(devices: list[Device]) -> list[dict]:
    out = []
    for device in devices:
        for iface in device.interfaces:
            if iface.switchport_mode == "trunk" and not iface.trunk_allowed_vlans:
                out.append(_finding(
                    "trunk_all_vlans", f"{device.hostname}:{iface.name}", "low", "hygiene",
                    f"Trunk {device.hostname} {iface.name} allows all VLANs",
                    "The trunk has no 'switchport trunk allowed vlan' restriction, so "
                    "it carries every VLAN (1–4094). This is an operational-hygiene "
                    "observation: unrestricted trunks widen failure and flooding "
                    "domains and make change impact harder to reason about. It is "
                    "not, by itself, a vulnerability.",
                    "confirmed",
                    affected=[_dev(device)],
                    evidence=[_ev(device, iface.evidence_lines or [])],
                    data={"interface": iface.name},
                ))
    return out


def _strip_identity(text: str) -> str:
    lines = [ln for ln in text.splitlines()
             if not ln.strip().startswith(("hostname ", "!"))]
    return "\n".join(ln.rstrip() for ln in lines if ln.strip())


def _rule_duplicate_config(devices: list[Device]) -> list[dict]:
    import hashlib
    groups: dict[str, list[Device]] = {}
    for device in devices:
        digest = hashlib.sha256(_strip_identity(device.raw_config).encode()).hexdigest()
        groups.setdefault(digest, []).append(device)
    out = []
    for digest, group in groups.items():
        if len(group) < 2:
            continue
        names = ", ".join(d.hostname for d in group)
        out.append(_finding(
            "duplicate_config", digest[:12], "medium", "correctness",
            f"Devices {names} have identical configurations (except hostname)",
            "Apart from the hostname line, these configurations are byte-identical. "
            "That usually means a template was cloned without per-device edits — "
            "duplicate IP addresses and duplicate router IDs typically follow.",
            "confirmed",
            affected=[_dev(d) for d in group],
            evidence=[_ev(d, [1]) for d in group],
            data={"hostnames": [d.hostname for d in group]},
        ))
    return out


def _rule_hostname_mismatch(snapshot: Snapshot, devices: list[Device]) -> list[dict]:
    record = snapshot.import_record
    if record is None:
        return []
    by_hostname = {d.hostname: d for d in devices}
    out = []
    for entry in record.log or []:
        msg = entry.get("message", "")
        if "but configuration hostname is" in msg:
            hostname = msg.split("configuration hostname is '")[-1].split("'")[0]
            device = by_hostname.get(hostname)
            out.append(_finding(
                "hostname_mismatch", hostname, "low", "hygiene",
                f"Backup filename disagrees with configured hostname '{hostname}'",
                msg + " A mismatch between the archive's file naming and the device's "
                      "configured hostname often indicates a renamed device whose "
                      "backup job was not updated, or a file copied between device "
                      "folders.",
                "confirmed",
                affected=[_dev(device)] if device else [],
                evidence=[_ev(device, [1])] if device else [],
            ))
    return out


def _rule_stale_snapshot(snapshot: Snapshot) -> list[dict]:
    effective = snapshot.effective_at
    if effective.tzinfo is None:
        effective = effective.replace(tzinfo=UTC)
    age_days = (datetime.now(UTC) - effective).days
    if age_days <= STALE_AFTER_DAYS:
        return []
    return [_finding(
        "stale_snapshot", snapshot.id, "info", "freshness",
        f"Snapshot data is {age_days} days old",
        f"The newest configuration in this snapshot is dated "
        f"{effective:%Y-%m-%d}. Conclusions drawn from it describe the network "
        "as of that date; the live network may have diverged since.",
        "confirmed",
        data={"age_days": age_days, "effective_at": effective.isoformat()},
    )]


def _rule_unsupported_syntax(devices: list[Device]) -> list[dict]:
    out = []
    for device in devices:
        if not device.parse_warnings and device.completeness_score >= 1.0:
            continue
        warn_lines = [w["line"] for w in (device.parse_warnings or [])]
        out.append(_finding(
            "unsupported_syntax", device.hostname, "info", "analysis_coverage",
            f"{device.hostname}: {len(warn_lines)} configuration line(s) not fully modeled "
            f"({device.completeness_score * 100:.0f}% parsed)",
            "These lines were recognized as significant but could not be fully "
            "modeled by the inventory parser. They are excluded from structured "
            "answers (inventory, topology, candidate evidence) — never silently "
            "interpreted. Batfish performs its own independent parse for "
            "behavioral analysis.",
            "confirmed",
            affected=[_dev(device)],
            evidence=[_ev(device, warn_lines)] if warn_lines else [],
            data={"completeness": device.completeness_score,
                  "warnings": device.parse_warnings},
        ))
    return out


# ---------------------------------------------------------------------------
# Batfish-derived findings (live engine required)
# ---------------------------------------------------------------------------


def _batfish_findings(db: Session, snapshot: Snapshot,
                      devices: list[Device]) -> list[dict]:
    from .batfish_client import _ensure_snapshot, _pybatfish_session

    bf = _pybatfish_session()
    snapshot_name = _ensure_snapshot(bf, db, snapshot)
    bf.set_snapshot(snapshot_name)
    by_hostname = {d.hostname.lower(): d for d in devices}
    out: list[dict] = []

    frame = bf.q.fileParseStatus().answer().frame()
    for _, row in frame.iterrows():
        status = str(row.get("Status", "")).upper()
        if status in ("PASSED", "PARSED"):
            continue
        filename = str(row.get("File_Name", ""))
        hosts = [str(h) for h in (row.get("Nodes") or [])]
        affected = [_dev(by_hostname[h]) for h in hosts if h in by_hostname]
        out.append(_finding(
            "batfish_parse", filename, "medium", "analysis_coverage",
            f"Analysis engine parse status for {filename}: {status}",
            "Batfish did not fully parse this file. Behavioral verdicts "
            "involving the affected device may be based on an incomplete model.",
            "confirmed",
            affected=affected,
            data={"file": filename, "status": status},
        ))

    frame = bf.q.initIssues().answer().frame()
    for _, row in frame.iterrows():
        detail = str(row.get("Details", ""))
        issue_type = str(row.get("Type", ""))
        nodes = [str(n) for n in (row.get("Nodes") or [])]
        affected = [_dev(by_hostname[n]) for n in nodes if n in by_hostname]
        # Best-effort evidence: initIssues reports source lines per file
        evidence = []
        source_lines = row.get("Source_Lines") or []
        for fl in source_lines:
            fl_str = str(fl)  # format: "filename:[12, 13]"
            for hostname, device in by_hostname.items():
                if hostname in fl_str.lower():
                    lines = [int(x) for x in
                             fl_str.split("[")[-1].rstrip("]").split(",")
                             if x.strip().isdigit()]
                    evidence.append(_ev(device, lines))
        out.append(_finding(
            "batfish_issue", f"{issue_type}:{detail[:60]}", "medium", "analysis_coverage",
            f"Analysis engine issue: {issue_type or 'conversion warning'}",
            f"Batfish reported while initializing this snapshot: {detail}",
            "confirmed",
            affected=affected,
            evidence=evidence,
            data={"type": issue_type, "detail": detail},
        ))
    return out
