from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import branding
from ..db import get_db
from ..models import Job
from ..schemas import HealthOut, JobOut
from ..services.batfish_client import batfish_status

router = APIRouter(prefix="/api", tags=["misc"])

API_VERSION = "0.1.0"


@router.get("/health", response_model=HealthOut)
def health():
    return HealthOut(
        status="ok",
        product=branding.PRODUCT_NAME,
        version=API_VERSION,
        batfish=batfish_status(),
    )


@router.get("/jobs/{job_id}", response_model=JobOut)
def read_job(job_id: str, db: Session = Depends(get_db)):
    job = db.get(Job, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job
