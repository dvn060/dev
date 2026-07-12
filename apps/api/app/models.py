"""Persistent domain model.

Design notes
------------
* Every extracted network object carries `evidence_lines`: 1-based line numbers
  into the device's raw configuration. Evidence is the core product feature —
  no conclusion should be shown to the user without a route back to the exact
  configuration lines that support it.
* Raw configurations are stored verbatim in SQLite (local-first: nothing ever
  leaves the machine). Batfish snapshots are materialized from the database on
  demand.
* JSON columns hold lists/dicts that do not need relational querying yet
  (evidence line lists, parse warnings, ACL entry details). They can be
  promoted to tables when query patterns require it.
"""

import enum
import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    JSON,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def _uuid() -> str:
    return uuid.uuid4().hex


def utcnow() -> datetime:
    return datetime.now(UTC)


class Base(DeclarativeBase):
    pass


class ImportStatus(enum.StrEnum):
    pending = "pending"
    running = "running"
    completed = "completed"
    completed_with_warnings = "completed_with_warnings"
    failed = "failed"


class AnalysisStatus(enum.StrEnum):
    not_started = "not_started"
    parsing = "parsing"
    parsed = "parsed"
    batfish_ready = "batfish_ready"
    failed = "failed"


class Workspace(Base):
    __tablename__ = "workspaces"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(200), unique=True)
    description: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    imports: Mapped[list["Import"]] = relationship(
        back_populates="workspace", cascade="all, delete-orphan"
    )
    snapshots: Mapped[list["Snapshot"]] = relationship(
        back_populates="workspace", cascade="all, delete-orphan"
    )


class Import(Base):
    __tablename__ = "imports"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    original_filename: Mapped[str] = mapped_column(String(500))
    source_type: Mapped[str] = mapped_column(String(50))  # single_config | archive | ncm_archive
    imported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    file_hash: Mapped[str] = mapped_column(String(64))  # sha256 of uploaded bytes
    status: Mapped[str] = mapped_column(String(40), default=ImportStatus.pending.value)
    warning_count: Mapped[int] = mapped_column(Integer, default=0)
    error_count: Mapped[int] = mapped_column(Integer, default=0)
    # Chronological list of {level, message, context} entries
    log: Mapped[list] = mapped_column(JSON, default=list)

    workspace: Mapped[Workspace] = relationship(back_populates="imports")
    snapshots: Mapped[list["Snapshot"]] = relationship(back_populates="import_record")


class Snapshot(Base):
    __tablename__ = "snapshots"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    import_id: Mapped[str | None] = mapped_column(
        ForeignKey("imports.id", ondelete="SET NULL"), nullable=True
    )
    display_name: Mapped[str] = mapped_column(String(200))
    effective_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    batfish_snapshot_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    analysis_status: Mapped[str] = mapped_column(
        String(40), default=AnalysisStatus.not_started.value
    )
    device_count: Mapped[int] = mapped_column(Integer, default=0)
    warning_count: Mapped[int] = mapped_column(Integer, default=0)
    parse_error_count: Mapped[int] = mapped_column(Integer, default=0)
    # 0.0-1.0: share of configuration content the parser understood, weighted
    # across devices. Displayed to the user; never claim completeness we lack.
    completeness_score: Mapped[float] = mapped_column(Float, default=0.0)
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    workspace: Mapped[Workspace] = relationship(back_populates="snapshots")
    import_record: Mapped[Import | None] = relationship(back_populates="snapshots")
    devices: Mapped[list["Device"]] = relationship(
        back_populates="snapshot", cascade="all, delete-orphan"
    )

    __table_args__ = (UniqueConstraint("workspace_id", "display_name", name="uq_snapshot_name"),)


class Device(Base):
    __tablename__ = "devices"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    snapshot_id: Mapped[str] = mapped_column(
        ForeignKey("snapshots.id", ondelete="CASCADE"), index=True
    )
    hostname: Mapped[str] = mapped_column(String(200), index=True)
    vendor: Mapped[str] = mapped_column(String(50), default="cisco")
    platform: Mapped[str | None] = mapped_column(String(100), nullable=True)
    os_family: Mapped[str] = mapped_column(String(30), default="unknown")  # ios|ios-xe|nx-os|...
    model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    management_ip: Mapped[str | None] = mapped_column(String(45), nullable=True)
    source_filename: Mapped[str] = mapped_column(String(500))
    config_hash: Mapped[str] = mapped_column(String(64))
    parse_status: Mapped[str] = mapped_column(String(30), default="ok")  # ok|partial|failed
    warning_count: Mapped[int] = mapped_column(Integer, default=0)
    parse_warnings: Mapped[list] = mapped_column(JSON, default=list)  # [{line, message}]
    completeness_score: Mapped[float] = mapped_column(Float, default=0.0)
    raw_config: Mapped[str] = mapped_column(Text)

    snapshot: Mapped[Snapshot] = relationship(back_populates="devices")
    interfaces: Mapped[list["Interface"]] = relationship(
        back_populates="device", cascade="all, delete-orphan"
    )
    vlans: Mapped[list["Vlan"]] = relationship(back_populates="device", cascade="all, delete-orphan")
    routes: Mapped[list["StaticRoute"]] = relationship(
        back_populates="device", cascade="all, delete-orphan"
    )
    acls: Mapped[list["Acl"]] = relationship(back_populates="device", cascade="all, delete-orphan")

    __table_args__ = (UniqueConstraint("snapshot_id", "hostname", name="uq_device_hostname"),)


class Interface(Base):
    __tablename__ = "interfaces"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    device_id: Mapped[str] = mapped_column(ForeignKey("devices.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    description: Mapped[str] = mapped_column(Text, default="")
    # layer: "l3" (has IP address / routed), "l2" (switchport), "unknown"
    layer_role: Mapped[str] = mapped_column(String(10), default="unknown")
    admin_state: Mapped[str] = mapped_column(String(10), default="up")  # up|shutdown
    switchport_mode: Mapped[str | None] = mapped_column(String(20), nullable=True)  # access|trunk
    access_vlan: Mapped[int | None] = mapped_column(Integer, nullable=True)
    native_vlan: Mapped[int | None] = mapped_column(Integer, nullable=True)
    trunk_allowed_vlans: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # [{address, prefix_length, secondary}]
    ip_addresses: Mapped[list] = mapped_column(JSON, default=list)
    vrf: Mapped[str | None] = mapped_column(String(100), nullable=True)
    acl_in: Mapped[str | None] = mapped_column(String(200), nullable=True)
    acl_out: Mapped[str | None] = mapped_column(String(200), nullable=True)
    evidence_lines: Mapped[list] = mapped_column(JSON, default=list)

    device: Mapped[Device] = relationship(back_populates="interfaces")

    __table_args__ = (UniqueConstraint("device_id", "name", name="uq_interface_name"),)


class Vlan(Base):
    __tablename__ = "vlans"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    device_id: Mapped[str] = mapped_column(ForeignKey("devices.id", ondelete="CASCADE"), index=True)
    vlan_id: Mapped[int] = mapped_column(Integer)
    name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    evidence_lines: Mapped[list] = mapped_column(JSON, default=list)

    device: Mapped[Device] = relationship(back_populates="vlans")

    __table_args__ = (UniqueConstraint("device_id", "vlan_id", name="uq_vlan_id"),)


class StaticRoute(Base):
    __tablename__ = "static_routes"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    device_id: Mapped[str] = mapped_column(ForeignKey("devices.id", ondelete="CASCADE"), index=True)
    vrf: Mapped[str | None] = mapped_column(String(100), nullable=True)
    prefix: Mapped[str] = mapped_column(String(50))  # e.g. "10.0.0.0/24"
    next_hop_ip: Mapped[str | None] = mapped_column(String(45), nullable=True)
    next_hop_interface: Mapped[str | None] = mapped_column(String(100), nullable=True)
    admin_distance: Mapped[int | None] = mapped_column(Integer, nullable=True)
    name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    evidence_lines: Mapped[list] = mapped_column(JSON, default=list)

    device: Mapped[Device] = relationship(back_populates="routes")


class Acl(Base):
    __tablename__ = "acls"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    device_id: Mapped[str] = mapped_column(ForeignKey("devices.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(200))  # number or name
    kind: Mapped[str] = mapped_column(String(20))  # standard|extended
    evidence_lines: Mapped[list] = mapped_column(JSON, default=list)

    device: Mapped[Device] = relationship(back_populates="acls")
    entries: Mapped[list["AclEntry"]] = relationship(
        back_populates="acl", cascade="all, delete-orphan", order_by="AclEntry.position"
    )

    __table_args__ = (UniqueConstraint("device_id", "name", name="uq_acl_name"),)


class AclEntry(Base):
    __tablename__ = "acl_entries"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    acl_id: Mapped[str] = mapped_column(ForeignKey("acls.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer)  # order within ACL
    sequence: Mapped[int | None] = mapped_column(Integer, nullable=True)
    action: Mapped[str] = mapped_column(String(10))  # permit|deny|remark|unsupported
    protocol: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # Match fields as parsed dicts: {kind: any|host|wildcard, ip, wildcard}
    src: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    dst: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # {op: eq|range|gt|lt|neq, values: [..]}
    src_port: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    dst_port: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    established: Mapped[int] = mapped_column(Integer, default=0)  # bool
    text: Mapped[str] = mapped_column(Text)
    line_number: Mapped[int] = mapped_column(Integer)

    acl: Mapped[Acl] = relationship(back_populates="entries")


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    kind: Mapped[str] = mapped_column(String(50))  # import|path_analysis|...
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending|running|done|failed
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
