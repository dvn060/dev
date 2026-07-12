from app.services.cisco_parser import parse_cisco_config

from .conftest import fixture_config


def test_parses_core_router_inventory():
    parsed = parse_cisco_config(fixture_config("baseline", "CORE-RTR-01.cfg"))
    assert parsed.hostname == "CORE-RTR-01"
    assert parsed.os_family == "ios"
    assert parsed.management_ip == "10.255.0.1"  # Loopback0 preferred

    names = {i.name for i in parsed.interfaces}
    assert {"Loopback0", "GigabitEthernet0/0", "GigabitEthernet0/1",
            "GigabitEthernet0/2"} <= names

    gi00 = next(i for i in parsed.interfaces if i.name == "GigabitEthernet0/0")
    assert gi00.ip_addresses[0].address == "10.0.0.1"
    assert gi00.ip_addresses[0].prefix_length == 30
    assert gi00.layer_role == "l3"

    gi02 = next(i for i in parsed.interfaces if i.name == "GigabitEthernet0/2")
    assert gi02.admin_state == "shutdown"

    default = next(r for r in parsed.static_routes if r.prefix == "0.0.0.0/0")
    assert default.next_hop_ip == "10.0.1.2"
    assert default.name == "DEFAULT-TO-EDGE"
    assert default.evidence_lines  # every object carries evidence


def test_parses_dist_switch_l2_l3():
    parsed = parse_cisco_config(fixture_config("baseline", "DIST-SW-01.cfg"))
    assert parsed.os_family == "ios-xe"

    vlan_ids = {v.vlan_id: v.name for v in parsed.vlans}
    assert vlan_ids == {10: "USERS", 20: "SERVERS", 30: "VOICE", 99: "MGMT"}

    trunk = next(i for i in parsed.interfaces if i.name == "GigabitEthernet1/0/1")
    assert trunk.switchport_mode == "trunk"
    assert trunk.native_vlan == 99
    assert trunk.trunk_allowed_vlans == "10,20,30,99"

    access = next(i for i in parsed.interfaces if i.name == "GigabitEthernet1/0/10")
    assert access.switchport_mode == "access"
    assert access.access_vlan == 20
    assert access.layer_role == "l2"

    svi20 = next(i for i in parsed.interfaces if i.name == "Vlan20")
    assert svi20.acl_out == "SERVERS-IN"


def test_parses_extended_acl_semantics():
    parsed = parse_cisco_config(fixture_config("baseline", "DIST-SW-01.cfg"))
    acl = next(a for a in parsed.acls if a.name == "SERVERS-IN")
    assert acl.kind == "extended"

    entries = [e for e in acl.entries if e.action != "remark"]
    https = entries[0]
    assert https.action == "permit"
    assert https.protocol == "tcp"
    assert https.src.matches("10.10.10.42")
    assert not https.src.matches("10.10.20.42")
    assert https.dst.matches("10.10.20.50")
    assert https.dst_port.matches(443)
    assert not https.dst_port.matches(80)
    assert https.line_number > 0

    last = entries[-1]
    assert last.action == "deny"
    assert last.src.kind == "any" and last.dst.kind == "any"

    established = next(e for e in entries if e.established)
    assert established.protocol == "tcp"


def test_banner_content_is_not_parsed():
    text = "\n".join([
        "hostname BANNERTEST",
        "banner motd ^C",
        "interface GigabitEthernet9/9",  # trap: looks like config, is banner text
        "ip route 1.2.3.4 255.255.255.255 5.6.7.8",
        "^C",
        "interface Loopback0",
        " ip address 1.1.1.1 255.255.255.255",
    ])
    parsed = parse_cisco_config(text)
    assert [i.name for i in parsed.interfaces] == ["Loopback0"]
    assert parsed.static_routes == []


def test_unknown_lines_lower_completeness_and_are_recorded():
    text = "\n".join([
        "hostname MYSTERY",
        "some-unknown-feature enable",
        "interface Loopback0",
        " ip address 1.1.1.1 255.255.255.255",
    ])
    parsed = parse_cisco_config(text)
    assert parsed.unparsed_lines == [2]
    assert parsed.completeness < 1.0


def test_unsupported_acl_entry_is_flagged_not_guessed():
    text = "\n".join([
        "hostname ACLTEST",
        "ip access-list extended WEIRD",
        " permit tcp any any time-range NIGHT",
        " permit object-group FOO any any",
    ])
    parsed = parse_cisco_config(text)
    acl = parsed.acls[0]
    # time-range: parsed match fields but flagged unmodeled qualifier
    assert acl.entries[0].action == "permit"
    assert any("time-range" in w.message.lower() or "unmodeled" in w.message.lower()
               for w in parsed.warnings)
    # object-group: cannot model the match at all -> unsupported, never a guess
    assert acl.entries[1].action == "unsupported"


def test_numbered_acl_and_default_gateway():
    text = "\n".join([
        "hostname L2SW",
        "access-list 10 permit 10.1.1.0 0.0.0.255",
        "access-list 110 deny tcp any host 10.9.9.9 eq 23",
        "ip default-gateway 10.1.1.1",
    ])
    parsed = parse_cisco_config(text)
    std = next(a for a in parsed.acls if a.name == "10")
    assert std.kind == "standard"
    assert std.entries[0].src.matches("10.1.1.7")
    ext = next(a for a in parsed.acls if a.name == "110")
    assert ext.kind == "extended"
    assert ext.entries[0].dst_port.matches(23)
    assert parsed.static_routes[0].prefix == "0.0.0.0/0"
    assert parsed.static_routes[0].next_hop_ip == "10.1.1.1"
