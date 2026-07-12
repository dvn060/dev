import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Device, Snapshot, Workspace
from ..schemas import (
    DeviceSummaryOut,
    DifferentialQuery,
    PathQuery,
    SnapshotOut,
    SnapshotUpdate,
)
from ..services.batfish_client import batfish_status, run_differential_reachability
from ..services.diff import compare_snapshots, rank_suspects
from ..services.pathfinder import analyze_path
from ..services.report import render_snapshot_report
from ..services.topology import build_topology
from .workspaces import get_workspace

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["snapshots"])


def get_snapshot(snapshot_id: str, db: Session = Depends(get_db)) -> Snapshot:
    snapshot = db.get(Snapshot, snapshot_id)
    if snapshot is None:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    return snapshot


@router.get("/workspaces/{workspace_id}/snapshots", response_model=list[SnapshotOut])
def list_snapshots(workspace: Workspace = Depends(get_workspace), db: Session = Depends(get_db)):
    return (
        db.execute(
            select(Snapshot)
            .where(Snapshot.workspace_id == workspace.id)
            .order_by(Snapshot.effective_at)
        ).scalars().all()
    )


@router.get("/snapshots/{snapshot_id}", response_model=SnapshotOut)
def read_snapshot(snapshot: Snapshot = Depends(get_snapshot)):
    return snapshot


@router.patch("/snapshots/{snapshot_id}", response_model=SnapshotOut)
def update_snapshot(
    payload: SnapshotUpdate,
    snapshot: Snapshot = Depends(get_snapshot),
    db: Session = Depends(get_db),
):
    if payload.display_name is not None:
        snapshot.display_name = payload.display_name
    if payload.notes is not None:
        snapshot.notes = payload.notes
    db.flush()
    return snapshot


@router.delete("/snapshots/{snapshot_id}", status_code=204)
def delete_snapshot(snapshot: Snapshot = Depends(get_snapshot), db: Session = Depends(get_db)):
    db.delete(snapshot)


@router.get("/snapshots/{snapshot_id}/devices", response_model=list[DeviceSummaryOut])
def list_devices(snapshot: Snapshot = Depends(get_snapshot), db: Session = Depends(get_db)):
    return (
        db.execute(
            select(Device)
            .where(Device.snapshot_id == snapshot.id)
            .order_by(Device.hostname)
        ).scalars().all()
    )


@router.get("/snapshots/{snapshot_id}/topology")
def snapshot_topology(snapshot: Snapshot = Depends(get_snapshot), db: Session = Depends(get_db)):
    return build_topology(db, snapshot.id)


@router.get("/snapshots/{snapshot_id}/report")
def snapshot_report(
    redacted: bool = True,
    snapshot: Snapshot = Depends(get_snapshot),
    db: Session = Depends(get_db),
):
    """Standalone HTML report. Secrets are redacted unless the caller
    explicitly requests ?redacted=false."""
    html_text = render_snapshot_report(db, snapshot, redacted=redacted)
    filename = f"{snapshot.display_name}-report.html".replace(" ", "_")
    return Response(
        content=html_text,
        media_type="text/html",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.get("/snapshots/{snapshot_id}/search")
def search_snapshot(
    q: str = Query(min_length=2, max_length=200),
    snapshot: Snapshot = Depends(get_snapshot),
    db: Session = Depends(get_db),
):
    """Full-text search across raw configuration lines. Returns evidence-shaped
    hits: device + line number + text, ready for the evidence viewer."""
    devices = (
        db.execute(select(Device).where(Device.snapshot_id == snapshot.id)).scalars().all()
    )
    needle = q.lower()
    hits = []
    for device in devices:
        # Search over redacted content: secret values must be unfindable and
        # unleakable through search results.
        for idx, line in enumerate(device.redacted_config.splitlines(), start=1):
            if needle in line.lower():
                hits.append({
                    "device_id": device.id,
                    "hostname": device.hostname,
                    "line": idx,
                    "text": line,
                })
                if len(hits) >= 500:
                    return {"query": q, "truncated": True, "hits": hits}
    return {"query": q, "truncated": False, "hits": hits}


@router.post("/snapshots/{snapshot_id}/path-analysis")
def path_analysis(
    payload: PathQuery,
    snapshot: Snapshot = Depends(get_snapshot),
    db: Session = Depends(get_db),
):
    return analyze_path(
        db, snapshot,
        src_ip=payload.src_ip, dst_ip=payload.dst_ip,
        protocol=payload.protocol, dst_port=payload.dst_port, src_port=payload.src_port,
    )


@router.get("/workspaces/{workspace_id}/diff")
def workspace_diff(
    base: str,
    target: str,
    workspace: Workspace = Depends(get_workspace),
    db: Session = Depends(get_db),
):
    base_snap = db.get(Snapshot, base)
    target_snap = db.get(Snapshot, target)
    for snap, label in ((base_snap, "base"), (target_snap, "target")):
        if snap is None or snap.workspace_id != workspace.id:
            raise HTTPException(status_code=404, detail=f"{label} snapshot not found in workspace")
    assert base_snap is not None and target_snap is not None
    return compare_snapshots(db, base_snap, target_snap)


@router.post("/workspaces/{workspace_id}/diff/reachability")
def diff_reachability(
    base: str,
    target: str,
    payload: DifferentialQuery | None = None,
    workspace: Workspace = Depends(get_workspace),
    db: Session = Depends(get_db),
):
    """Batfish differential reachability: engine-computed flows whose outcome
    differs between the two snapshots. This is the authoritative answer to
    'what did this change break?'. Requires the analysis engine."""
    base_snap = db.get(Snapshot, base)
    target_snap = db.get(Snapshot, target)
    for snap, label in ((base_snap, "base"), (target_snap, "target")):
        if snap is None or snap.workspace_id != workspace.id:
            raise HTTPException(status_code=404, detail=f"{label} snapshot not found in workspace")
    assert base_snap is not None and target_snap is not None

    status = batfish_status()
    if not status["available"]:
        return {
            "status": "unavailable",
            "batfish": status,
            "flows": [],
            "note": (
                "Batfish is not available, so no differential reachability could be "
                "computed. The heuristic change ranking (temporal correlation only) "
                "is the only fallback."
            ),
        }
    q = payload or DifferentialQuery()
    try:
        result = run_differential_reachability(
            db, base_snap, target_snap,
            src_ip=q.src_ip, dst_ip=q.dst_ip, protocol=q.protocol, dst_port=q.dst_port,
        )
    except Exception as exc:
        logger.exception("Differential reachability failed")
        raise HTTPException(status_code=502, detail=f"Batfish analysis failed: {exc}") from exc
    return {
        "status": "ok",
        "batfish": status,
        "base_snapshot": {"id": base_snap.id, "name": base_snap.display_name},
        "target_snapshot": {"id": target_snap.id, "name": target_snap.display_name},
        "flows": result["flows"],
        "note": (
            "Flows computed by Batfish whose forwarding outcome differs between the "
            "two snapshots (reference = base). An empty list means the engine found "
            "no behavioral difference for the queried header space."
        ),
    }


@router.post("/workspaces/{workspace_id}/diff/suspects")
def diff_suspects(
    payload: PathQuery,
    base: str,
    target: str,
    workspace: Workspace = Depends(get_workspace),
    db: Session = Depends(get_db),
):
    """FALLBACK: rank config changes by plausibility of having broken the
    given flow. This is temporal correlation over the config diff only — not
    a behavioral analysis. Prefer /diff/reachability (Batfish) when the
    engine is available."""
    base_snap = db.get(Snapshot, base)
    target_snap = db.get(Snapshot, target)
    for snap, label in ((base_snap, "base"), (target_snap, "target")):
        if snap is None or snap.workspace_id != workspace.id:
            raise HTTPException(status_code=404, detail=f"{label} snapshot not found in workspace")
    assert base_snap is not None and target_snap is not None
    comparison = compare_snapshots(db, base_snap, target_snap)
    suspects = rank_suspects(
        comparison["changes"],
        src_ip=payload.src_ip, dst_ip=payload.dst_ip,
        protocol=payload.protocol, dst_port=payload.dst_port,
    )
    return {
        "base_snapshot": comparison["base_snapshot"],
        "target_snapshot": comparison["target_snapshot"],
        "query": payload.model_dump(),
        "total_changes": len(comparison["changes"]),
        "suspects": suspects,
        "note": (
            "Fallback heuristic: ranks configuration changes by temporal correlation "
            "with the broken flow only — which changes touched objects matching this "
            "flow between the two snapshots. It does not simulate forwarding and can "
            "be wrong in both directions. When the analysis engine is available, "
            "differential reachability (/diff/reachability) is the authoritative answer."
        ),
    }
