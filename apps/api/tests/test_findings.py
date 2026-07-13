"""Findings engine: deterministic rules over the fixture lab (Batfish off)."""

import io
import zipfile

from .conftest import import_snapshot


def _findings(client, snapshot_id):
    resp = client.get(f"/api/snapshots/{snapshot_id}/findings", params={"batfish": "false"})
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_lab_fires_at_least_five_finding_kinds(client, workspace_id):
    snapshot_id = import_snapshot(client, workspace_id, "baseline", "findings-lab")
    body = _findings(client, snapshot_id)
    kinds = {f["kind"] for f in body["findings"]}
    assert {"duplicate_ip", "overlapping_subnets", "acl_unused",
            "acl_undefined", "trunk_all_vlans", "stale_snapshot"} <= kinds
    assert body["batfish"]["consulted"] is False  # honestly reported

    # ordering: highest severity first
    ranks = {"high": 0, "medium": 1, "low": 2, "info": 3}
    sev = [ranks[f["severity"]] for f in body["findings"]]
    assert sev == sorted(sev)


def test_duplicate_ip_finding_details(client, workspace_id):
    snapshot_id = import_snapshot(client, workspace_id, "baseline", "dup-ip")
    body = _findings(client, snapshot_id)
    f = next(f for f in body["findings"] if f["kind"] == "duplicate_ip")
    assert f["severity"] == "high"
    assert f["confidence"] == "confirmed"
    assert f["data"]["address"] == "10.255.0.1"
    hostnames = {a["hostname"] for a in f["affected"]}
    assert hostnames == {"CORE-RTR-01", "LAB-RTR-01"}
    assert all(e["lines"] for e in f["evidence"])  # evidence links present


def test_overlap_and_undefined_acl_details(client, workspace_id):
    snapshot_id = import_snapshot(client, workspace_id, "baseline", "ov-acl")
    body = _findings(client, snapshot_id)

    ov = next(f for f in body["findings"] if f["kind"] == "overlapping_subnets")
    assert set(ov["data"]["subnets"]) == {"10.10.20.0/24", "10.10.20.128/25"}
    assert ov["confidence"] == "inferred"  # deduction, honestly labeled

    undef = next(f for f in body["findings"] if f["kind"] == "acl_undefined")
    assert undef["severity"] == "high"
    assert undef["data"]["acl_name"] == "LEGACY-FILTER"
    assert undef["affected"][0]["hostname"] == "ACCESS-SW-01"


def test_hygiene_findings_are_not_dressed_as_security(client, workspace_id):
    snapshot_id = import_snapshot(client, workspace_id, "baseline", "hygiene")
    body = _findings(client, snapshot_id)

    unused = next(f for f in body["findings"] if f["kind"] == "acl_unused")
    assert unused["severity"] == "info"
    assert unused["category"] == "hygiene"
    assert "not a" in unused["explanation"] and "security finding" in unused["explanation"]

    trunk = next(f for f in body["findings"] if f["kind"] == "trunk_all_vlans")
    assert trunk["severity"] == "low"
    assert trunk["category"] == "hygiene"
    assert "not, by itself, a vulnerability" in trunk["explanation"]
    assert trunk["affected"][0]["hostname"] == "ACCESS-SW-01"


def test_duplicate_config_and_hostname_mismatch(client, workspace_id):
    """Synthetic archive: two clones + a filename/hostname mismatch."""
    clone = ("hostname {h}\n"
             "interface Loopback0\n"
             " ip address 10.9.9.9 255.255.255.255\n")
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("CLONE-A/CLONE-A-Running-2024-05-01.cfg", clone.format(h="CLONE-A"))
        zf.writestr("CLONE-B/CLONE-B-Running-2024-05-01.cfg", clone.format(h="CLONE-B"))
        zf.writestr("OLD-NAME/OLD-NAME-Running-2024-05-01.cfg",
                    "hostname NEW-NAME\ninterface Loopback0\n"
                    " ip address 10.8.8.8 255.255.255.255\n")
    resp = client.post(
        f"/api/workspaces/{workspace_id}/imports",
        files={"file": ("clones.zip", buf.getvalue(), "application/zip")},
        data={"snapshot_name": "clones"},
    )
    job = client.get(f"/api/jobs/{resp.json()['job_id']}").json()
    assert job["status"] == "done", job
    body = _findings(client, job["result"]["snapshot_id"])

    dup = next(f for f in body["findings"] if f["kind"] == "duplicate_config")
    assert set(dup["data"]["hostnames"]) == {"CLONE-A", "CLONE-B"}
    # duplicate_ip also fires for the cloned loopback — the classic consequence
    assert any(f["kind"] == "duplicate_ip" and f["data"]["address"] == "10.9.9.9"
               for f in body["findings"])
    mismatch = next(f for f in body["findings"] if f["kind"] == "hostname_mismatch")
    assert "NEW-NAME" in mismatch["title"]


def test_clean_config_produces_no_correctness_findings(client, workspace_id):
    resp = client.post(
        f"/api/workspaces/{workspace_id}/imports",
        files={"file": ("CLEAN.cfg",
                        b"hostname CLEAN-01\n"
                        b"interface Loopback0\n"
                        b" ip address 10.1.2.3 255.255.255.255\n",
                        "text/plain")},
        data={"snapshot_name": "clean"},
    )
    job = client.get(f"/api/jobs/{resp.json()['job_id']}").json()
    body = _findings(client, job["result"]["snapshot_id"])
    assert not [f for f in body["findings"] if f["category"] == "correctness"]
