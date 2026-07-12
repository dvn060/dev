import io
import zipfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

FIXTURES = Path(__file__).resolve().parents[3] / "fixtures"


@pytest.fixture()
def client(tmp_path, monkeypatch):
    """App wired to a throwaway SQLite database, synchronous jobs, no Batfish."""
    from app import db as db_module
    from app.config import settings

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(settings, "database_url", f"sqlite:///{tmp_path / 'test.db'}")
    monkeypatch.setattr(settings, "jobs_sync", True)
    monkeypatch.setattr(settings, "batfish_enabled", False)
    db_module.reset_engine_for_tests()

    from app.main import app

    with TestClient(app) as test_client:
        yield test_client
    db_module.reset_engine_for_tests()


def fixture_config(snapshot: str, name: str) -> str:
    return (FIXTURES / "cisco" / snapshot / name).read_text()


def build_archive_bytes(snapshot: str, stamp: str = "2024-05-01_020000") -> bytes:
    """NCM-style zip built in memory from the plain fixture configs."""
    buf = io.BytesIO()
    src = FIXTURES / "cisco" / snapshot
    with zipfile.ZipFile(buf, "w") as zf:
        for cfg in sorted(src.glob("*.cfg")):
            device = cfg.stem
            zf.writestr(f"{device}/{device}-Running-{stamp}.cfg", cfg.read_text())
    return buf.getvalue()


def import_snapshot(client, workspace_id: str, snapshot: str, name: str,
                    stamp: str = "2024-05-01_020000") -> str:
    """Upload a fixture archive and return the created snapshot id."""
    resp = client.post(
        f"/api/workspaces/{workspace_id}/imports",
        files={"file": (f"{name}.zip", build_archive_bytes(snapshot, stamp), "application/zip")},
        data={"snapshot_name": name},
    )
    assert resp.status_code == 202, resp.text
    job_id = resp.json()["job_id"]
    job = client.get(f"/api/jobs/{job_id}").json()
    assert job["status"] == "done", job
    return job["result"]["snapshot_id"]


@pytest.fixture()
def workspace_id(client) -> str:
    resp = client.post("/api/workspaces", json={"name": "Lab", "description": "test lab"})
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]
