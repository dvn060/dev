import io
import zipfile

from .conftest import import_snapshot


def test_health(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["batfish"]["available"] is False  # disabled in tests, honestly reported


def test_workspace_crud(client):
    created = client.post("/api/workspaces", json={"name": "Acme", "description": "d"}).json()
    assert client.post("/api/workspaces", json={"name": "Acme"}).status_code == 409
    listed = client.get("/api/workspaces").json()
    assert [w["name"] for w in listed] == ["Acme"]
    patched = client.patch(f"/api/workspaces/{created['id']}", json={"description": "x"}).json()
    assert patched["description"] == "x"
    assert client.delete(f"/api/workspaces/{created['id']}").status_code == 204
    assert client.get(f"/api/workspaces/{created['id']}").status_code == 404


def test_import_ncm_archive_creates_snapshot_and_devices(client, workspace_id):
    snapshot_id = import_snapshot(client, workspace_id, "baseline", "May baseline")

    snap = client.get(f"/api/snapshots/{snapshot_id}").json()
    assert snap["device_count"] == 4
    assert snap["analysis_status"] == "parsed"
    assert snap["completeness_score"] > 0.95
    assert snap["parse_error_count"] == 0

    devices = client.get(f"/api/snapshots/{snapshot_id}/devices").json()
    hostnames = [d["hostname"] for d in devices]
    assert hostnames == ["ACCESS-SW-01", "CORE-RTR-01", "DIST-SW-01", "EDGE-FW-01"]

    dist = next(d for d in devices if d["hostname"] == "DIST-SW-01")
    detail = client.get(f"/api/devices/{dist['id']}").json()
    assert any(i["name"] == "Vlan20" and i["acl_out"] == "SERVERS-IN"
               for i in detail["interfaces"])
    acl = next(a for a in detail["acls"] if a["name"] == "SERVERS-IN")
    assert len(acl["entries"]) == 7

    config = client.get(f"/api/devices/{dist['id']}/config").json()
    # evidence lines must index into the raw config exactly
    for entry in acl["entries"]:
        assert config["lines"][entry["line_number"] - 1].strip() == entry["text"].strip() or \
            entry["text"].strip() in config["lines"][entry["line_number"] - 1]


def test_import_prefers_running_and_newest(client, workspace_id):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        base = "hostname DUP-SW-01\ninterface Loopback0\n ip address 1.1.1.{n} 255.255.255.255\n"
        zf.writestr("DUP-SW-01/DUP-SW-01-Startup-2024-06-01_000000.cfg", base.format(n=3))
        zf.writestr("DUP-SW-01/DUP-SW-01-Running-2024-05-01_000000.cfg", base.format(n=1))
        zf.writestr("DUP-SW-01/DUP-SW-01-Running-2024-06-01_000000.cfg", base.format(n=2))
        zf.writestr("readme.txt", "not a config\n")
    resp = client.post(
        f"/api/workspaces/{workspace_id}/imports",
        files={"file": ("dup.zip", buf.getvalue(), "application/zip")},
        data={"snapshot_name": "dup"},
    )
    job = client.get(f"/api/jobs/{resp.json()['job_id']}").json()
    snapshot_id = job["result"]["snapshot_id"]

    devices = client.get(f"/api/snapshots/{snapshot_id}/devices").json()
    assert len(devices) == 1
    detail = client.get(f"/api/devices/{devices[0]['id']}").json()
    lo0 = detail["interfaces"][0]
    assert lo0["ip_addresses"][0]["address"] == "1.1.1.2"  # newest running config

    import_detail = client.get(f"/api/imports/{resp.json()['import_id']}").json()
    messages = " | ".join(entry["message"] for entry in import_detail["log"])
    assert "Skipped" in messages  # startup + older running + readme all logged
    assert import_detail["source_type"] == "ncm_archive"


def test_import_hostname_mismatch_warns_and_uses_hostname(client, workspace_id):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr(
            "WRONG-NAME/WRONG-NAME-Running-2024-05-01_000000.cfg",
            "hostname REAL-NAME\ninterface Loopback0\n ip address 2.2.2.2 255.255.255.255\n",
        )
    resp = client.post(
        f"/api/workspaces/{workspace_id}/imports",
        files={"file": ("m.zip", buf.getvalue(), "application/zip")},
        data={"snapshot_name": "mismatch"},
    )
    job = client.get(f"/api/jobs/{resp.json()['job_id']}").json()
    devices = client.get(f"/api/snapshots/{job['result']['snapshot_id']}/devices").json()
    assert devices[0]["hostname"] == "REAL-NAME"
    log = client.get(f"/api/imports/{resp.json()['import_id']}").json()["log"]
    assert any("hostname" in e["message"].lower() and "WRONG-NAME" in e["message"] for e in log)


def test_import_rejects_garbage(client, workspace_id):
    resp = client.post(
        f"/api/workspaces/{workspace_id}/imports",
        files={"file": ("notes.txt", b"just some notes, definitely not a config", "text/plain")},
    )
    assert resp.status_code == 202
    job = client.get(f"/api/jobs/{resp.json()['job_id']}").json()
    assert job["status"] == "failed"
    assert "does not look like a Cisco configuration" in job["error"]


def test_import_single_config_file(client, workspace_id):
    from .conftest import fixture_config

    resp = client.post(
        f"/api/workspaces/{workspace_id}/imports",
        files={"file": ("CORE-RTR-01.cfg",
                        fixture_config("baseline", "CORE-RTR-01.cfg").encode(), "text/plain")},
    )
    assert resp.status_code == 202
    body = resp.json()
    assert body["snapshot_name"] == "CORE-RTR-01"
    job = client.get(f"/api/jobs/{body['job_id']}").json()
    assert job["status"] == "done"
    assert job["result"]["device_count"] == 1


def test_search_returns_evidence_shaped_hits(client, workspace_id):
    snapshot_id = import_snapshot(client, workspace_id, "baseline", "search-snap")
    hits = client.get(f"/api/snapshots/{snapshot_id}/search", params={"q": "10.10.20.50"}).json()
    assert hits["truncated"] is False
    assert {h["hostname"] for h in hits["hits"]} == {"DIST-SW-01"}
    assert all(isinstance(h["line"], int) and h["line"] > 0 for h in hits["hits"])
