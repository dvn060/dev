"""Import workflow: uploaded file/archive -> Snapshot with parsed devices.

One import produces one snapshot. Every decision made along the way (skipped
files, hostname mismatches, parse warnings) is appended to the import log so
the user can audit exactly how their evidence base was constructed.
"""

from __future__ import annotations

import hashlib
import io
import logging
import re
import zipfile
from datetime import datetime

from sqlalchemy.orm import Session

from ..models import (
    Acl,
    AclEntry,
    AnalysisStatus,
    Device,
    Import,
    ImportStatus,
    Interface,
    Snapshot,
    StaticRoute,
    Vlan,
)
from . import ncm
from .cisco_parser import ParsedDevice, parse_cisco_config
from .secrets import detect_secrets

logger = logging.getLogger(__name__)

MAX_ARCHIVE_MEMBERS = 5000
MAX_MEMBER_BYTES = 20 * 1024 * 1024  # single config larger than this is not a config
# Decompression-bomb guard: cumulative decompressed bytes across an archive.
MAX_TOTAL_DECOMPRESSED_BYTES = 500 * 1024 * 1024


class ImportError_(Exception):
    """User-facing import failure. Carries the audit-log entries collected
    before the failure so they survive the transaction rollback."""

    def __init__(self, message: str, log_entries: list[dict] | None = None):
        super().__init__(message)
        self.log_entries: list[dict] = log_entries or []


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


_CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f]")


def _sanitize_member_name(name: str) -> str:
    """Make an attacker-controlled filename safe for logs, DB and UI:
    strip control characters and cap the length."""
    cleaned = _CONTROL_CHARS.sub("?", name)
    return cleaned[:200] + "…" if len(cleaned) > 200 else cleaned


def _decode(data: bytes) -> str:
    """Decode config bytes across the encodings seen in real exports.

    BOM-marked UTF-8/UTF-16 are honored explicitly (UTF-16 would otherwise
    'succeed' as NUL-riddled latin-1 and then fail the config sniff)."""
    if data.startswith(b"\xef\xbb\xbf"):
        return data.decode("utf-8-sig", errors="replace")
    if data.startswith((b"\xff\xfe", b"\xfe\xff")):
        return data.decode("utf-16", errors="replace")
    for encoding in ("utf-8", "latin-1"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="replace")


def collect_candidates(
    filename: str, data: bytes, log: list[dict]
) -> tuple[list[ncm.ConfigFileCandidate], str]:
    """Return (candidates, source_type) from an uploaded file."""
    if zipfile.is_zipfile(io.BytesIO(data)):
        candidates: list[ncm.ConfigFileCandidate] = []
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            members = [m for m in zf.infolist() if not m.is_dir()]
            if len(members) > MAX_ARCHIVE_MEMBERS:
                raise ImportError_(
                    f"Archive has {len(members)} files; limit is {MAX_ARCHIVE_MEMBERS}."
                )
            total_decompressed = 0
            for member in members:
                name = member.filename
                safe_name = _sanitize_member_name(name)
                # zip-slip guard: we never extract to disk, but reject anyway
                if name.startswith(("/", "\\")) or ":" in name.split("/")[0][:3] \
                        or ".." in name.replace("\\", "/").split("/"):
                    log.append({"level": "warning",
                                "message": f"Skipped suspicious archive path: {safe_name}"})
                    continue
                ext = "." + name.rsplit(".", 1)[-1].lower() if "." in name else ""
                if ext not in ncm.CONFIG_EXTENSIONS:
                    log.append({"level": "info",
                                "message": f"Skipped non-config file: {safe_name}"})
                    continue
                if member.file_size > MAX_MEMBER_BYTES:
                    log.append({"level": "warning",
                                "message": f"Skipped oversized file ({member.file_size} bytes): {safe_name}"})
                    continue
                total_decompressed += member.file_size
                if total_decompressed > MAX_TOTAL_DECOMPRESSED_BYTES:
                    raise ImportError_(
                        "Archive expands beyond the "
                        f"{MAX_TOTAL_DECOMPRESSED_BYTES // (1024 * 1024)} MiB total limit; "
                        "refusing to continue (possible decompression bomb)."
                    )
                raw = zf.read(member)
                # Defense in depth: a lying local header cannot bypass the cap
                # because ZipExtFile truncates at the declared size; verify the
                # declared size was honest anyway.
                if len(raw) > MAX_MEMBER_BYTES:
                    log.append({"level": "warning",
                                "message": f"Skipped oversized file: {safe_name}"})
                    continue
                if b"\x00" in raw[:1024] and not raw.startswith((b"\xff\xfe", b"\xfe\xff")):
                    log.append({"level": "warning",
                                "message": f"Skipped binary file: {safe_name}"})
                    continue
                content = _decode(raw)
                if not ncm.looks_like_cisco_config(content):
                    log.append({"level": "warning",
                                "message": f"Skipped '{safe_name}': does not look like a Cisco configuration."})
                    continue
                hint, ctype, ts = ncm.parse_filename_metadata(safe_name)
                ts_source = "filename" if ts else None
                if ts is None:
                    dt = member.date_time
                    try:
                        from datetime import UTC
                        ts = datetime(*dt).replace(tzinfo=UTC)
                        ts_source = "zip_mtime"
                    except ValueError:
                        ts = None
                candidates.append(ncm.ConfigFileCandidate(
                    relative_path=safe_name, content=content,
                    device_name_hint=hint, config_type=ctype, timestamp=ts,
                    timestamp_source=ts_source,
                ))
        source_type = "ncm_archive" if _looks_like_ncm_layout(candidates) else "archive"
        return candidates, source_type

    # Single plain-text config
    safe_filename = _sanitize_member_name(filename)
    if b"\x00" in data[:1024] and not data.startswith((b"\xff\xfe", b"\xfe\xff")):
        raise ImportError_(
            f"'{safe_filename}' is a binary file, not a Cisco configuration or zip archive."
        )
    content = _decode(data)
    if not ncm.looks_like_cisco_config(content):
        raise ImportError_(
            f"'{safe_filename}' does not look like a Cisco configuration or a zip archive."
        )
    hint, ctype, ts = ncm.parse_filename_metadata(safe_filename)
    return (
        [ncm.ConfigFileCandidate(relative_path=safe_filename, content=content,
                                 device_name_hint=hint, config_type=ctype, timestamp=ts,
                                 timestamp_source="filename" if ts else None)],
        "single_config",
    )


def _looks_like_ncm_layout(candidates: list[ncm.ConfigFileCandidate]) -> bool:
    """NCM trees put configs in per-device folders or use type tokens in names."""
    if not candidates:
        return False
    typed = sum(1 for c in candidates if c.config_type != "unknown")
    foldered = sum(1 for c in candidates if "/" in c.relative_path.replace("\\", "/"))
    return typed >= max(1, len(candidates) // 2) or foldered >= max(1, len(candidates) // 2)


def run_import(
    db: Session,
    import_record: Import,
    data: bytes,
    snapshot_name: str,
    effective_at: datetime | None = None,
) -> Snapshot:
    """Execute an import synchronously. Called from the job runner."""
    log: list[dict] = list(import_record.log or [])
    import_record.status = ImportStatus.running.value
    import_record.file_hash = _sha256(data)
    db.flush()

    try:
        candidates, source_type = collect_candidates(import_record.original_filename, data, log)
    except ImportError_ as exc:
        exc.log_entries = [*log, *exc.log_entries]
        raise
    import_record.source_type = source_type
    return process_candidates(db, import_record, candidates, snapshot_name,
                              effective_at=effective_at, log=log)


def process_candidates(
    db: Session,
    import_record: Import,
    candidates: list[ncm.ConfigFileCandidate],
    snapshot_name: str,
    effective_at: datetime | None = None,
    log: list[dict] | None = None,
) -> Snapshot:
    """Turn a (possibly user-filtered) candidate list into a snapshot."""
    log = list(log or import_record.log or [])
    if not candidates:
        raise ImportError_("No usable configuration files found in the upload.",
                           log_entries=log)

    selected, selection_log = ncm.select_candidates(candidates)
    log.extend(selection_log)

    newest_ts = max((c.timestamp for c in selected if c.timestamp), default=None)
    snapshot = Snapshot(
        workspace_id=import_record.workspace_id,
        import_id=import_record.id,
        display_name=snapshot_name,
        effective_at=effective_at or newest_ts or import_record.imported_at,
        analysis_status=AnalysisStatus.parsing.value,
    )
    db.add(snapshot)
    db.flush()

    total_warnings = 0
    parse_errors = 0
    completeness_values: list[float] = []

    for candidate in selected:
        for note in candidate.notes:
            log.append({"level": "warning", "message": note, "file": candidate.relative_path})
            total_warnings += 1
        try:
            parsed = parse_cisco_config(candidate.content)
        except Exception as exc:  # parser must never take down an import
            logger.exception("Parser crashed on %s", candidate.relative_path)
            log.append({"level": "error",
                        "message": f"Parser failure on '{candidate.relative_path}': {exc}"})
            parse_errors += 1
            continue

        hostname = parsed.hostname or candidate.device_name_hint
        if not hostname:
            log.append({"level": "error",
                        "message": f"Could not determine hostname for '{candidate.relative_path}'; skipped."})
            parse_errors += 1
            continue
        if not parsed.hostname:
            log.append({"level": "warning",
                        "message": f"No 'hostname' line in '{candidate.relative_path}'; "
                                   f"using filename-derived name '{hostname}'."})
            total_warnings += 1

        if parsed.os_family == "nx-os":
            log.append({
                "level": "info",
                "message": (
                    f"'{hostname}' is an NX-OS device. NX-OS omits default settings from "
                    "'show running-config'; for the most complete analysis, export backups "
                    "with 'show running-config all' (in SolarWinds NCM: a config type that "
                    "captures the full running config)."
                ),
            })
        parse_status = "ok"
        if parsed.completeness < 0.5:
            parse_status = "partial"
        _persist_device(db, snapshot, candidate, parsed, hostname, parse_status)
        total_warnings += len(parsed.warnings)
        completeness_values.append(parsed.completeness)
        log.append({
            "level": "info",
            "message": (
                f"Parsed '{candidate.relative_path}' as device '{hostname}' "
                f"({len(parsed.interfaces)} interfaces, {len(parsed.acls)} ACLs, "
                f"{len(parsed.static_routes)} static routes, "
                f"completeness {parsed.completeness:.0%})."
            ),
        })

    snapshot.device_count = len(completeness_values)
    snapshot.warning_count = total_warnings
    snapshot.parse_error_count = parse_errors
    snapshot.completeness_score = (
        round(sum(completeness_values) / len(completeness_values), 4)
        if completeness_values else 0.0
    )
    snapshot.analysis_status = (
        AnalysisStatus.parsed.value if completeness_values else AnalysisStatus.failed.value
    )

    import_record.warning_count = total_warnings
    import_record.error_count = parse_errors
    import_record.status = (
        ImportStatus.failed.value if not completeness_values
        else ImportStatus.completed_with_warnings.value if (total_warnings or parse_errors)
        else ImportStatus.completed.value
    )
    import_record.log = log
    db.flush()
    return snapshot


def _persist_device(
    db: Session,
    snapshot: Snapshot,
    candidate: ncm.ConfigFileCandidate,
    parsed: ParsedDevice,
    hostname: str,
    parse_status: str,
) -> Device:
    device = Device(
        snapshot_id=snapshot.id,
        hostname=hostname,
        vendor="cisco",
        os_family=parsed.os_family,
        model=parsed.model,
        platform=parsed.version,
        management_ip=parsed.management_ip,
        source_filename=candidate.relative_path,
        config_hash=_sha256(candidate.content.encode()),
        parse_status=parse_status,
        warning_count=len(parsed.warnings),
        parse_warnings=[w.as_dict() for w in parsed.warnings],
        completeness_score=parsed.completeness,
        secret_lines=[s.as_dict() for s in detect_secrets(candidate.content)],
        raw_config=candidate.content,
    )
    db.add(device)
    db.flush()

    for iface in parsed.interfaces:
        db.add(Interface(
            device_id=device.id,
            name=iface.name,
            description=iface.description,
            layer_role=iface.layer_role,
            admin_state=iface.admin_state,
            switchport_mode=iface.switchport_mode,
            access_vlan=iface.access_vlan,
            native_vlan=iface.native_vlan,
            trunk_allowed_vlans=iface.trunk_allowed_vlans,
            ip_addresses=[ip.as_dict() for ip in iface.ip_addresses],
            vrf=iface.vrf,
            acl_in=iface.acl_in,
            acl_out=iface.acl_out,
            evidence_lines=iface.evidence_lines,
        ))
    for vlan in parsed.vlans:
        db.add(Vlan(
            device_id=device.id, vlan_id=vlan.vlan_id, name=vlan.name,
            evidence_lines=vlan.evidence_lines,
        ))
    for route in parsed.static_routes:
        db.add(StaticRoute(
            device_id=device.id, vrf=route.vrf, prefix=route.prefix,
            next_hop_ip=route.next_hop_ip, next_hop_interface=route.next_hop_interface,
            admin_distance=route.admin_distance, name=route.name,
            evidence_lines=route.evidence_lines,
        ))
    for acl in parsed.acls:
        acl_row = Acl(
            device_id=device.id, name=acl.name, kind=acl.kind,
            evidence_lines=acl.evidence_lines,
        )
        db.add(acl_row)
        db.flush()
        for pos, entry in enumerate(acl.entries):
            db.add(AclEntry(
                acl_id=acl_row.id,
                position=pos,
                sequence=entry.sequence,
                action=entry.action,
                protocol=entry.protocol,
                src=entry.src.as_dict() if entry.src else None,
                dst=entry.dst.as_dict() if entry.dst else None,
                src_port=entry.src_port.as_dict() if entry.src_port else None,
                dst_port=entry.dst_port.as_dict() if entry.dst_port else None,
                established=1 if entry.established else 0,
                text=entry.text,
                line_number=entry.line_number,
            ))
    db.flush()
    return device
