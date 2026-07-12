from .conftest import import_snapshot


def _two_snapshots(client, workspace_id):
    base = import_snapshot(client, workspace_id, "baseline", "May baseline")
    target = import_snapshot(client, workspace_id, "changed", "June change",
                             stamp="2024-06-05_020000")
    return base, target


def test_diff_detects_semantic_changes(client, workspace_id):
    base, target = _two_snapshots(client, workspace_id)
    diff = client.get(
        f"/api/workspaces/{workspace_id}/diff", params={"base": base, "target": target}
    ).json()

    assert diff["devices_added"] == []
    assert diff["devices_removed"] == []
    assert set(diff["devices_changed"]) == {"ACCESS-SW-01", "CORE-RTR-01", "DIST-SW-01"}
    assert diff["devices_unchanged"] == ["EDGE-FW-01"]

    acl_changes = [c for c in diff["changes"] if c["category"] == "acl"]
    assert len(acl_changes) == 1
    change = acl_changes[0]
    assert change["hostname"] == "DIST-SW-01"
    assert change["entry_kind"] == "removed"
    assert "10.10.20.50 eq 443" in change["entry"]["text"]
    assert change["base_evidence_lines"]  # points at the exact removed line

    # Raw unified diff is present for every changed device
    dist_diff = next(d for d in diff["device_diffs"] if d["hostname"] == "DIST-SW-01")
    assert any(line.startswith("-") and "eq 443" in line for line in dist_diff["raw_diff"])

    # Noise changes are captured too (nothing is hidden from the user)
    desc_changes = [c for c in diff["changes"]
                    if c["category"] == "interface" and c.get("field") == "description"]
    assert any(c["hostname"] == "ACCESS-SW-01" for c in desc_changes)


def test_suspect_ranking_finds_the_culprit(client, workspace_id):
    base, target = _two_snapshots(client, workspace_id)
    resp = client.post(
        f"/api/workspaces/{workspace_id}/diff/suspects",
        params={"base": base, "target": target},
        json={"src_ip": "10.10.10.42", "dst_ip": "10.10.20.50",
              "protocol": "tcp", "dst_port": 443},
    )
    assert resp.status_code == 200
    body = resp.json()
    # Two semantic changes (ACL entry removed, description edited); the CORE
    # ntp change is visible only in the raw diff (not a modeled object).
    assert body["total_changes"] == 2

    top = body["suspects"][0]
    assert top["hostname"] == "DIST-SW-01"
    assert top["category"] == "acl"
    assert top["score"] == 100
    assert top["confidence"] == "inferred"
    assert "permit entry matching this exact flow was removed" in top["reasons"][0]

    # The cosmetic description change must not appear as a suspect
    assert not any(s.get("field") == "description" for s in body["suspects"])
    # And the honest scope note is present
    assert "not a forwarding simulation" in body["note"]


def test_suspect_ranking_ignores_unrelated_flow(client, workspace_id):
    base, target = _two_snapshots(client, workspace_id)
    resp = client.post(
        f"/api/workspaces/{workspace_id}/diff/suspects",
        params={"base": base, "target": target},
        json={"src_ip": "10.10.30.5", "dst_ip": "10.10.20.50",
              "protocol": "tcp", "dst_port": 443},
    )
    suspects = resp.json()["suspects"]
    # Voice VLAN was never permitted; the removed permit doesn't match this flow
    assert not any(s["score"] == 100 for s in suspects)
