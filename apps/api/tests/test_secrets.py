"""Secret detection, redacted-by-default serving, and leak hunting.

The contract under test: after importing a config full of fake credentials,
NONE of the secret values may appear in any API response, import log, diff,
search result or report — except the explicit unredacted viewer
(?redacted=false) and the explicitly requested unredacted report.
"""


from app.services.secrets import detect_secrets

from .conftest import FIXTURES

SECRETS_CFG = FIXTURES / "cisco" / "secrets-demo" / "SECRETS-DEMO-01.cfg"

# Every fake credential value planted in the fixture.
PLANTED_SECRETS = [
    "$1$fake$FAKEENABLEHASH1234567",
    "06070D22484B0B172E1958",
    "$1$fake$FAKEUSERHASH7654321",
    "SuperPlaintext123",
    "FAKETACACSKEY0954A",
    "FakeRadiusKey!99",
    "FAKEPRESHAREDKEY77",
    "FAKEOSPFMD5KEY",
    "FakeHsrpKey55",
    "FAKEROCOMMUNITY",
    "FAKERWCOMMUNITY",
    "FAKENTPKEY111",
]


def test_detector_finds_all_planted_secrets():
    text = SECRETS_CFG.read_text()
    matches = detect_secrets(text)
    redacted_all = "\n".join(m.redacted_line for m in matches)
    kinds = {m.kind for m in matches}
    for secret in PLANTED_SECRETS:
        assert secret not in redacted_all, f"{secret} survived redaction"
    assert {"enable_secret", "username_secret", "snmp_community", "tacacs_key",
            "server_key", "ipsec_psk", "hsrp_auth", "ospf_md5", "ntp_auth_key"} <= kinds
    # Redaction must not reveal length
    assert all("<REDACTED>" in m.redacted_line for m in matches)


def _import_secrets_fixture(client, workspace_id) -> tuple[str, str]:
    resp = client.post(
        f"/api/workspaces/{workspace_id}/imports",
        files={"file": ("SECRETS-DEMO-01.cfg", SECRETS_CFG.read_bytes(), "text/plain")},
        data={"snapshot_name": "secrets-demo"},
    )
    assert resp.status_code == 202, resp.text
    body = resp.json()
    job = client.get(f"/api/jobs/{body['job_id']}").json()
    assert job["status"] == "done", job
    snapshot_id = job["result"]["snapshot_id"]
    devices = client.get(f"/api/snapshots/{snapshot_id}/devices").json()
    return snapshot_id, devices[0]["id"]


def _assert_no_secret(payload: str, context: str) -> None:
    for secret in PLANTED_SECRETS:
        assert secret not in payload, f"secret {secret!r} leaked via {context}"


def test_no_secret_leaves_the_api_by_default(client, workspace_id):
    snapshot_id, device_id = _import_secrets_fixture(client, workspace_id)

    surfaces = {
        "device config (default)": client.get(f"/api/devices/{device_id}/config"),
        "device detail": client.get(f"/api/devices/{device_id}"),
        "device list": client.get(f"/api/snapshots/{snapshot_id}/devices"),
        "search for community": client.get(
            f"/api/snapshots/{snapshot_id}/search", params={"q": "community"}),
        "search for key": client.get(
            f"/api/snapshots/{snapshot_id}/search", params={"q": "key"}),
        "snapshot": client.get(f"/api/snapshots/{snapshot_id}"),
        "topology": client.get(f"/api/snapshots/{snapshot_id}/topology"),
        "report (default)": client.get(f"/api/snapshots/{snapshot_id}/report"),
        "import list": client.get(f"/api/workspaces/{workspace_id}/imports"),
    }
    for context, resp in surfaces.items():
        assert resp.status_code == 200, (context, resp.text)
        _assert_no_secret(resp.text, context)

    # Searching for the literal secret value must find nothing.
    miss = client.get(f"/api/snapshots/{snapshot_id}/search",
                      params={"q": "FAKEROCOMMUNITY"}).json()
    assert miss["hits"] == []

    config = client.get(f"/api/devices/{device_id}/config").json()
    assert config["redacted"] is True
    assert config["secret_count"] == len(PLANTED_SECRETS)
    assert sum("<REDACTED>" in line for line in config["lines"]) == len(PLANTED_SECRETS)


def test_explicit_unredacted_viewer_still_works(client, workspace_id):
    _, device_id = _import_secrets_fixture(client, workspace_id)
    config = client.get(f"/api/devices/{device_id}/config",
                        params={"redacted": "false"}).json()
    assert config["redacted"] is False
    text = "\n".join(config["lines"])
    for secret in PLANTED_SECRETS:
        assert secret in text  # the one sanctioned escape hatch


def test_diff_output_is_redacted(client, workspace_id):
    """A secret rotation between snapshots must not leak either value."""
    old = SECRETS_CFG.read_text()
    new = old.replace("FAKEROCOMMUNITY", "ROTATEDCOMMUNITY99")

    for name, content in (("s1", old), ("s2", new)):
        resp = client.post(
            f"/api/workspaces/{workspace_id}/imports",
            files={"file": (f"{name}.cfg", content.encode(), "text/plain")},
            data={"snapshot_name": name},
        )
        job = client.get(f"/api/jobs/{resp.json()['job_id']}").json()
        assert job["status"] == "done"

    snaps = {s["display_name"]: s["id"] for s in
             client.get(f"/api/workspaces/{workspace_id}/snapshots").json()}
    diff = client.get(f"/api/workspaces/{workspace_id}/diff",
                      params={"base": snaps["s1"], "target": snaps["s2"]})
    assert diff.status_code == 200
    _assert_no_secret(diff.text, "diff")
    assert "ROTATEDCOMMUNITY99" not in diff.text
    # The device is reported as changed, and the diff honestly says the only
    # differences are inside redacted values (a credential rotation).
    body = diff.json()
    assert body["devices_changed"] == ["SECRETS-DEMO-01"]
    assert "within redacted secret values" in diff.text


def test_report_redacted_by_default_and_unredacted_on_request(client, workspace_id):
    snapshot_id, _ = _import_secrets_fixture(client, workspace_id)
    default = client.get(f"/api/snapshots/{snapshot_id}/report")
    assert default.status_code == 200
    assert "Secrets redacted" in default.text
    _assert_no_secret(default.text, "default report")

    unredacted = client.get(f"/api/snapshots/{snapshot_id}/report",
                            params={"redacted": "false"})
    assert "UNREDACTED REPORT" in unredacted.text
    assert "FAKEROCOMMUNITY" in unredacted.text


def test_fixture_lab_secrets_are_detected_too(client, workspace_id):
    """The standard lab fixtures also carry enable secrets + snmp communities;
    they must be flagged and redacted like any other import."""
    from .conftest import import_snapshot

    snapshot_id = import_snapshot(client, workspace_id, "baseline", "lab")
    devices = client.get(f"/api/snapshots/{snapshot_id}/devices").json()
    assert all(d["secret_count"] >= 2 for d in devices)  # enable secret + snmp
    for d in devices:
        cfg = client.get(f"/api/devices/{d['id']}/config").json()
        text = "\n".join(cfg["lines"])
        assert "labro" not in text  # the lab's snmp community string
        assert "$1$abcd$" not in text and "$9$abcd$" not in text
