"""Import workflow: uploaded file/archive -> Snapshot with parsed devices.

One import produces one snapshot. Every decision made along the way (skipped
files, hostname mismatches, parse warnings) is appended to the import log so
the user can audit exactly how their evidence base was constructed.
"""

from __future__ import annotations

import hashlib
import io
import logging
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

logger = logging.getLogger(__name__)

MAX_ARCHIVE_MEMBERS = 5000
MAX_MEMBER_BYTES = 20 * 1024 * 1024  # single config larger than this is not a config


class ImportError_(Exception):
    """User-facing import failure."""


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _decode(data: bytes) -> str:
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
            for member in members:
                name = member.filename
                # zip-slip guard: we never extract to disk, but reject anyway
                if name.startswith("/") or ".." in name.replace("\\", "/").split("/"):
                    log.append({"level": "warning",
                                "message": f"Skipped suspicious archive path: {name}"})
                    continue
                ext = "." + name.rsplit(".", 1)[-1].lower() if "." in name else ""
                if ext not in ncm.CONFIG_EXTENSIONS:
                    log.append({"level": "info",
                                "message": f"Skipped non-config file: {name}"})
                    continue
                if member.file_size > MAX_MEMBER_BYTES:
                    log.append({"level": "warning",
                                "message": f"Skipped oversized file ({member.file_size} bytes): {name}"})
                    continue
                content = _decode(zf.read(member))
                if not ncm.looks_like_cisco_config(content):
                    log.append({"level": "warning",
                                "message": f"Skipped '{name}': does not look like a Cisco configuration."})
                    continue
                hint, ctype, ts = ncm.parse_filename_metadata(name)
                if ts is None:
                    dt = member.date_time
                    try:
                        ts = datetime(*dt).replace(tzinfo=None)
                        from datetime import UTC
                        ts = ts.replace(tzinfo=UTC)
                    except ValueError:
                        ts = None
                candidates.append(ncm.ConfigFileCandidate(
                    relative_path=name, content=content,
                    device_name_hint=hint, config_type=ctype, timestamp=ts,
                ))
        source_type = "ncm_archive" if _looks_like_ncm_layout(candidates) else "archive"
        return candidates, source_type

    # Single plain-text config
    content = _decode(data)
    if not ncm.looks_like_cisco_config(content):
        raise ImportError_(
            f"'{filename}' does not look like a Cisco configuration or a zip archive."
        )
    hint, ctype, ts = ncm.parse_filename_metadata(filename)
    return (
        [ncm.ConfigFileCandidate(relative_path=filename, content=content,
                                 device_name_hint=hint, config_type=ctype, timestamp=ts)],
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

    candidates, source_type = collect_candidates(import_record.original_filename, data, log)
    import_record.source_type = source_type
    if not candidates:
        import_record.status = ImportStatus.failed.value
        import_record.error_count += 1
        log.append({"level": "error", "message": "No usable configuration files found."})
        import_record.log = log
        raise ImportError_("No usable configuration files found in the upload.")

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
