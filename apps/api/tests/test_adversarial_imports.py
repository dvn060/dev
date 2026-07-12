"""Adversarial import handling.

Every hostile upload must be rejected (or its hostile members skipped) with a
sanitized error, and must leave behind:
* no Snapshot or Device rows,
* no stuck 'pending'/'running' Import rows,
* no orphaned temp directories.
"""

import io
import tempfile
import zipfile
from pathlib import Path

import pytest

VALID_CFG = (
    "hostname GOOD-SW-01\n"
    "interface Loopback0\n"
    " ip address 9.9.9.9 255.255.255.255\n"
)


def _upload(client, workspace_id, filename, data, snapshot_name="adv"):
    resp = client.post(
        f"/api/workspaces/{workspace_id}/imports",
        files={"file": (filename, data, "application/octet-stream")},
        data={"snapshot_name": snapshot_name},
    )
    assert resp.status_code == 202, resp.text
    body = resp.json()
    job = client.get(f"/api/jobs/{body['job_id']}").json()
    return body, job


def _zip_bytes(members: dict[str, bytes | str]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, content in members.items():
            zf.writestr(name, content)
    return buf.getvalue()


def _snapshot_temp_dirs() -> set[str]:
    tmp = Path(tempfile.gettempdir())
    return {p.name for p in tmp.iterdir() if p.is_dir() and p.name.startswith("ne_")}


@pytest.fixture()
def clean_state(client, workspace_id):
    """Capture temp-dir state before, and assert full cleanliness after."""
    before = _snapshot_temp_dirs()
    yield workspace_id
    # no orphaned temp directories
    assert _snapshot_temp_dirs() == before
    # no snapshots (and therefore no devices) survived a failed import
    snapshots = client.get(f"/api/workspaces/{workspace_id}/snapshots").json()
    assert snapshots == []
    # no import left dangling in pending/running
    imports = client.get(f"/api/workspaces/{workspace_id}/imports").json()
    assert all(i["status"] == "failed" for i in imports), imports


def test_zip_slip_members_are_rejected(client, clean_state):
    workspace_id = clean_state
    evil = _zip_bytes({
        "../../../../etc/cron.d/evil.cfg": VALID_CFG,
        "..\\..\\windows\\system32\\evil2.cfg": VALID_CFG,
        "/absolute/path/evil3.cfg": VALID_CFG,
        "nested/../../escape.cfg": VALID_CFG,
    })
    _, job = _upload(client, workspace_id, "slip.zip", evil)
    # every member was hostile -> nothing usable -> import fails cleanly
    assert job["status"] == "failed"
    assert "No usable configuration files found" in job["error"]
    # the log records each skipped path, sanitized
    imports = client.get(f"/api/workspaces/{workspace_id}/imports").json()
    detail = client.get(f"/api/imports/{imports[0]['id']}").json()
    suspicious = [e for e in detail["log"] if "suspicious archive path" in e["message"]]
    assert len(suspicious) == 4


def test_decompression_bomb_is_refused(client, clean_state):
    workspace_id = clean_state
    # 40 members x 15 MiB of zeros each = 600 MiB decompressed (~<1 MiB zipped),
    # each under the per-member cap but blowing the cumulative cap.
    chunk = b"\x00" * (15 * 1024 * 1024)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for i in range(40):
            zf.writestr(f"bomb{i}.cfg", chunk)
    _, job = _upload(client, workspace_id, "bomb.zip", buf.getvalue())
    assert job["status"] == "failed"
    assert "decompression bomb" in job["error"]
    # error is sanitized: no raw payload bytes in the message
    assert "\x00" not in job["error"]


def test_excessive_file_count_is_refused(client, clean_state):
    workspace_id = clean_state
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for i in range(5001):
            zf.writestr(f"f{i}.cfg", "x")
    _, job = _upload(client, workspace_id, "many.zip", buf.getvalue())
    assert job["status"] == "failed"
    assert "limit is 5000" in job["error"]


def test_pe_binary_is_rejected_with_sanitized_error(client, clean_state):
    workspace_id = clean_state
    pe = b"MZ\x90\x00\x03\x00\x00\x00" + b"\x00" * 512 + b"PE\x00\x00" + b"\xcc" * 2048
    _, job = _upload(client, workspace_id, "malware.cfg", pe)
    assert job["status"] == "failed"
    assert "binary file" in job["error"]
    # sanitized: no binary content leaks into the error or the log
    assert "\x00" not in job["error"] and "MZ\x90" not in job["error"]


def test_pe_binary_inside_archive_is_skipped_not_fatal(client, workspace_id):
    pe = b"MZ\x90\x00" + b"\x00" * 1024
    archive = _zip_bytes({"tool.cfg": pe, "GOOD-SW-01/GOOD-SW-01-Running-2024-05-01.cfg": VALID_CFG})
    _, job = _upload(client, workspace_id, "mixed.zip", archive, snapshot_name="mixed")
    assert job["status"] == "done"  # the good config still imports
    snapshot_id = job["result"]["snapshot_id"]
    devices = client.get(f"/api/snapshots/{snapshot_id}/devices").json()
    assert [d["hostname"] for d in devices] == ["GOOD-SW-01"]
    imports = client.get(f"/api/workspaces/{workspace_id}/imports").json()
    detail = client.get(f"/api/imports/{imports[0]['id']}").json()
    assert any("Skipped binary file" in e["message"] for e in detail["log"])


def test_mixed_encodings_parse_or_fail_cleanly(client, workspace_id):
    latin1 = "hostname LATIN-SW-01\ninterface Loopback0\n description Zürich Büro\n ip address 8.8.8.8 255.255.255.255\n".encode("latin-1")
    utf8_bom = ("﻿hostname BOM-SW-01\ninterface Loopback0\n"
                " ip address 7.7.7.7 255.255.255.255\n").encode("utf-8-sig")
    utf16 = ("hostname UTF16-SW-01\ninterface Loopback0\n"
             " ip address 6.6.6.6 255.255.255.255\n").encode("utf-16")

    archive = _zip_bytes({
        "LATIN-SW-01.cfg": latin1,
        "BOM-SW-01.cfg": utf8_bom,
        "UTF16-SW-01.cfg": utf16,
    })
    _, job = _upload(client, workspace_id, "encodings.zip", archive, snapshot_name="enc")
    assert job["status"] == "done", job
    devices = client.get(f"/api/snapshots/{job['result']['snapshot_id']}/devices").json()
    hostnames = {d["hostname"] for d in devices}
    assert hostnames == {"LATIN-SW-01", "BOM-SW-01", "UTF16-SW-01"}
    latin = next(d for d in devices if d["hostname"] == "LATIN-SW-01")
    detail = client.get(f"/api/devices/{latin['id']}").json()
    assert any("Zürich" in i["description"] for i in detail["interfaces"])


def test_unsafe_filenames_are_sanitized_everywhere(client, workspace_id):
    hostile_name = "evil\x1b[2J\x07name\nCON.cfg"  # ANSI escape, BEL, newline, DOS device
    archive = _zip_bytes({hostile_name: VALID_CFG})
    _, job = _upload(client, workspace_id, "names.zip", archive, snapshot_name="names")
    assert job["status"] == "done", job
    devices = client.get(f"/api/snapshots/{job['result']['snapshot_id']}/devices").json()
    assert devices[0]["hostname"] == "GOOD-SW-01"  # hostname from content wins
    # No control characters may survive into any surfaced string.
    source = devices[0]["source_filename"]
    assert "\x1b" not in source and "\n" not in source and "\x07" not in source
    imports = client.get(f"/api/workspaces/{workspace_id}/imports").json()
    detail = client.get(f"/api/imports/{imports[0]['id']}").json()
    for entry in detail["log"]:
        assert "\x1b" not in entry["message"] and "\x07" not in entry["message"]


def test_hostile_hostname_cannot_escape_batfish_dir(client, workspace_id):
    """A hostname like ../../x must not be usable for path traversal when the
    snapshot is materialized for Batfish."""
    from app.db import get_sessionmaker
    from app.models import Snapshot
    from app.services.batfish_client import _materialize_snapshot

    cfg = "hostname ../../escape\ninterface Loopback0\n ip address 5.5.5.5 255.255.255.255\n"
    _, job = _upload(client, workspace_id, "host.cfg", cfg.encode(), snapshot_name="hostile-host")
    assert job["status"] == "done"

    session = get_sessionmaker()()
    try:
        snapshot = session.get(Snapshot, job["result"]["snapshot_id"])
        with tempfile.TemporaryDirectory() as tmp:
            count = _materialize_snapshot(session, snapshot, Path(tmp))
            assert count == 1
            written = list(Path(tmp).rglob("*.cfg"))
            assert len(written) == 1
            # the file stayed inside the snapshot dir and got a safe name
            assert written[0].is_relative_to(Path(tmp))
            assert ".." not in written[0].name
    finally:
        session.close()


def test_truncated_zip_fails_cleanly(client, clean_state):
    workspace_id = clean_state
    valid = _zip_bytes({"GOOD-SW-01.cfg": VALID_CFG})
    _, job = _upload(client, workspace_id, "trunc.zip", valid[: len(valid) // 2])
    assert job["status"] == "failed"
    # zipfile detects corruption or the sniff rejects it; either way sanitized
    assert "\x00" not in job["error"]
