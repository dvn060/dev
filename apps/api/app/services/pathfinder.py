"""Path analysis orchestration.

Answers: "Can SRC talk to DST on PROTOCOL/PORT — and why?"

Two modes, always labeled in the response:

* verdict source "batfish"   — Batfish computed the forwarding/filtering
  result. Dispositions map to permitted/denied/undeliverable verdicts, and
  every ACL decision in the trace is mapped back to configuration lines.
* verdict source "none" (degraded) — Batfish is unavailable. We do NOT guess
  reachability. The verdict is "unknown"; the response still gathers
  deterministic *evidence candidates* (which device owns each endpoint, which
  ACL entries match the flow, which routes cover the destination) clearly
  labeled `confidence: inferred` so an engineer can investigate manually.

Rule 6 of the architecture: deterministic analysis is never overridden — this
module contains no LLM involvement at all.
"""

from __future__ import annotations

import ipaddress
import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..models import Acl, Device, Snapshot
from .batfish_client import batfish_status, run_traceroute
from .cisco_parser import AclAddress, AclPortMatch

logger = logging.getLogger(__name__)

PERMITTED_DISPOSITIONS = {"ACCEPTED", "DELIVERED_TO_SUBNET", "EXITS_NETWORK"}
DENIED_DISPOSITIONS = {"DENIED_IN", "DENIED_OUT"}


def _load_devices(db: Session, snapshot_id: str) -> list[Device]:
    return list(
        db.execute(
            select(Device)
            .where(Device.snapshot_id == snapshot_id)
            .options(
                selectinload(Device.interfaces),
                selectinload(Device.routes),
                selectinload(Device.acls).selectinload(Acl.entries),
            )
        ).scalars().all()
    )


def _locate_endpoint(devices: list[Device], ip: str) -> list[dict]:
    """Find device interfaces whose configured subnet contains `ip`.

    Confirmed by configuration: the subnet exists on that interface. Whether
    the actual host is present is *not* knowable from configs — callers must
    present this as subnet ownership, not host existence.
    """
    matches: list[dict] = []
    addr = ipaddress.ip_address(ip)
    for device in devices:
        for iface in device.interfaces:
            if iface.admin_state == "shutdown":
                continue
            for ip_info in iface.ip_addresses or []:
                try:
                    net = ipaddress.ip_network(
                        f"{ip_info['address']}/{ip_info['prefix_length']}", strict=False
                    )
                except ValueError:
                    continue
                if addr in net and net.prefixlen < 32:
                    matches.append({
                        "device_id": device.id,
                        "hostname": device.hostname,
                        "interface": iface.name,
                        "subnet": str(net),
                        "gateway_ip": ip_info["address"],
                        "evidence": {
                            "device_id": device.id,
                            "hostname": device.hostname,
                            "lines": iface.evidence_lines or [],
                        },
                    })
    # Prefer the most specific subnet (longest prefix) as the primary location.
    matches.sort(key=lambda m: -int(m["subnet"].split("/")[1]))
    return matches


def _acl_line_index(devices: list[Device]) -> dict[tuple[str, str], Acl]:
    return {(d.hostname, a.name): a for d in devices for a in d.acls}


def _entry_matches(entry, src_ip: str, dst_ip: str, protocol: str,
                   dst_port: int | None, src_port: int | None) -> bool:
    if entry.action not in ("permit", "deny"):
        return False
    proto = (entry.protocol or "ip").lower()
    if proto not in ("ip", protocol.lower()):
        return False
    try:
        if entry.src and not AclAddress(**entry.src).matches(src_ip):
            return False
        if entry.dst and not AclAddress(**entry.dst).matches(dst_ip):
            return False
    except ValueError:
        return False
    if entry.dst_port and dst_port is not None:
        if not AclPortMatch(op=entry.dst_port["op"], values=entry.dst_port["values"]).matches(dst_port):
            return False
    if entry.src_port and src_port is not None:
        if not AclPortMatch(op=entry.src_port["op"], values=entry.src_port["values"]).matches(src_port):
            return False
    return True


def _collect_candidate_evidence(
    devices: list[Device], src_ip: str, dst_ip: str,
    protocol: str, dst_port: int | None, src_port: int | None,
) -> list[dict]:
    """Deterministic per-object evidence for degraded mode: ACL entries whose
    match fields cover the flow, and routes covering either endpoint. This is
    NOT a path simulation — order of devices along the real path is unknown
    without Batfish, and the output says so."""
    findings: list[dict] = []
    for device in devices:
        for acl in device.acls:
            applied_on = [
                {"interface": i.name, "direction": "in" if i.acl_in == acl.name else "out"}
                for i in device.interfaces
                if acl.name in (i.acl_in, i.acl_out)
            ]
            for entry in acl.entries:
                if _entry_matches(entry, src_ip, dst_ip, protocol, dst_port, src_port):
                    findings.append({
                        "type": "acl_entry_match",
                        "confidence": "inferred",
                        "hostname": device.hostname,
                        "device_id": device.id,
                        "acl_name": acl.name,
                        "action": entry.action,
                        "entry_text": entry.text,
                        "applied_on": applied_on,
                        "explanation": (
                            f"Entry in ACL '{acl.name}' on {device.hostname} matches this "
                            f"flow and would {entry.action} it *if* traffic traverses an "
                            "interface where the ACL is applied. First-match ordering along "
                            "the real path is not evaluated without Batfish."
                        ),
                        "evidence": {
                            "device_id": device.id,
                            "hostname": device.hostname,
                            "lines": [entry.line_number],
                        },
                    })
                    break  # first matching entry per ACL is the relevant one
        for route in device.routes:
            try:
                net = ipaddress.ip_network(route.prefix)
            except ValueError:
                continue
            if ipaddress.ip_address(dst_ip) in net:
                findings.append({
                    "type": "route_match",
                    "confidence": "inferred",
                    "hostname": device.hostname,
                    "device_id": device.id,
                    "prefix": route.prefix,
                    "next_hop": route.next_hop_ip or route.next_hop_interface,
                    "explanation": (
                        f"Static route on {device.hostname} covers the destination "
                        f"({route.prefix} via {route.next_hop_ip or route.next_hop_interface}). "
                        "Longest-prefix selection among all routes is only evaluated by Batfish."
                    ),
                    "evidence": {
                        "device_id": device.id,
                        "hostname": device.hostname,
                        "lines": route.evidence_lines or [],
                    },
                })
    return findings


def _map_trace_evidence(traces: list[dict], devices: list[Device]) -> list[dict]:
    """Attach configuration-line evidence to Batfish trace steps."""
    acl_index = _acl_line_index(devices)
    device_by_hostname = {d.hostname: d for d in devices}
    for trace in traces:
        for hop in trace["hops"]:
            node = hop["node"]
            device = device_by_hostname.get(node)
            for step in hop["steps"]:
                acl_name = step.get("acl_name")
                if acl_name and device:
                    acl = acl_index.get((device.hostname, acl_name))
                    if acl:
                        step["evidence"] = {
                            "device_id": device.id,
                            "hostname": device.hostname,
                            "acl_name": acl_name,
                            "lines": acl.evidence_lines or [],
                        }
    return traces


def analyze_path(
    db: Session,
    snapshot: Snapshot,
    src_ip: str,
    dst_ip: str,
    protocol: str = "tcp",
    dst_port: int | None = None,
    src_port: int | None = None,
) -> dict[str, Any]:
    devices = _load_devices(db, snapshot.id)
    src_locations = _locate_endpoint(devices, src_ip)
    dst_locations = _locate_endpoint(devices, dst_ip)

    missing_evidence: list[str] = []
    if not src_locations:
        missing_evidence.append(
            f"No imported device has an interface subnet containing source {src_ip}. "
            "The source may live behind a device that was not imported."
        )
    if not dst_locations:
        missing_evidence.append(
            f"No imported device has an interface subnet containing destination {dst_ip}."
        )

    result: dict[str, Any] = {
        "query": {
            "snapshot_id": snapshot.id,
            "src_ip": src_ip,
            "dst_ip": dst_ip,
            "protocol": protocol,
            "dst_port": dst_port,
            "src_port": src_port,
        },
        "src_locations": src_locations,
        "dst_locations": dst_locations,
        "missing_evidence": missing_evidence,
    }

    status = batfish_status()
    if not status["available"]:
        result.update({
            "verdict": "unknown",
            "verdict_source": "none",
            "verdict_explanation": (
                "Batfish is not available, so no forwarding or filtering verdict can be "
                "computed. The candidate evidence below is deterministic per-object matching "
                "only — it does not establish whether the traffic actually flows."
            ),
            "batfish": status,
            "candidate_evidence": _collect_candidate_evidence(
                devices, src_ip, dst_ip, protocol, dst_port, src_port
            ),
        })
        return result

    if not src_locations:
        result.update({
            "verdict": "unknown",
            "verdict_source": "none",
            "verdict_explanation": (
                "The source address cannot be placed on any imported device, so a "
                "traceroute start location cannot be determined."
            ),
            "batfish": status,
            "candidate_evidence": _collect_candidate_evidence(
                devices, src_ip, dst_ip, protocol, dst_port, src_port
            ),
        })
        return result

    loc = src_locations[0]
    start_location = f"@enter({loc['hostname']}[{loc['interface']}])"
    try:
        bf_result = run_traceroute(
            db, snapshot, src_ip, dst_ip, protocol, dst_port, src_port, start_location
        )
    except Exception as exc:
        logger.exception("Batfish traceroute failed")
        result.update({
            "verdict": "error",
            "verdict_source": "batfish",
            "verdict_explanation": f"Batfish analysis failed: {exc}",
            "batfish": status,
            "candidate_evidence": _collect_candidate_evidence(
                devices, src_ip, dst_ip, protocol, dst_port, src_port
            ),
        })
        return result

    traces = _map_trace_evidence(bf_result["traces"], devices)
    dispositions = {t["disposition"] for t in traces}
    if dispositions and dispositions <= PERMITTED_DISPOSITIONS:
        verdict = "permitted"
    elif dispositions and dispositions <= (DENIED_DISPOSITIONS | {"NULL_ROUTED", "NO_ROUTE", "LOOP",
                                                                  "NEIGHBOR_UNREACHABLE",
                                                                  "INSUFFICIENT_INFO"}):
        verdict = "denied" if dispositions & DENIED_DISPOSITIONS else "undeliverable"
    elif not dispositions:
        verdict = "unknown"
    else:
        verdict = "mixed"

    result.update({
        "verdict": verdict,
        "verdict_source": "batfish",
        "verdict_explanation": _explain(verdict, dispositions, traces),
        "batfish": status,
        "start_location": start_location,
        "traces": traces,
        "batfish_parse_warnings": bf_result.get("parse_warnings", []),
    })
    return result


def _explain(verdict: str, dispositions: set[str], traces: list[dict]) -> str:
    base = {
        "permitted": "All computed traces reach the destination.",
        "denied": "Traffic is dropped by a filter (ACL) along the path.",
        "undeliverable": "No delivery path exists (routing, not filtering).",
        "mixed": "Different traces disagree (often ECMP with asymmetric policy).",
        "unknown": "Batfish returned no traces for this flow.",
    }[verdict]
    detail = f" Dispositions: {', '.join(sorted(dispositions))}." if dispositions else ""
    deny_steps = [
        f"{hop['node']} ACL '{step.get('acl_name')}'"
        for t in traces for hop in t["hops"] for step in hop["steps"]
        if step.get("action") == "DENIED" and step.get("acl_name")
    ]
    if deny_steps:
        detail += f" Denied at: {', '.join(sorted(set(deny_steps)))}."
    return base + detail
