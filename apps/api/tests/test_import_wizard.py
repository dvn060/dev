"""Import wizard: preview -> user correction -> confirm."""

from pathlib import Path

from .conftest import FIXTURES

AMBIGUOUS = FIXTURES / "ncm-archives" / "ncm-archive-ambiguous.zip"


def _preview(client, workspace_id, path: Path = AMBIGUOUS, name: str | None = None):
    data = {"snapshot_name": name} if name else {}
    resp = client.post(
        f"/api/workspaces/{workspace_id}/imports/preview",
        files={"file": (path.name, path.read_bytes(), "application/zip")},
        data=data,
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_preview_clusters_by_date_and_flags_ambiguity(client, workspace_id):
    body = _preview(client, workspace_id, name="mixed")
    assert body["ambiguous"] is True
    assert body["staged_import_id"]
    groups = {g["name"]: g for g in body["groups"]}
    assert set(groups) == {"mixed (2024-05-01)", "mixed (2024-06-05)", "mixed (undated)"}

    may = groups["mixed (2024-05-01)"]
    assert {f["device"] for f in may["files"]} == {"CORE-RTR-01", "DIST-SW-01"}
    june = groups["mixed (2024-06-05)"]
    assert {f["device"] for f in june["files"]} == {"ACCESS-SW-01", "EDGE-FW-01"}
    undated = groups["mixed (undated)"]
    assert [f["device"] for f in undated["files"]] == ["LAB-RTR-01"]
    assert undated["files"][0]["timestamp"] is None

    # the readme was skipped and the skip is reported
    assert any("readme.txt" in msg for msg in body["skipped"])
    # nothing was committed yet
    assert client.get(f"/api/workspaces/{workspace_id}/snapshots").json() == []


def test_confirm_applies_user_corrections(client, workspace_id):
    body = _preview(client, workspace_id, name="mixed")
    groups = {g["name"]: g for g in body["groups"]}
    may_files = [f["path"] for f in groups["mixed (2024-05-01)"]["files"]]
    june_files = [f["path"] for f in groups["mixed (2024-06-05)"]["files"]]
    undated_files = [f["path"] for f in groups["mixed (undated)"]["files"]]
    access_path = next(f["path"] for f in groups["mixed (2024-06-05)"]["files"]
                       if f["device"] == "ACCESS-SW-01")

    # Corrections: move ACCESS into May, put the undated LAB file into May,
    # exclude EDGE entirely, rename both snapshots.
    resp = client.post(
        f"/api/imports/staged/{body['staged_import_id']}/confirm",
        json={
            "groups": [
                {"name": "May full", "file_paths": may_files + [access_path] + undated_files,
                 "effective_at": groups["mixed (2024-05-01)"]["effective_at"]},
                {"name": "June partial",
                 "file_paths": [p for p in june_files if p != access_path]},
            ],
            "excluded": [p for p in june_files if p != access_path],
        },
    )
    assert resp.status_code == 202, resp.text
    results = resp.json()["results"]
    # June group's only file was excluded -> only one import ran
    assert [r["snapshot_name"] for r in results] == ["May full"]
    for r in results:
        job = client.get(f"/api/jobs/{r['job_id']}").json()
        assert job["status"] == "done", job

    snaps = {s["display_name"]: s for s in
             client.get(f"/api/workspaces/{workspace_id}/snapshots").json()}
    assert set(snaps) == {"May full"}
    assert snaps["May full"]["device_count"] == 4  # CORE, DIST, ACCESS, LAB

    devices = client.get(f"/api/snapshots/{snaps['May full']['id']}/devices").json()
    assert [d["hostname"] for d in devices] == [
        "ACCESS-SW-01", "CORE-RTR-01", "DIST-SW-01", "LAB-RTR-01"
    ]
    # staged row is gone: confirming again is a 404
    resp = client.post(f"/api/imports/staged/{body['staged_import_id']}/confirm",
                       json={"groups": [{"name": "x", "file_paths": may_files}]})
    assert resp.status_code == 404


def test_confirm_validation_rejects_bad_grouping(client, workspace_id):
    body = _preview(client, workspace_id, name="v")
    staged = body["staged_import_id"]
    all_paths = [f["path"] for g in body["groups"] for f in g["files"]]

    # unknown path
    resp = client.post(f"/api/imports/staged/{staged}/confirm",
                       json={"groups": [{"name": "a", "file_paths": ["nope.cfg"]}]})
    assert resp.status_code == 422
    # duplicate assignment
    resp = client.post(f"/api/imports/staged/{staged}/confirm",
                       json={"groups": [{"name": "a", "file_paths": all_paths[:1]},
                                        {"name": "b", "file_paths": all_paths[:1]}]})
    assert resp.status_code == 422
    # duplicate names
    resp = client.post(f"/api/imports/staged/{staged}/confirm",
                       json={"groups": [{"name": "a", "file_paths": all_paths[:1]},
                                        {"name": "a", "file_paths": all_paths[1:2]}]})
    assert resp.status_code == 422


def test_single_run_archive_previews_as_one_unambiguous_group(client, workspace_id):
    baseline = FIXTURES / "ncm-archives" / "ncm-archive-baseline.zip"
    body = _preview(client, workspace_id, path=baseline, name="Baseline")
    assert body["ambiguous"] is False
    assert len(body["groups"]) == 1
    assert body["groups"][0]["name"] == "Baseline"
    # confirming as proposed works end-to-end
    resp = client.post(
        f"/api/imports/staged/{body['staged_import_id']}/confirm",
        json={"groups": [{"name": "Baseline",
                          "file_paths": [f["path"] for f in body["groups"][0]["files"]]}],
              "excluded": []},
    )
    assert resp.status_code == 202
    job = client.get(f"/api/jobs/{resp.json()['results'][0]['job_id']}").json()
    assert job["status"] == "done"
    assert job["result"]["device_count"] == 5
