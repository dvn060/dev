"""Pydantic response/request schemas (the API contract).

The frontend mirrors these with zod in apps/web/src/lib/api-schemas.ts.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---- workspaces -------------------------------------------------------------

class WorkspaceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = ""


class WorkspaceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None


class WorkspaceOut(ORMModel):
    id: str
    name: str
    description: str
    created_at: datetime
    updated_at: datetime


# ---- imports ----------------------------------------------------------------

class ImportOut(ORMModel):
    id: str
    workspace_id: str
    original_filename: str
    source_type: str
    imported_at: datetime
    file_hash: str
    status: str
    warning_count: int
    error_count: int


class ImportDetailOut(ImportOut):
    log: list[dict]


class ImportAccepted(BaseModel):
    import_id: str
    job_id: str
    snapshot_name: str


# ---- snapshots ----------------------------------------------------------------

class SnapshotOut(ORMModel):
    id: str
    workspace_id: str
    import_id: str | None
    display_name: str
    effective_at: datetime
    batfish_snapshot_name: str | None
    analysis_status: str
    device_count: int
    warning_count: int
    parse_error_count: int
    completeness_score: float
    notes: str
    created_at: datetime


class SnapshotUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=200)
    notes: str | None = None


# ---- devices ------------------------------------------------------------------

class InterfaceOut(ORMModel):
    id: str
    name: str
    description: str
    layer_role: str
    admin_state: str
    switchport_mode: str | None
    access_vlan: int | None
    native_vlan: int | None
    trunk_allowed_vlans: str | None
    ip_addresses: list[dict]
    vrf: str | None
    acl_in: str | None
    acl_out: str | None
    evidence_lines: list[int]


class VlanOut(ORMModel):
    id: str
    vlan_id: int
    name: str | None
    evidence_lines: list[int]


class RouteOut(ORMModel):
    id: str
    vrf: str | None
    prefix: str
    next_hop_ip: str | None
    next_hop_interface: str | None
    admin_distance: int | None
    name: str | None
    evidence_lines: list[int]


class AclEntryOut(ORMModel):
    id: str
    position: int
    sequence: int | None
    action: str
    protocol: str | None
    src: dict | None
    dst: dict | None
    src_port: dict | None
    dst_port: dict | None
    established: int
    text: str
    line_number: int


class AclOut(ORMModel):
    id: str
    name: str
    kind: str
    evidence_lines: list[int]
    entries: list[AclEntryOut]


class DeviceSummaryOut(ORMModel):
    id: str
    snapshot_id: str
    hostname: str
    vendor: str
    os_family: str
    platform: str | None
    model: str | None
    management_ip: str | None
    source_filename: str
    parse_status: str
    warning_count: int
    completeness_score: float
    secret_count: int


class DeviceDetailOut(DeviceSummaryOut):
    config_hash: str
    parse_warnings: list[dict]
    interfaces: list[InterfaceOut]
    vlans: list[VlanOut]
    routes: list[RouteOut]
    acls: list[AclOut]


class DeviceConfigOut(BaseModel):
    device_id: str
    hostname: str
    source_filename: str
    redacted: bool  # False only via the explicit unredacted viewer
    secret_count: int
    secret_line_numbers: list[int]
    lines: list[str]  # index 0 == config line 1


# ---- analysis -------------------------------------------------------------------

class PathQuery(BaseModel):
    src_ip: str
    dst_ip: str
    protocol: str = "tcp"
    dst_port: int | None = Field(default=None, ge=1, le=65535)
    src_port: int | None = Field(default=None, ge=1, le=65535)

    @field_validator("src_ip", "dst_ip")
    @classmethod
    def _valid_ip(cls, v: str) -> str:
        import ipaddress
        ipaddress.ip_address(v)
        return v

    @field_validator("protocol")
    @classmethod
    def _valid_protocol(cls, v: str) -> str:
        allowed = {"tcp", "udp", "icmp", "ip"}
        if v.lower() not in allowed:
            raise ValueError(f"protocol must be one of {sorted(allowed)}")
        return v.lower()


class SuspectQuery(PathQuery):
    pass


class DifferentialQuery(BaseModel):
    """Optional header-space scope for differential reachability. All fields
    optional: an empty query asks Batfish about the whole flow space."""

    src_ip: str | None = None
    dst_ip: str | None = None
    protocol: str | None = None
    dst_port: int | None = Field(default=None, ge=1, le=65535)

    @field_validator("src_ip", "dst_ip")
    @classmethod
    def _valid_ip(cls, v: str | None) -> str | None:
        if v is not None:
            import ipaddress
            ipaddress.ip_address(v)
        return v

    @field_validator("protocol")
    @classmethod
    def _valid_protocol(cls, v: str | None) -> str | None:
        if v is None:
            return v
        allowed = {"tcp", "udp", "icmp", "ip"}
        if v.lower() not in allowed:
            raise ValueError(f"protocol must be one of {sorted(allowed)}")
        return v.lower()


# ---- jobs ---------------------------------------------------------------------

class JobOut(ORMModel):
    id: str
    kind: str
    status: str
    created_at: datetime
    finished_at: datetime | None
    result: dict | None
    error: str | None


# ---- misc ---------------------------------------------------------------------

class HealthOut(BaseModel):
    status: str
    product: str
    version: str
    batfish: dict[str, Any]
