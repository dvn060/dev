from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..models import Import, ImportStatus, Snapshot, Workspace
from ..schemas import ImportAccepted, ImportDetailOut, ImportOut
from ..services import jobs
from ..services.importer import run_import
from .workspaces import get_workspace

router = APIRouter(prefix="/api", tags=["imports"])


@router.get("/workspaces/{workspace_id}/imports", response_model=list[ImportOut])
def list_imports(workspace: Workspace = Depends(get_workspace), db: Session = Depends(get_db)):
    return (
        db.execute(
            select(Import)
            .where(Import.workspace_id == workspace.id)
            .order_by(Import.imported_at.desc())
        ).scalars().all()
    )


@router.post(
    "/workspaces/{workspace_id}/imports",
    response_model=ImportAccepted,
    status_code=202,
    summary="Upload a configuration file or NCM archive (zip)",
)
async def create_import(
    file: UploadFile = File(...),
    snapshot_name: str | None = Form(default=None),
    effective_at: datetime | None = Form(default=None),
    workspace: Workspace = Depends(get_workspace),
    db: Session = Depends(get_db),
):
    data = await file.read()
    if len(data) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    if len(data) > settings.max_upload_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"Upload exceeds the {settings.max_upload_bytes // (1024 * 1024)} MiB limit",
        )

    filename = file.filename or "upload"
    name = snapshot_name or _default_snapshot_name(db, workspace.id, filename)
    if db.execute(
        select(Snapshot).where(
            Snapshot.workspace_id == workspace.id, Snapshot.display_name == name
        )
    ).scalar():
        raise HTTPException(status_code=409,
                            detail=f"A snapshot named '{name}' already exists in this workspace")

    import_record = Import(
        workspace_id=workspace.id,
        original_filename=filename,
        source_type="pending",
        file_hash="",
        log=[],
    )
    db.add(import_record)
    db.commit()
    import_id = import_record.id
    workspace_id = workspace.id

    def work(session: Session) -> dict:
        record = session.get(Import, import_id)
        assert record is not None
        try:
            snapshot = run_import(session, record, data, name, effective_at)
        except Exception as exc:
            # Roll back any partial snapshot/device rows, then persist the
            # failure on the import record so nothing is left half-imported.
            session.rollback()
            record = session.get(Import, import_id)
            assert record is not None
            record.status = ImportStatus.failed.value
            record.error_count = (record.error_count or 0) + 1
            # ImportError_ carries the audit log collected before the failure
            # (skip decisions etc.) so the rollback doesn't erase it.
            pre_failure_log = getattr(exc, "log_entries", [])
            record.log = [
                *(record.log or []),
                *pre_failure_log,
                {"level": "error", "message": str(exc)},
            ]
            session.commit()
            raise
        session.commit()
        return {
            "import_id": import_id,
            "workspace_id": workspace_id,
            "snapshot_id": snapshot.id,
            "device_count": snapshot.device_count,
        }

    job = jobs.submit_job(db, "import", work)
    return ImportAccepted(import_id=import_id, job_id=job.id, snapshot_name=name)


def _default_snapshot_name(db: Session, workspace_id: str, filename: str) -> str:
    stem = filename.rsplit("/", 1)[-1]
    for ext in (".zip", ".cfg", ".txt", ".conf", ".config"):
        if stem.lower().endswith(ext):
            stem = stem[: -len(ext)]
            break
    base = stem or "snapshot"
    name = base
    n = 2
    while db.execute(
        select(Snapshot).where(
            Snapshot.workspace_id == workspace_id, Snapshot.display_name == name
        )
    ).scalar():
        name = f"{base} ({n})"
        n += 1
    return name


@router.get("/imports/{import_id}", response_model=ImportDetailOut)
def read_import(import_id: str, db: Session = Depends(get_db)):
    record = db.get(Import, import_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Import not found")
    return record
