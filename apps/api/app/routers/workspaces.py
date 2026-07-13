from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Workspace
from ..schemas import WorkspaceCreate, WorkspaceOut, WorkspaceUpdate

router = APIRouter(prefix="/api/workspaces", tags=["workspaces"])


def get_workspace(workspace_id: str, db: Session = Depends(get_db)) -> Workspace:
    workspace = db.get(Workspace, workspace_id)
    if workspace is None:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return workspace


@router.get("", response_model=list[WorkspaceOut])
def list_workspaces(db: Session = Depends(get_db)):
    return db.execute(select(Workspace).order_by(Workspace.created_at)).scalars().all()


@router.post("", response_model=WorkspaceOut, status_code=201)
def create_workspace(payload: WorkspaceCreate, db: Session = Depends(get_db)):
    existing = db.execute(select(Workspace).where(Workspace.name == payload.name)).scalar()
    if existing:
        raise HTTPException(status_code=409, detail="A workspace with that name already exists")
    workspace = Workspace(name=payload.name, description=payload.description)
    db.add(workspace)
    # Explicit commit: dependency teardown commits only AFTER the response is
    # sent, so a client using the new id immediately could race it.
    db.commit()
    return workspace


@router.get("/{workspace_id}", response_model=WorkspaceOut)
def read_workspace(workspace: Workspace = Depends(get_workspace)):
    return workspace


@router.patch("/{workspace_id}", response_model=WorkspaceOut)
def update_workspace(
    payload: WorkspaceUpdate,
    workspace: Workspace = Depends(get_workspace),
    db: Session = Depends(get_db),
):
    if payload.name is not None:
        workspace.name = payload.name
    if payload.description is not None:
        workspace.description = payload.description
    db.commit()
    return workspace


@router.delete("/{workspace_id}", status_code=204)
def delete_workspace(workspace: Workspace = Depends(get_workspace), db: Session = Depends(get_db)):
    db.delete(workspace)
    db.commit()
