from .conftest import import_snapshot


def test_degraded_mode_never_guesses_a_verdict(client, workspace_id):
    snapshot_id = import_snapshot(client, workspace_id, "baseline", "path-snap")
    resp = client.post(
        f"/api/snapshots/{snapshot_id}/path-analysis",
        json={"src_ip": "10.10.10.42", "dst_ip": "10.10.20.50",
              "protocol": "tcp", "dst_port": 443},
    )
    assert resp.status_code == 200
    body = resp.json()

    # Batfish is off: verdict must be unknown, not permitted/denied
    assert body["verdict"] == "unknown"
    assert body["verdict_source"] == "none"
    assert "no forwarding or filtering verdict" in body["verdict_explanation"].lower() or \
        "batfish" in body["verdict_explanation"].lower()

    # Endpoint location is confirmed evidence (subnet ownership)
    assert body["src_locations"][0]["hostname"] == "DIST-SW-01"
    assert body["src_locations"][0]["subnet"] == "10.10.10.0/24"
    assert body["dst_locations"][0]["subnet"] == "10.10.20.0/24"
    assert body["missing_evidence"] == []

    # Candidate evidence includes the permitting ACL entry with exact line
    acl_hits = [e for e in body["candidate_evidence"] if e["type"] == "acl_entry_match"]
    dist_hit = next(e for e in acl_hits if e["acl_name"] == "SERVERS-IN")
    assert dist_hit["action"] == "permit"
    assert dist_hit["confidence"] == "inferred"
    assert dist_hit["evidence"]["lines"]
    assert "eq 443" in dist_hit["entry_text"]


def test_degraded_mode_reports_missing_endpoint_evidence(client, workspace_id):
    snapshot_id = import_snapshot(client, workspace_id, "baseline", "path-snap2")
    body = client.post(
        f"/api/snapshots/{snapshot_id}/path-analysis",
        json={"src_ip": "172.16.0.10", "dst_ip": "10.10.20.50",
              "protocol": "tcp", "dst_port": 443},
    ).json()
    assert body["verdict"] == "unknown"
    assert body["src_locations"] == []
    assert any("172.16.0.10" in m for m in body["missing_evidence"])


def test_path_query_validation(client, workspace_id):
    snapshot_id = import_snapshot(client, workspace_id, "baseline", "path-snap3")
    resp = client.post(
        f"/api/snapshots/{snapshot_id}/path-analysis",
        json={"src_ip": "not-an-ip", "dst_ip": "10.10.20.50", "protocol": "tcp"},
    )
    assert resp.status_code == 422
    resp = client.post(
        f"/api/snapshots/{snapshot_id}/path-analysis",
        json={"src_ip": "10.10.10.42", "dst_ip": "10.10.20.50", "protocol": "carrier-pigeon"},
    )
    assert resp.status_code == 422


def test_flow_matching_helpers_direction_sensitivity():
    """The candidate-evidence matcher must be direction-aware."""
    from app.services.pathfinder import _entry_matches

    class Entry:
        action = "permit"
        protocol = "tcp"
        src = {"kind": "wildcard", "ip": "10.10.10.0", "wildcard": "0.0.0.255"}
        dst = {"kind": "host", "ip": "10.10.20.50", "wildcard": None}
        src_port = None
        dst_port = {"op": "eq", "values": [443]}

    assert _entry_matches(Entry(), "10.10.10.42", "10.10.20.50", "tcp", 443, None)
    # Reversed direction must NOT match
    assert not _entry_matches(Entry(), "10.10.20.50", "10.10.10.42", "tcp", 443, None)
    # Wrong port / protocol must not match
    assert not _entry_matches(Entry(), "10.10.10.42", "10.10.20.50", "tcp", 80, None)
    assert not _entry_matches(Entry(), "10.10.10.42", "10.10.20.50", "udp", 443, None)
