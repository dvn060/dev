from .conftest import import_snapshot


def test_topology_tiers(client, workspace_id):
    snapshot_id = import_snapshot(client, workspace_id, "baseline", "topo")
    topo = client.get(f"/api/snapshots/{snapshot_id}/topology").json()

    device_nodes = [n for n in topo["nodes"] if n["type"] == "device"]
    assert {n["label"] for n in device_nodes} == {
        "ACCESS-SW-01", "CORE-RTR-01", "DIST-SW-01", "EDGE-FW-01"
    }

    by_kind = {}
    for e in topo["edges"]:
        by_kind.setdefault(e["kind"], []).append(e)

    # /30 point-to-point links: CORE<->DIST and CORE<->EDGE (inferred tier)
    p2p = by_kind.get("l3_point_to_point", [])
    assert {e["label"] for e in p2p} >= {"10.0.0.0/30", "10.0.1.0/30"}
    assert all(e["confidence"] == "inferred" for e in p2p)
    assert all(e["data"]["explanation"] for e in p2p)

    # Management /24 shared by DIST SVI and ACCESS SVI: network node with
    # confirmed membership edges carrying evidence lines.
    memberships = by_kind.get("l3_subnet_membership", [])
    mgmt = [e for e in memberships if e["data"]["subnet"] == "10.10.99.0/24"]
    assert len(mgmt) == 2
    assert all(e["confidence"] == "confirmed" for e in mgmt)
    assert all(e["data"]["evidence"][0]["lines"] for e in mgmt)

    # Description hints exist only where no stronger edge exists (possible tier)
    hints = by_kind.get("description_hint", [])
    assert all(e["confidence"] == "possible" for e in hints)
    hint_pairs = {frozenset([e["source"], e["target"]]) for e in hints}
    p2p_pairs = {frozenset([e["source"], e["target"]]) for e in p2p}
    assert not (hint_pairs & p2p_pairs)
    # DIST<->ACCESS trunk is only visible via descriptions (possible link)
    dist = next(n for n in device_nodes if n["label"] == "DIST-SW-01")["id"]
    access = next(n for n in device_nodes if n["label"] == "ACCESS-SW-01")["id"]
    assert frozenset([dist, access]) in hint_pairs


def test_shutdown_interfaces_do_not_create_edges(client, workspace_id):
    snapshot_id = import_snapshot(client, workspace_id, "baseline", "topo2")
    topo = client.get(f"/api/snapshots/{snapshot_id}/topology").json()
    # CORE Gi0/2 is shutdown and has no IP; ensure no edge references it
    assert not any(
        e["data"].get("interface") == "GigabitEthernet0/2" for e in topo["edges"]
    )
