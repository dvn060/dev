"""Topology derivation from parsed configurations.

The topology graph is a *presentation and relationship* layer built from
configuration evidence. It is not a forwarding model (Batfish owns behavior).

Confidence tiers, shown explicitly in the UI:
* confirmed — stated directly by configuration lines (e.g. "this interface has
  an address in subnet X"). Every confirmed edge carries evidence lines.
* inferred  — a sound deduction from confirmed facts (e.g. exactly two devices
  configured in the same /30 are almost certainly directly connected), but the
  configurations cannot literally prove the cable exists.
* possible  — a hint such as an interface description naming another device.
  Useful, clearly labeled, never treated as fact.
"""

from __future__ import annotations

import ipaddress
import re
from collections import defaultdict
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..models import Device


def build_topology(db: Session, snapshot_id: str) -> dict[str, Any]:
    devices = (
        db.execute(
            select(Device)
            .where(Device.snapshot_id == snapshot_id)
            .options(selectinload(Device.interfaces))
            .order_by(Device.hostname)
        )
        .scalars()
        .all()
    )

    nodes: list[dict] = []
    edges: list[dict] = []

    for d in devices:
        nodes.append({
            "id": f"device:{d.id}",
            "type": "device",
            "label": d.hostname,
            "data": {
                "device_id": d.id,
                "hostname": d.hostname,
                "os_family": d.os_family,
                "management_ip": d.management_ip,
                "parse_status": d.parse_status,
                "interface_count": len(d.interfaces),
            },
        })

    # ---- L3: group interface addresses by subnet --------------------------------
    # membership: network -> list of (device, interface, address, evidence)
    subnet_members: dict[str, list[dict]] = defaultdict(list)
    for d in devices:
        for iface in d.interfaces:
            if iface.admin_state == "shutdown":
                continue
            for ip in iface.ip_addresses or []:
                try:
                    iface_net = ipaddress.ip_network(
                        f"{ip['address']}/{ip['prefix_length']}", strict=False
                    )
                except ValueError:
                    continue
                if iface_net.prefixlen == 32:
                    continue  # loopbacks don't create adjacency
                subnet_members[str(iface_net)].append({
                    "device_id": d.id,
                    "hostname": d.hostname,
                    "interface": iface.name,
                    "address": f"{ip['address']}/{ip['prefix_length']}",
                    "evidence_lines": iface.evidence_lines or [],
                })

    for net, members in sorted(subnet_members.items()):
        distinct_devices = {m["device_id"] for m in members}
        prefixlen = int(net.split("/")[1])
        if len(distinct_devices) == 2 and prefixlen >= 30:
            # Point-to-point subnet with both ends present: inferred direct link.
            a, b = members[0], members[1]
            edges.append({
                "id": f"l3:{net}",
                "source": f"device:{a['device_id']}",
                "target": f"device:{b['device_id']}",
                "kind": "l3_point_to_point",
                "confidence": "inferred",
                "label": net,
                "data": {
                    "subnet": net,
                    "endpoints": members,
                    "explanation": (
                        f"Both interfaces are configured inside {net} "
                        f"(a /{prefixlen} point-to-point subnet), so a direct link is inferred. "
                        "Configuration alone cannot prove physical cabling."
                    ),
                },
            })
        else:
            # Multi-access (or partially visible) subnet: represent the network
            # itself as a node; membership is confirmed by configuration.
            net_node_id = f"network:{net}"
            if not any(n["id"] == net_node_id for n in nodes):
                nodes.append({
                    "id": net_node_id,
                    "type": "network",
                    "label": net,
                    "data": {"subnet": net, "member_count": len(members)},
                })
            for m in members:
                edges.append({
                    "id": f"member:{net}:{m['device_id']}:{m['interface']}",
                    "source": f"device:{m['device_id']}",
                    "target": net_node_id,
                    "kind": "l3_subnet_membership",
                    "confidence": "confirmed",
                    "label": m["interface"],
                    "data": {
                        "subnet": net,
                        "interface": m["interface"],
                        "address": m["address"],
                        "evidence": [{
                            "device_id": m["device_id"],
                            "hostname": m["hostname"],
                            "lines": m["evidence_lines"],
                        }],
                        "explanation": (
                            f"{m['hostname']} {m['interface']} is configured with "
                            f"{m['address']}, which places it in {net}."
                        ),
                    },
                })

    # ---- L2 hints: descriptions naming other devices ----------------------------
    hostnames = {d.hostname.lower(): d for d in devices}
    seen_pairs: set[tuple[str, str]] = set()
    for d in devices:
        for iface in d.interfaces:
            desc = (iface.description or "").lower()
            if not desc:
                continue
            for other_name, other in hostnames.items():
                if other.id == d.id:
                    continue
                if re.search(rf"\b{re.escape(other_name)}\b", desc):
                    pair = tuple(sorted([d.id, other.id]))
                    key = (pair[0], pair[1])
                    if key in seen_pairs:
                        continue
                    seen_pairs.add(key)
                    edges.append({
                        "id": f"desc:{d.id}:{other.id}:{iface.name}",
                        "source": f"device:{d.id}",
                        "target": f"device:{other.id}",
                        "kind": "description_hint",
                        "confidence": "possible",
                        "label": iface.name,
                        "data": {
                            "interface": iface.name,
                            "description": iface.description,
                            "evidence": [{
                                "device_id": d.id,
                                "hostname": d.hostname,
                                "lines": iface.evidence_lines or [],
                            }],
                            "explanation": (
                                f"The description on {d.hostname} {iface.name} mentions "
                                f"'{other.hostname}'. Descriptions are free text and may be "
                                "stale, so this link is only a possibility."
                            ),
                        },
                    })

    # Suppress description hints where a stronger relationship already exists.
    strong: set[frozenset] = set()
    for e in edges:
        if e["kind"] == "l3_point_to_point":
            strong.add(frozenset([e["source"], e["target"]]))
    edges = [
        e for e in edges
        if e["kind"] != "description_hint" or frozenset([e["source"], e["target"]]) not in strong
    ]

    return {"nodes": nodes, "edges": edges}
