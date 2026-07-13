"""Minimal background-job abstraction backed by a thread pool + jobs table.

Imports and analysis run through this so the HTTP layer never blocks on long
work. With NE_JOBS_SYNC=true (tests, simple deployments) jobs execute inline
before the response returns, which keeps the API contract identical.
"""

from __future__ import annotations

import logging
import threading
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor

from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_sessionmaker
from ..models import Job, utcnow

logger = logging.getLogger(__name__)

_executor: ThreadPoolExecutor | None = None
_lock = threading.Lock()


def _get_executor() -> ThreadPoolExecutor:
    global _executor
    with _lock:
        if _executor is None:
            _executor = ThreadPoolExecutor(
                max_workers=settings.jobs_max_workers, thread_name_prefix="ne-job"
            )
    return _executor


def submit_job(db: Session, kind: str, work: Callable[[Session], dict]) -> Job:
    """Create a Job row and run `work` (which receives its own session).

    `work` returns a JSON-serializable result dict stored on the job.
    """
    job = Job(kind=kind, status="pending")
    db.add(job)
    db.commit()

    job_id = job.id

    def _run() -> None:
        session = get_sessionmaker()()
        try:
            record = session.get(Job, job_id)
            assert record is not None
            record.status = "running"
            session.commit()
            result = work(session)
            record = session.get(Job, job_id)
            assert record is not None
            record.status = "done"
            record.result = result
            record.finished_at = utcnow()
            session.commit()
        except Exception as exc:
            logger.exception("Job %s (%s) failed", job_id, kind)
            session.rollback()
            record = session.get(Job, job_id)
            assert record is not None
            record.status = "failed"
            record.error = str(exc)
            record.finished_at = utcnow()
            session.commit()
        finally:
            session.close()

    if settings.jobs_sync:
        _run()
        db.expire_all()
    else:
        _get_executor().submit(_run)
    return job


def recover_interrupted(session: Session) -> int:
    """Startup sweep: any job/import still marked pending/running was
    interrupted by a shutdown or crash. Their transactions never committed
    (no partial snapshots survive), but the status rows would otherwise show
    'running' forever. Mark them failed with an honest message."""
    from ..models import Import, ImportStatus, StagedImport
    from ..models import utcnow as now

    message = "Interrupted by application shutdown or crash before completing."
    count = 0
    for job in session.query(Job).filter(Job.status.in_(("pending", "running"))).all():
        job.status = "failed"
        job.error = message
        job.finished_at = now()
        count += 1
    for record in session.query(Import).filter(
        Import.status.in_((ImportStatus.pending.value, ImportStatus.running.value))
    ).all():
        record.status = ImportStatus.failed.value
        record.error_count = (record.error_count or 0) + 1
        record.log = [*(record.log or []), {"level": "error", "message": message}]
        count += 1
    # Staged (unconfirmed) uploads older than a day are abandoned wizards.
    from datetime import UTC, datetime, timedelta
    cutoff = datetime.now(UTC) - timedelta(days=1)
    for staged in session.query(StagedImport).all():
        created = staged.created_at
        if created.tzinfo is None:
            created = created.replace(tzinfo=UTC)
        if created < cutoff:
            session.delete(staged)
    session.commit()
    if count:
        logger.warning("Startup recovery: marked %d interrupted job(s)/import(s) as failed",
                       count)
    return count


def shutdown() -> None:
    global _executor
    with _lock:
        if _executor is not None:
            _executor.shutdown(wait=False, cancel_futures=True)
            _executor = None
