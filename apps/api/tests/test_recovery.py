"""Startup recovery: interrupted jobs/imports are marked failed, honestly."""

from datetime import UTC, datetime, timedelta


def test_interrupted_work_is_marked_failed_on_startup(client, workspace_id):
    from app.db import get_sessionmaker
    from app.models import Import, Job, StagedImport
    from app.services.jobs import recover_interrupted

    session = get_sessionmaker()()
    try:
        # Simulate rows left behind by a crash mid-work
        job = Job(kind="import", status="running")
        session.add(job)
        record = Import(workspace_id=workspace_id, original_filename="x.zip",
                        source_type="archive", file_hash="", status="running", log=[])
        session.add(record)
        stale = StagedImport(workspace_id=workspace_id, original_filename="old.zip",
                             data=b"x", proposal={},
                             created_at=datetime.now(UTC) - timedelta(days=2))
        fresh = StagedImport(workspace_id=workspace_id, original_filename="new.zip",
                             data=b"x", proposal={})
        session.add_all([stale, fresh])
        session.commit()
        job_id, import_id = job.id, record.id
        stale_id, fresh_id = stale.id, fresh.id

        count = recover_interrupted(session)
        assert count == 2

        job = session.get(Job, job_id)
        assert job.status == "failed"
        assert "Interrupted" in job.error

        record = session.get(Import, import_id)
        assert record.status == "failed"
        assert any("Interrupted" in e["message"] for e in record.log)

        # abandoned wizard uploads swept; fresh ones kept
        assert session.get(StagedImport, stale_id) is None
        assert session.get(StagedImport, fresh_id) is not None
    finally:
        session.close()

    # the failure is visible through the API like any other failed import
    imports = client.get(f"/api/workspaces/{workspace_id}/imports").json()
    assert any(i["status"] == "failed" for i in imports)
