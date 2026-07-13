"""FastAPI application entry point."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import branding
from .config import settings
from .db import get_engine, get_sessionmaker
from .logging_setup import setup_logging
from .models import Base
from .routers import devices, imports, misc, snapshots, workspaces
from .services import jobs


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging(settings.log_level)
    # Alembic owns schema migration in deployments; create_all covers fresh
    # databases (first run, tests) and is a no-op when tables exist.
    Base.metadata.create_all(get_engine())
    # Anything still marked running was interrupted by the previous shutdown.
    session = get_sessionmaker()()
    try:
        jobs.recover_interrupted(session)
    finally:
        session.close()
    yield
    jobs.shutdown()


app = FastAPI(
    title=f"{branding.PRODUCT_NAME} API",
    description=branding.PRODUCT_TAGLINE,
    version=misc.API_VERSION,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(misc.router)
app.include_router(workspaces.router)
app.include_router(imports.router)
app.include_router(snapshots.router)
app.include_router(devices.router)
