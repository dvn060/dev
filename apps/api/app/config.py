"""Application settings.

All settings can be overridden with environment variables prefixed with NE_
(e.g. NE_DATABASE_URL). See /.env.example at the repository root.
"""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="NE_", env_file=".env", extra="ignore")

    # Storage
    data_dir: Path = Path("./data")
    database_url: str = ""  # derived from data_dir when empty

    # Batfish (optional analysis engine)
    batfish_host: str = "localhost"
    batfish_port: int = 9996
    batfish_enabled: bool = True

    # Jobs
    jobs_sync: bool = False  # run jobs inline (used by tests)
    jobs_max_workers: int = 2

    # Server
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:8080"]

    # Uploads
    max_upload_bytes: int = 200 * 1024 * 1024  # 200 MiB

    log_level: str = "INFO"

    @property
    def resolved_database_url(self) -> str:
        if self.database_url:
            return self.database_url
        return f"sqlite:///{self.data_dir / 'network_evidence.db'}"


settings = Settings()
