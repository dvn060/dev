from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Device, Snapshot, Workspace
from ..schemas import (
    DeviceSummaryOut,
    PathQuery,
    SnapshotOut,
    SnapshotUpdate,
)
from ..services.diff import compare_snapshots, rank_suspects
from ..services.pathfinder import analyze_path
from ..services.topology import build_topology
from .workspaces import get_workspace

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
        for idx, line in enumerate(device.raw_config.splitlines(), start=1):
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


@router.post("/workspaces/{workspace_id}/diff/suspects")
def diff_suspects(
    payload: PathQuery,
    base: str,
    target: str,
    workspace: Workspace = Depends(get_workspace),
    db: Session = Depends(get_db),
):
    """Rank the changes between two snapshots by likelihood of having broken
    the given flow. Heuristic; results are labeled confidence=inferred."""
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
            "Ranking is a deterministic heuristic over configuration changes. "
            "It prioritizes investigation; it is not a forwarding simulation. "
            "Use path analysis on both snapshots for a Batfish-computed verdict."
        ),
    }
