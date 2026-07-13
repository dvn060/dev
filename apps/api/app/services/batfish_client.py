"""Batfish integration (optional at runtime).

Batfish is the authoritative engine for routing/ACL/forwarding behavior.
This module keeps all pybatfish specifics behind a small interface so:
* the application starts and works (in degraded mode) without Batfish or
  pybatfish installed;
* analysis results carry enough structure for the evidence mapper to link
  Batfish trace elements back to exact configuration lines.

Nothing here ever contacts anything but the configured Batfish host, which in
the shipped docker-compose is a local container.
"""

from __future__ import annotations

import logging
import re
import tempfile
import time
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..models import Device, Snapshot

logger = logging.getLogger(__name__)

_availability_cache: dict[str, Any] = {"checked_at": 0.0, "available": False, "detail": ""}
_AVAILABILITY_TTL_SECONDS = 30.0


def _pybatfish_session():
    from pybatfish.client.session import Session as BfSession  # imported lazily

    return BfSession(host=settings.batfish_host, port_v2=settings.batfish_port)


def batfish_status(force: bool = False) -> dict[str, Any]:
    """Cheap cached availability probe. Never raises."""
    now = time.monotonic()
    if not force and now - _availability_cache["checked_at"] < _AVAILABILITY_TTL_SECONDS:
        return dict(_availability_cache)
    _availability_cache["checked_at"] = now
    if not settings.batfish_enabled:
        _availability_cache.update(available=False, detail="Batfish disabled by configuration.")
        return dict(_availability_cache)
    try:
        import pybatfish  # noqa: F401
    except ImportError:
        _availability_cache.update(
            available=False,
            detail="pybatfish is not installed; behavioral analysis unavailable.",
        )
        return dict(_availability_cache)
    try:
        _pybatfish_session()
        _availability_cache.update(
            available=True,
            detail=f"Batfish reachable at {settings.batfish_host}:{settings.batfish_port}.",
        )
    except Exception as exc:
        _availability_cache.update(
            available=False,
            detail=f"Batfish not reachable at {settings.batfish_host}:{settings.batfish_port}: {exc}",
        )
    return dict(_availability_cache)


def _materialize_snapshot(db: Session, snapshot: Snapshot, dest: Path) -> int:
    """Write stored device configs to a Batfish snapshot directory layout."""
    configs_dir = dest / "configs"
    configs_dir.mkdir(parents=True, exist_ok=True)
    devices = (
        db.execute(select(Device).where(Device.snapshot_id == snapshot.id)).scalars().all()
    )
    for device in devices:
        # No dots in the allowed set: a hostname like "../../x" must not be
        # able to influence the written path.
        safe_name = re.sub(r"[^A-Za-z0-9_-]", "_", device.hostname)
        (configs_dir / f"{safe_name}.cfg").write_text(device.raw_config, encoding="utf-8")
    return len(devices)


def _ensure_snapshot(bf, db: Session, snapshot: Snapshot) -> str:
    """Initialize the snapshot in Batfish if absent (idempotent by name).
    The Batfish network is scoped per workspace. Returns the snapshot name."""
    network_name = f"ne_{snapshot.workspace_id}"
    snapshot_name = f"snap_{snapshot.id}"
    bf.set_network(network_name)

    existing = []
    try:
        existing = bf.list_snapshots()
    except Exception:
        pass

    if snapshot_name not in existing:
        with tempfile.TemporaryDirectory(prefix="ne_bf_") as tmp:
            count = _materialize_snapshot(db, snapshot, Path(tmp))
            if count == 0:
                raise RuntimeError("Snapshot has no device configurations.")
            bf.init_snapshot(str(tmp), name=snapshot_name, overwrite=True)
            snapshot.batfish_snapshot_name = snapshot_name
    return snapshot_name


def run_traceroute(
    db: Session,
    snapshot: Snapshot,
    src_ip: str,
    dst_ip: str,
    protocol: str,
    dst_port: int | None,
    src_port: int | None,
    start_location: str,
) -> dict[str, Any]:
    """Initialize the snapshot in Batfish (idempotent by name) and run a
    forward traceroute for the flow.

    Returns {status, traces: [...], parse_warnings: [...]} where each trace is
    {disposition, hops: [{node, steps: [{type, detail, acl_name?}]}]}.
    Raises RuntimeError with a user-readable message on failure.
    """
    from pybatfish.datamodel.flow import HeaderConstraints

    bf = _pybatfish_session()
    snapshot_name = _ensure_snapshot(bf, db, snapshot)
    bf.set_snapshot(snapshot_name)

    # Parse-status issues from Batfish are evidence about analysis coverage.
    parse_warnings: list[str] = []
    try:
        statuses = bf.q.fileParseStatus().answer().frame()
        for _, row in statuses.iterrows():
            if str(row.get("Status", "")).upper() not in ("PASSED", "PARSED"):
                parse_warnings.append(
                    f"Batfish parse status for {row.get('File_Name')}: {row.get('Status')}"
                )
    except Exception as exc:
        parse_warnings.append(f"Could not read Batfish parse status: {exc}")

    headers = HeaderConstraints(
        srcIps=src_ip,
        dstIps=dst_ip,
        ipProtocols=[protocol.upper()] if protocol != "ip" else None,
        dstPorts=str(dst_port) if dst_port is not None else None,
        srcPorts=str(src_port) if src_port is not None else None,
    )
    answer = bf.q.traceroute(startLocation=start_location, headers=headers).answer()
    frame = answer.frame()

    traces_out = _extract_traces(frame)
    return {"status": "ok", "traces": traces_out, "parse_warnings": parse_warnings}


def _extract_traces(frame, column: str = "Traces") -> list[dict]:
    """Convert a pybatfish trace column into plain dicts (shape observed
    against the live service; see fixtures/README.md for verified output)."""
    traces_out: list[dict] = []
    for _, row in frame.iterrows():
        for trace in row.get(column) or []:
            hops_out = []
            for hop in trace.hops:
                steps_out = []
                for step in hop.steps:
                    detail = getattr(step, "detail", None)
                    # Observed pybatfish behavior: steps are plain `Step` objects;
                    # the *detail* object carries the typed class (e.g.
                    # FilterStepDetail, RoutingStepDetail).
                    step_info: dict[str, Any] = {
                        "type": type(detail).__name__.replace("StepDetail", "")
                        if detail is not None else "Step",
                        "action": getattr(step, "action", None),
                        "detail": str(detail) if detail is not None else "",
                    }
                    # Filter steps expose the ACL ("filter") name — the hook for
                    # mapping a Batfish decision back to configuration lines.
                    filter_name = getattr(detail, "filter", None) or getattr(
                        detail, "filterName", None
                    )
                    if filter_name:
                        step_info["acl_name"] = str(filter_name)
                    routes = getattr(detail, "routes", None)
                    if routes:
                        step_info["routes"] = [str(r) for r in routes]
                    steps_out.append(step_info)
                hops_out.append({"node": str(hop.node), "steps": steps_out})
            traces_out.append({"disposition": str(trace.disposition), "hops": hops_out})

    return traces_out


def run_differential_reachability(
    db: Session,
    base: Snapshot,
    target: Snapshot,
    src_ip: str | None = None,
    dst_ip: str | None = None,
    protocol: str | None = None,
    dst_port: int | None = None,
) -> dict[str, Any]:
    """Batfish differential reachability: flows whose forwarding outcome
    differs between two snapshots of the same workspace.

    This is the engine-computed answer to "what did this change break?" —
    fundamentally different from the config-diff heuristic in diff.py.
    Returns {status, flows: [{...flow, reference_dispositions,
    snapshot_dispositions, snapshot_traces, reference_traces}]}.
    """
    from pybatfish.datamodel.flow import HeaderConstraints

    if base.workspace_id != target.workspace_id:
        raise RuntimeError("Snapshots must belong to the same workspace.")

    bf = _pybatfish_session()
    base_name = _ensure_snapshot(bf, db, base)
    target_name = _ensure_snapshot(bf, db, target)

    header_kwargs: dict[str, Any] = {}
    if src_ip:
        header_kwargs["srcIps"] = src_ip
    if dst_ip:
        header_kwargs["dstIps"] = dst_ip
    if protocol and protocol != "ip":
        header_kwargs["ipProtocols"] = [protocol.upper()]
    if dst_port is not None:
        header_kwargs["dstPorts"] = str(dst_port)

    question = bf.q.differentialReachability(
        headers=HeaderConstraints(**header_kwargs) if header_kwargs else None
    )
    frame = question.answer(snapshot=target_name, reference_snapshot=base_name).frame()

    flows_out: list[dict] = []
    for _, row in frame.iterrows():
        flow = row.get("Flow")
        snap_traces = _extract_traces(frame.loc[[row.name]], column="Snapshot_Traces")
        ref_traces = _extract_traces(frame.loc[[row.name]], column="Reference_Traces")
        flows_out.append({
            "flow": str(flow),
            "src_ip": str(getattr(flow, "srcIp", "")),
            "dst_ip": str(getattr(flow, "dstIp", "")),
            "ip_protocol": str(getattr(flow, "ipProtocol", "")),
            "dst_port": getattr(flow, "dstPort", None),
            "start_location": str(getattr(flow, "ingressNode", "") or "")
            + (f"[{getattr(flow, 'ingressInterface', '')}]"
               if getattr(flow, "ingressInterface", None) else ""),
            "reference_dispositions": sorted({t["disposition"] for t in ref_traces}),
            "snapshot_dispositions": sorted({t["disposition"] for t in snap_traces}),
            "reference_traces": ref_traces,
            "snapshot_traces": snap_traces,
        })

    return {"status": "ok", "flows": flows_out}
