import hashlib
from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..models import Import, ImportStatus, Snapshot, StagedImport, Workspace
from ..schemas import ImportAccepted, ImportDetailOut, ImportOut
from ..services import jobs, staging
from ..services.importer import (
    ImportError_,
    collect_candidates,
    process_candidates,
    run_import,
)
from ..services.staging import build_proposal
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


@router.post(
    "/workspaces/{workspace_id}/imports/preview",
    summary="Stage an upload and return the proposed snapshot grouping",
)
async def preview_import(
    file: UploadFile = File(...),
    snapshot_name: str | None = Form(default=None),
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
    log: list[dict] = []
    try:
        candidates, source_type = collect_candidates(filename, data, log)
    except ImportError_ as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if not candidates:
        raise HTTPException(status_code=422,
                            detail="No usable configuration files found in the upload.")

    proposal = build_proposal(
        candidates, snapshot_name, _default_snapshot_name(db, workspace.id, filename)
    )
    proposal["skipped"] = [e["message"] for e in log]
    staged = StagedImport(
        workspace_id=workspace.id,
        original_filename=filename,
        data=data,
        source_type=source_type,
        proposal=proposal,
    )
    db.add(staged)
    db.flush()
    return {"staged_import_id": staged.id, **proposal}


class ConfirmGroup(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    file_paths: list[str]
    effective_at: str | None = None


class ConfirmPayload(BaseModel):
    groups: list[ConfirmGroup] = Field(min_length=1)
    excluded: list[str] = []


@router.post(
    "/imports/staged/{staged_id}/confirm",
    status_code=202,
    summary="Commit a staged import with the user's (possibly corrected) grouping",
)
def confirm_import(staged_id: str, payload: ConfirmPayload, db: Session = Depends(get_db)):
    staged = db.get(StagedImport, staged_id)
    if staged is None:
        raise HTTPException(status_code=404, detail="Staged import not found (or expired)")

    known_paths = {f["path"] for g in staged.proposal.get("groups", []) for f in g["files"]}
    requested = [p for g in payload.groups for p in g.file_paths]
    unknown = set(requested) - known_paths
    if unknown:
        raise HTTPException(status_code=422,
                            detail=f"Unknown file paths in grouping: {sorted(unknown)[:5]}")
    dupes = {p for p in requested if requested.count(p) > 1}
    if dupes:
        raise HTTPException(status_code=422,
                            detail=f"File assigned to more than one snapshot: {sorted(dupes)[:5]}")
    names = [g.name for g in payload.groups]
    if len(set(names)) != len(names):
        raise HTTPException(status_code=422, detail="Snapshot names must be unique")
    for group in payload.groups:
        if not group.file_paths:
            raise HTTPException(status_code=422,
                                detail=f"Snapshot '{group.name}' has no files")
        existing = db.execute(
            select(Snapshot).where(Snapshot.workspace_id == staged.workspace_id,
                                   Snapshot.display_name == group.name)
        ).scalar()
        if existing:
            raise HTTPException(status_code=409,
                                detail=f"A snapshot named '{group.name}' already exists")

    data = staged.data
    workspace_id = staged.workspace_id
    filename = staged.original_filename
    source_type = staged.source_type
    excluded = set(payload.excluded)

    results = []
    for group in payload.groups:
        wanted = set(group.file_paths) - excluded
        if not wanted:
            continue
        import_record = Import(
            workspace_id=workspace_id,
            original_filename=f"{filename} → {group.name}",
            source_type=source_type,
            file_hash="",
            log=[{"level": "info",
                  "message": f"Created from staged import with user-confirmed grouping "
                             f"({len(wanted)} file(s); {len(excluded)} excluded overall)."}],
        )
        db.add(import_record)
        db.commit()
        import_id = import_record.id
        group_name = group.name
        effective = staging.parse_effective_at(group.effective_at)

        def work(session: Session, _import_id=import_id, _wanted=frozenset(wanted),
                 _name=group_name, _effective=effective) -> dict:
            record = session.get(Import, _import_id)
            assert record is not None
            record.status = ImportStatus.running.value
            record.file_hash = hashlib.sha256(data).hexdigest()
            log: list[dict] = list(record.log or [])
            try:
                candidates, _ = collect_candidates(record.original_filename.split(" → ")[0],
                                                   data, log)
                chosen = [c for c in candidates if c.relative_path in _wanted]
                snapshot = process_candidates(session, record, chosen, _name,
                                              effective_at=_effective, log=log)
            except Exception as exc:
                session.rollback()
                record = session.get(Import, _import_id)
                assert record is not None
                record.status = ImportStatus.failed.value
                record.error_count = (record.error_count or 0) + 1
                record.log = [*(record.log or []),
                              *getattr(exc, "log_entries", []),
                              {"level": "error", "message": str(exc)}]
                session.commit()
                raise
            session.commit()
            return {"import_id": _import_id, "snapshot_id": snapshot.id,
                    "snapshot_name": _name, "device_count": snapshot.device_count}

        job = jobs.submit_job(db, "import", work)
        results.append({"import_id": import_id, "job_id": job.id, "snapshot_name": group_name})

    db.delete(staged)
    db.commit()
    return {"results": results}


@router.get("/imports/{import_id}", response_model=ImportDetailOut)
def read_import(import_id: str, db: Session = Depends(get_db)):
    record = db.get(Import, import_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Import not found")
    return record
