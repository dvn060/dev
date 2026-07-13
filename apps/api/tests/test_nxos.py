"""NX-OS parsing and import behavior (deterministic part; Batfish behavior is
verified live against the containerized engine — see fixtures/README.md)."""

from app.services.cisco_parser import parse_cisco_config

from .conftest import FIXTURES

NXOS_CFG = FIXTURES / "cisco" / "nxos" / "NXOS-CORE-01.cfg"


def test_nxos_inventory_parses():
    d = parse_cisco_config(NXOS_CFG.read_text())
    assert d.hostname == "NXOS-CORE-01"
    assert d.os_family == "nx-os"
    assert d.management_ip == "10.20.99.10"  # mgmt0 preferred

    names = {i.name for i in d.interfaces}
    assert {"Vlan110", "Vlan120", "port-channel10", "Ethernet1/1",
            "Ethernet1/2", "mgmt0"} <= names

    svi110 = next(i for i in d.interfaces if i.name == "Vlan110")
    assert svi110.ip_addresses[0].address == "10.20.110.2"
    assert svi110.ip_addresses[0].prefix_length == 24
    assert svi110.acl_in == "APP-TO-DB"

    mgmt = next(i for i in d.interfaces if i.name == "mgmt0")
    assert mgmt.vrf == "management"

    assert {(v.vlan_id, v.name) for v in d.vlans} == {(110, "PROD-APP"), (120, "PROD-DB")}


def test_nxos_acl_prefix_notation_and_vrf_routes():
    d = parse_cisco_config(NXOS_CFG.read_text())

    acl = next(a for a in d.acls if a.name == "APP-TO-DB")
    e = acl.entries[0]
    assert e.sequence == 10 and e.action == "permit" and e.protocol == "tcp"
    assert e.src.matches("10.20.110.55") and not e.src.matches("10.20.111.55")
    assert e.dst_port.matches(1433) and not e.dst_port.matches(1434)
    assert acl.entries[-1].action == "deny"

    # vrf-context route stays in its VRF; global default stays global
    routes = {(r.prefix, r.vrf): r for r in d.static_routes}
    assert routes[("0.0.0.0/0", "management")].next_hop_ip == "10.20.99.1"
    assert routes[("0.0.0.0/0", None)].next_hop_ip == "10.20.110.254"


def test_nxos_unsupported_syntax_surfaces_as_warnings():
    d = parse_cisco_config(NXOS_CFG.read_text())
    # HSRP blocks are not modeled by the inventory parser: warnings, not silence
    hsrp_warnings = [w for w in d.warnings if "hsrp" in w.message.lower()
                     or w.message.strip().endswith(("110", "120", "10.20.110.1", "10.20.120.1"))]
    assert len(hsrp_warnings) >= 2
    assert all(w.line > 0 for w in d.warnings)
    assert d.unparsed_lines == []  # everything else is either modeled or benign
    assert 0.85 < d.completeness < 1.0  # honest, not inflated


def test_nxos_import_emits_show_run_all_advisory(client, workspace_id):
    resp = client.post(
        f"/api/workspaces/{workspace_id}/imports",
        files={"file": ("NXOS-CORE-01.cfg", NXOS_CFG.read_bytes(), "text/plain")},
        data={"snapshot_name": "nxos"},
    )
    job = client.get(f"/api/jobs/{resp.json()['job_id']}").json()
    assert job["status"] == "done", job

    devices = client.get(f"/api/snapshots/{job['result']['snapshot_id']}/devices").json()
    assert devices[0]["hostname"] == "NXOS-CORE-01"
    assert devices[0]["os_family"] == "nx-os"

    detail = client.get(f"/api/imports/{resp.json()['import_id']}").json()
    advisory = [e for e in detail["log"] if "show running-config all" in e["message"]]
    assert len(advisory) == 1
