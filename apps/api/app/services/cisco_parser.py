"""Deterministic Cisco IOS/IOS-XE/NX-OS configuration parser.

Scope and philosophy
--------------------
This parser exists to build the *evidence layer*: every extracted object keeps
the exact 1-based line numbers it came from, so the UI can always show the
user the configuration text that supports a conclusion.

It deliberately does NOT try to be a forwarding engine. Behavioral questions
(routing, reachability, ACL evaluation along a path) are answered by Batfish.
This parser feeds inventory, evidence mapping, topology presentation, search
and diff.

Anything the parser does not understand is recorded — never silently dropped:
* `warnings`   – lines we recognized as important but could not fully model.
* `unparsed_lines` – top-level lines outside the known-benign set.
* `completeness` – ratio of understood lines, surfaced in the UI so the user
  knows how much of the configuration the analysis actually covers.
"""

from __future__ import annotations

import ipaddress
import re
from dataclasses import dataclass, field

# ---------------------------------------------------------------------------
# Parsed-object dataclasses (in-memory; persisted by the importer)
# ---------------------------------------------------------------------------


@dataclass
class ParseWarning:
    line: int
    message: str

    def as_dict(self) -> dict:
        return {"line": self.line, "message": self.message}


@dataclass
class ParsedIpAddress:
    address: str
    prefix_length: int
    secondary: bool = False

    def as_dict(self) -> dict:
        return {
            "address": self.address,
            "prefix_length": self.prefix_length,
            "secondary": self.secondary,
        }

    @property
    def network(self) -> ipaddress.IPv4Network:
        return ipaddress.IPv4Network(f"{self.address}/{self.prefix_length}", strict=False)


@dataclass
class ParsedInterface:
    name: str
    description: str = ""
    admin_state: str = "up"
    switchport_mode: str | None = None
    access_vlan: int | None = None
    native_vlan: int | None = None
    trunk_allowed_vlans: str | None = None
    ip_addresses: list[ParsedIpAddress] = field(default_factory=list)
    vrf: str | None = None
    acl_in: str | None = None
    acl_out: str | None = None
    evidence_lines: list[int] = field(default_factory=list)

    @property
    def layer_role(self) -> str:
        if self.ip_addresses:
            return "l3"
        if self.switchport_mode is not None:
            return "l2"
        return "unknown"


@dataclass
class ParsedVlan:
    vlan_id: int
    name: str | None = None
    evidence_lines: list[int] = field(default_factory=list)


@dataclass
class ParsedStaticRoute:
    prefix: str  # CIDR
    next_hop_ip: str | None = None
    next_hop_interface: str | None = None
    admin_distance: int | None = None
    vrf: str | None = None
    name: str | None = None
    evidence_lines: list[int] = field(default_factory=list)


@dataclass
class AclAddress:
    kind: str  # any | host | wildcard
    ip: str | None = None
    wildcard: str | None = None

    def as_dict(self) -> dict:
        return {"kind": self.kind, "ip": self.ip, "wildcard": self.wildcard}

    def matches(self, address: str) -> bool:
        """Deterministic address match using wildcard-mask semantics."""
        if self.kind == "any":
            return True
        addr = int(ipaddress.ip_address(address))
        base = int(ipaddress.ip_address(self.ip or "0.0.0.0"))
        if self.kind == "host":
            return addr == base
        wc = int(ipaddress.ip_address(self.wildcard or "0.0.0.0"))
        return (addr & ~wc) == (base & ~wc)


@dataclass
class AclPortMatch:
    op: str  # eq | range | gt | lt | neq
    values: list[int] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {"op": self.op, "values": self.values}

    def matches(self, port: int) -> bool:
        if self.op == "eq":
            return port in self.values
        if self.op == "neq":
            return port not in self.values
        if self.op == "gt":
            return port > self.values[0]
        if self.op == "lt":
            return port < self.values[0]
        if self.op == "range":
            return self.values[0] <= port <= self.values[1]
        return False


@dataclass
class ParsedAclEntry:
    action: str  # permit | deny | remark | unsupported
    text: str
    line_number: int
    sequence: int | None = None
    protocol: str | None = None
    src: AclAddress | None = None
    dst: AclAddress | None = None
    src_port: AclPortMatch | None = None
    dst_port: AclPortMatch | None = None
    established: bool = False


@dataclass
class ParsedAcl:
    name: str
    kind: str  # standard | extended
    entries: list[ParsedAclEntry] = field(default_factory=list)
    evidence_lines: list[int] = field(default_factory=list)


@dataclass
class ParsedDevice:
    hostname: str = ""
    os_family: str = "unknown"
    model: str | None = None
    version: str | None = None
    management_ip: str | None = None
    interfaces: list[ParsedInterface] = field(default_factory=list)
    vlans: list[ParsedVlan] = field(default_factory=list)
    static_routes: list[ParsedStaticRoute] = field(default_factory=list)
    acls: list[ParsedAcl] = field(default_factory=list)
    warnings: list[ParseWarning] = field(default_factory=list)
    unparsed_lines: list[int] = field(default_factory=list)
    total_significant_lines: int = 0
    parsed_significant_lines: int = 0

    @property
    def completeness(self) -> float:
        if self.total_significant_lines == 0:
            return 0.0
        return round(self.parsed_significant_lines / self.total_significant_lines, 4)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_WELL_KNOWN_PORTS = {
    "bgp": 179, "bootpc": 68, "bootps": 67, "domain": 53, "ftp": 21, "ftp-data": 20,
    "www": 80, "http": 80, "https": 443, "isakmp": 500, "ntp": 123, "pop3": 110,
    "smtp": 25, "snmp": 161, "snmptrap": 162, "ssh": 22, "syslog": 514, "telnet": 23,
    "tftp": 69, "msrpc": 135, "netbios-ns": 137, "netbios-dgm": 138, "netbios-ss": 139,
    "ldap": 389, "ldaps": 636, "3389": 3389, "domain-s": 853, "echo": 7, "discard": 9,
    "lpd": 515, "kerberos": 88, "sunrpc": 111, "nfs": 2049, "rip": 520,
}

_PROTOCOL_NAMES = {
    "ip", "tcp", "udp", "icmp", "igmp", "gre", "esp", "ahp", "ospf", "eigrp", "pim",
}

# ICMP message-type keywords that may trail an icmp ACL entry. They are kept in
# the entry text (evidence) but do not affect the port-level match model.
_ICMP_TYPE_KEYWORDS = {
    "echo", "echo-reply", "ttl-exceeded", "unreachable", "host-unreachable",
    "port-unreachable", "net-unreachable", "packet-too-big", "redirect",
    "time-exceeded", "traceroute", "source-quench", "parameter-problem",
}

# Top-level command prefixes that are recognized-and-safe-to-skip: they do not
# affect inventory/topology/filtering answers we present. Counting them as
# understood keeps the completeness score honest (it measures *unknown*
# content, not content we intentionally don't model).
_KNOWN_BENIGN_PREFIXES = (
    "service ", "no service ", "boot-start-marker", "boot-end-marker", "boot system",
    "enable secret", "enable password", "username ", "aaa ", "no aaa ",
    "clock ", "ntp ", "ip domain", "ip name-server", "no ip domain",
    "ip ssh ", "ip scp ", "crypto key", "ip cef", "no ip cef", "ipv6 cef",
    "no ipv6 cef", "ip forward-protocol", "no ip http", "ip http",
    "logging ", "no logging ", "snmp-server community", "snmp-server host",
    "snmp-server enable", "snmp-server chassis-id",
    "spanning-tree ", "no spanning-tree", "vtp ", "udld ", "errdisable ",
    "license ", "diagnostic ", "memory-size ", "archive", "end", "exit",
    "alias ", "ip classless", "no ip classless", "ip subnet-zero",
    "no ip source-route", "ip source-route", "mls ", "system mtu",
    "power ", "stack-mac ", "switch ", "redundancy", "control-plane",
    "call-home", "multilink", "platform ", "transceiver ", "no platform",
    "device-tracking", "authentication ", "dot1x ", "cts ", "table-map ",
    "class-map ", "policy-map ", "key chain ", "track ", "event manager ",
    "kron ", "scheduler ", "process ", "no scheduler", "vstack", "no vstack",
    "setup express", "no setup express", "ip dhcp ", "no ip dhcp",
    "cdp ", "no cdp ", "lldp ", "no lldp ",
)

# Block (indented-mode) commands we consume without modeling.
_KNOWN_BENIGN_BLOCKS = (
    "line ", "banner ", "class-map", "policy-map", "ip dhcp pool", "vrf definition",
    "ip vrf ", "router ", "key chain", "crypto ", "monitor session", "track ",
    "l2vpn", "mpls ", "interface-range", "vpc domain", "feature-set",
)

_INTERFACE_ABBREVIATIONS = {
    "gi": "GigabitEthernet", "gig": "GigabitEthernet", "te": "TenGigabitEthernet",
    "fa": "FastEthernet", "eth": "Ethernet", "po": "Port-channel", "lo": "Loopback",
    "vl": "Vlan", "tu": "Tunnel", "se": "Serial", "twe": "TwentyFiveGigE",
    "fo": "FortyGigabitEthernet", "hu": "HundredGigE", "mg": "mgmt",
}


def canonical_interface_name(name: str) -> str:
    """Expand common abbreviations: Gi0/1 -> GigabitEthernet0/1."""
    m = re.match(r"^([A-Za-z-]+)([\d/.:]+.*)$", name.strip())
    if not m:
        return name.strip()
    prefix, rest = m.group(1), m.group(2)
    low = prefix.lower()
    for abbr in sorted(_INTERFACE_ABBREVIATIONS, key=len, reverse=True):
        full = _INTERFACE_ABBREVIATIONS[abbr]
        if low == abbr or full.lower().startswith(low):
            return full + rest if low != full.lower() else prefix + rest
    return name.strip()


def _mask_to_prefix(mask: str) -> int:
    return ipaddress.IPv4Network(f"0.0.0.0/{mask}").prefixlen


def _parse_port_token(tokens: list[str], i: int) -> tuple[AclPortMatch | None, int]:
    """Parse an optional port operator at tokens[i]. Returns (match, new_index)."""
    if i >= len(tokens):
        return None, i
    op = str(tokens[i]).lower()
    if op not in ("eq", "neq", "gt", "lt", "range"):
        return None, i
    def val(tok: int | str) -> int:
        t = str(tok).lower()
        if t.isdigit():
            return int(t)
        if t in _WELL_KNOWN_PORTS:
            return _WELL_KNOWN_PORTS[t]
        raise ValueError(f"unknown port name {tok!r}")

    if op == "range":
        match = AclPortMatch(op="range", values=[val(tokens[i + 1]), val(tokens[i + 2])])
        return match, i + 3
    if op == "eq":
        # eq can take multiple port values; consume while tokens look like ports
        values = []
        j = i + 1
        while j < len(tokens):
            try:
                values.append(val(tokens[j]))
                j += 1
            except (ValueError, IndexError):
                break
        if not values:
            raise ValueError("eq with no port value")
        return AclPortMatch(op="eq", values=values), j
    match = AclPortMatch(op=op, values=[val(tokens[i + 1])])
    return match, i + 2


def _parse_acl_address(tokens: list[str], i: int) -> tuple[AclAddress, int]:
    tok = tokens[i].lower()
    if tok == "any":
        return AclAddress(kind="any"), i + 1
    if tok == "host":
        return AclAddress(kind="host", ip=tokens[i + 1]), i + 2
    # A.B.C.D wildcard  — wildcard may be omitted in standard ACLs (host match)
    ipaddress.ip_address(tokens[i])  # raises if not an address
    if i + 1 < len(tokens):
        try:
            ipaddress.ip_address(tokens[i + 1])
            return AclAddress(kind="wildcard", ip=tokens[i], wildcard=tokens[i + 1]), i + 2
        except ValueError:
            pass
    return AclAddress(kind="host", ip=tokens[i]), i + 1


# ---------------------------------------------------------------------------
# Parser
# ---------------------------------------------------------------------------


class CiscoConfigParser:
    def parse(self, text: str) -> ParsedDevice:
        device = ParsedDevice()
        lines = text.splitlines()
        n = len(lines)
        i = 0

        significant = 0
        parsed = 0

        while i < n:
            raw = lines[i]
            lineno = i + 1
            stripped = raw.strip()

            # Blank lines, comments and NCM/export banners are not significant.
            if not stripped or stripped.startswith("!") or stripped.startswith("#"):
                i += 1
                continue

            significant += 1

            # ---- banner blocks: consume to closing delimiter, never parse contents
            m = re.match(r"^banner\s+\S+\s+(\S)", stripped)
            if m:
                delim = m.group(1)
                # Same-line closing delimiter?
                after = stripped.split(delim, 1)[1] if delim in stripped else ""
                i += 1
                if delim not in after:
                    while i < n and delim not in lines[i]:
                        i += 1
                    i += 1  # consume closing line
                parsed += 1
                continue

            # ---- hostname / version / os hints
            if stripped.startswith("hostname "):
                device.hostname = stripped.split(None, 1)[1].strip().strip('"')
                parsed += 1
                i += 1
                continue
            if stripped.startswith("version "):
                device.version = stripped.split(None, 1)[1]
                parsed += 1
                i += 1
                continue
            if stripped.startswith("feature ") or stripped.startswith("boot nxos"):
                device.os_family = "nx-os"
                parsed += 1
                i += 1
                continue
            if stripped.startswith("boot system flash bootflash") or "packages.conf" in stripped:
                device.os_family = "ios-xe"
                parsed += 1
                i += 1
                continue

            # ---- interface block
            m = re.match(r"^interface\s+(\S+.*)$", stripped)
            if m:
                iface = ParsedInterface(name=m.group(1).strip(), evidence_lines=[lineno])
                parsed += 1
                i += 1
                while i < n and (lines[i].startswith(" ") or lines[i].strip() == "!"):
                    sub = lines[i].strip()
                    subno = i + 1
                    if sub and sub != "!":
                        significant += 1
                        if self._parse_interface_sub(iface, sub, subno, device):
                            parsed += 1
                        iface.evidence_lines.append(subno)
                    i += 1
                device.interfaces.append(iface)
                continue

            # ---- vlan definitions: "vlan 10" or "vlan 10,20,30"
            m = re.match(r"^vlan\s+([\d,\-\s]+)$", stripped)
            if m:
                ids = self._expand_vlan_list(m.group(1))
                parsed += 1
                start = i
                i += 1
                name: str | None = None
                evidence = [start + 1]
                while i < n and lines[i].startswith(" "):
                    sub = lines[i].strip()
                    significant += 1
                    if sub.startswith("name "):
                        name = sub.split(None, 1)[1]
                        parsed += 1
                    else:
                        parsed += 1  # vlan sub-commands (state etc.) are benign
                    evidence.append(i + 1)
                    i += 1
                for vid in ids:
                    device.vlans.append(
                        ParsedVlan(vlan_id=vid, name=name if len(ids) == 1 else None,
                                   evidence_lines=list(evidence))
                    )
                continue

            # ---- static routes
            m = re.match(
                r"^ip route\s+(?:vrf\s+(\S+)\s+)?(\d+\.\d+\.\d+\.\d+)\s+(\d+\.\d+\.\d+\.\d+)\s+(.+)$",
                stripped,
            )
            if m:
                route = self._parse_static_route(m, lineno, device)
                if route:
                    device.static_routes.append(route)
                    parsed += 1
                i += 1
                continue

            # ---- ip routing toggle (benign for inventory; Batfish models it)
            if stripped in ("ip routing", "no ip routing"):
                parsed += 1
                i += 1
                continue

            # ---- ip default-gateway: modeled as a default route so L2 switches
            # still show their exit point (evidence-linked like any route)
            m = re.match(r"^ip default-gateway\s+(\d+\.\d+\.\d+\.\d+)$", stripped)
            if m:
                device.static_routes.append(ParsedStaticRoute(
                    prefix="0.0.0.0/0", next_hop_ip=m.group(1),
                    name="default-gateway", evidence_lines=[lineno],
                ))
                parsed += 1
                i += 1
                continue

            # ---- numbered ACLs (classic syntax, one line per entry)
            m = re.match(r"^access-list\s+(\d+)\s+(.*)$", stripped)
            if m:
                self._parse_numbered_acl_line(device, m.group(1), m.group(2), stripped, lineno)
                parsed += 1
                i += 1
                continue

            # ---- named ACLs (block syntax)
            m = re.match(r"^ip access-list\s+(standard|extended)\s+(\S+)$", stripped)
            if m:
                acl = ParsedAcl(name=m.group(2), kind=m.group(1), evidence_lines=[lineno])
                parsed += 1
                i += 1
                while i < n and (lines[i].startswith(" ") or lines[i].strip() == "!"):
                    sub = lines[i].strip()
                    subno = i + 1
                    if sub and sub != "!":
                        significant += 1
                        entry = self._parse_acl_entry(sub, subno, acl.kind, device)
                        acl.entries.append(entry)
                        acl.evidence_lines.append(subno)
                        parsed += 1
                    i += 1
                device.acls.append(acl)
                continue

            # ---- known-benign single-line commands
            if any(stripped.startswith(p) or stripped == p.strip() for p in _KNOWN_BENIGN_PREFIXES):
                parsed += 1
                i += 1
                continue

            # ---- known-benign blocks: consume indented children without modeling
            if any(stripped.startswith(p) for p in _KNOWN_BENIGN_BLOCKS):
                if stripped.startswith("router "):
                    device.warnings.append(ParseWarning(
                        line=lineno,
                        message=f"Dynamic routing configuration ('{stripped}') is not modeled "
                                "by the inventory parser; Batfish analyzes it when available.",
                    ))
                parsed += 1
                i += 1
                while i < n and (lines[i].startswith(" ") or lines[i].strip() == "!"):
                    if lines[i].strip() and lines[i].strip() != "!":
                        significant += 1
                        parsed += 1
                    i += 1
                continue

            # ---- ipv6 static routes: recorded as unsupported (v4-first MVP)
            if stripped.startswith("ipv6 route "):
                device.warnings.append(ParseWarning(
                    line=lineno, message="IPv6 static routes are not yet modeled."
                ))
                device.unparsed_lines.append(lineno)
                i += 1
                continue

            # ---- anything else: unknown top-level line
            device.unparsed_lines.append(lineno)
            i += 1

        device.total_significant_lines = significant
        device.parsed_significant_lines = parsed
        if device.os_family == "unknown" and device.hostname:
            device.os_family = "ios"
        device.management_ip = self._pick_management_ip(device)
        return device

    # -- interface sub-commands ------------------------------------------------

    def _parse_interface_sub(
        self, iface: ParsedInterface, sub: str, lineno: int, device: ParsedDevice
    ) -> bool:
        if sub.startswith("description "):
            iface.description = sub.split(None, 1)[1]
            return True
        if sub == "shutdown":
            iface.admin_state = "shutdown"
            return True
        if sub == "no shutdown":
            iface.admin_state = "up"
            return True
        m = re.match(r"^ip address\s+(\d+\.\d+\.\d+\.\d+)\s+(\d+\.\d+\.\d+\.\d+)(\s+secondary)?$", sub)
        if m:
            try:
                iface.ip_addresses.append(ParsedIpAddress(
                    address=m.group(1),
                    prefix_length=_mask_to_prefix(m.group(2)),
                    secondary=bool(m.group(3)),
                ))
            except ValueError:
                device.warnings.append(ParseWarning(line=lineno, message=f"Bad IP address: {sub}"))
            return True
        m = re.match(r"^ip address\s+(\d+\.\d+\.\d+\.\d+)/(\d+)$", sub)  # NX-OS style
        if m:
            iface.ip_addresses.append(
                ParsedIpAddress(address=m.group(1), prefix_length=int(m.group(2)))
            )
            return True
        if sub == "switchport mode access":
            iface.switchport_mode = "access"
            return True
        if sub == "switchport mode trunk":
            iface.switchport_mode = "trunk"
            return True
        m = re.match(r"^switchport access vlan (\d+)$", sub)
        if m:
            iface.access_vlan = int(m.group(1))
            if iface.switchport_mode is None:
                iface.switchport_mode = "access"
            return True
        m = re.match(r"^switchport trunk native vlan (\d+)$", sub)
        if m:
            iface.native_vlan = int(m.group(1))
            return True
        m = re.match(r"^switchport trunk allowed vlan (?:add )?(\S+)$", sub)
        if m:
            existing = iface.trunk_allowed_vlans
            iface.trunk_allowed_vlans = f"{existing},{m.group(1)}" if existing else m.group(1)
            return True
        m = re.match(r"^(?:ip )?vrf (?:forwarding|member) (\S+)$", sub)
        if m:
            iface.vrf = m.group(1)
            return True
        m = re.match(r"^ip access-group (\S+) (in|out)$", sub)
        if m:
            if m.group(2) == "in":
                iface.acl_in = m.group(1)
            else:
                iface.acl_out = m.group(1)
            return True
        # benign / unmodeled interface sub-commands are counted as understood
        benign = (
            "switchport", "no switchport", "spanning-tree", "speed", "duplex", "negotiation",
            "no ip address", "cdp", "no cdp", "channel-group", "storm-control", "srr-queue",
            "priority-queue", "mls qos", "queue-set", "load-interval", "media-type", "logging",
            "keepalive", "no keepalive", "carrier-delay", "ip helper-address", "standby",
            "vrrp", "hold-queue", "snmp", "ipv6", "encapsulation", "bandwidth", "delay",
            "mtu", "ip mtu", "ip ospf", "ip pim", "ip igmp", "service-policy", "power",
            "auto qos", "dot1x", "authentication", "mab", "device-tracking", "udld",
            "no snmp", "lldp", "no lldp", "no mop", "mop", "arp timeout", "flowcontrol",
            "no cdp enable",
        )
        if any(sub.startswith(b) for b in benign):
            return True
        device.warnings.append(
            ParseWarning(line=lineno, message=f"Unrecognized interface command: {sub}")
        )
        return False

    # -- routes ------------------------------------------------------------------

    def _parse_static_route(self, m: re.Match, lineno: int, device: ParsedDevice):
        vrf, network, mask, rest = m.group(1), m.group(2), m.group(3), m.group(4)
        try:
            prefix = str(ipaddress.ip_network(f"{network}/{_mask_to_prefix(mask)}", strict=False))
        except ValueError:
            device.warnings.append(ParseWarning(line=lineno, message=f"Bad route: {m.group(0)}"))
            return None
        tokens = rest.split()
        route = ParsedStaticRoute(prefix=prefix, vrf=vrf, evidence_lines=[lineno])
        j = 0
        while j < len(tokens):
            tok = tokens[j]
            if re.match(r"^\d+\.\d+\.\d+\.\d+$", tok):
                route.next_hop_ip = tok
            elif tok.isdigit():
                route.admin_distance = int(tok)
            elif tok == "name" and j + 1 < len(tokens):
                route.name = tokens[j + 1]
                j += 1
            elif tok in ("permanent", "tag", "track"):
                if tok in ("tag", "track"):
                    j += 1
            else:
                route.next_hop_interface = canonical_interface_name(tok)
            j += 1
        return route

    # -- ACLs ----------------------------------------------------------------------

    def _get_or_create_acl(self, device: ParsedDevice, name: str, kind: str) -> ParsedAcl:
        for acl in device.acls:
            if acl.name == name:
                return acl
        acl = ParsedAcl(name=name, kind=kind)
        device.acls.append(acl)
        return acl

    def _parse_numbered_acl_line(
        self, device: ParsedDevice, number: str, rest: str, text: str, lineno: int
    ) -> None:
        num = int(number)
        kind = "standard" if num <= 99 or 1300 <= num <= 1999 else "extended"
        acl = self._get_or_create_acl(device, number, kind)
        acl.evidence_lines.append(lineno)
        entry = self._parse_acl_entry(rest, lineno, kind, device, full_text=text)
        acl.entries.append(entry)

    def _parse_acl_entry(
        self,
        text: str,
        lineno: int,
        kind: str,
        device: ParsedDevice,
        full_text: str | None = None,
    ) -> ParsedAclEntry:
        display = full_text or text
        tokens = text.split()
        entry = ParsedAclEntry(action="unsupported", text=display, line_number=lineno)
        try:
            i = 0
            if tokens[i].isdigit():  # sequence number
                entry.sequence = int(tokens[i])
                i += 1
            if tokens[i] == "remark":
                entry.action = "remark"
                return entry
            if tokens[i] not in ("permit", "deny"):
                raise ValueError(f"unknown action {tokens[i]!r}")
            entry.action = tokens[i]
            i += 1

            if kind == "standard":
                entry.protocol = "ip"
                entry.src, i = _parse_acl_address(tokens, i)
                entry.dst = AclAddress(kind="any")
                return entry

            proto = tokens[i].lower()
            if proto not in _PROTOCOL_NAMES and not proto.isdigit():
                raise ValueError(f"unknown protocol {proto!r}")
            entry.protocol = proto
            i += 1
            entry.src, i = _parse_acl_address(tokens, i)
            entry.src_port, i = _parse_port_token(tokens, i)
            entry.dst, i = _parse_acl_address(tokens, i)
            entry.dst_port, i = _parse_port_token(tokens, i)
            remaining = [t.lower() for t in tokens[i:]]
            if "established" in remaining:
                entry.established = True
            recognized_trailers = {"established", "log", "log-input"}
            if proto == "icmp":
                recognized_trailers |= _ICMP_TYPE_KEYWORDS
            unknown = [t for t in remaining if t not in recognized_trailers]
            if unknown:
                device.warnings.append(ParseWarning(
                    line=lineno,
                    message=f"ACL entry has unmodeled qualifiers {unknown}: {display}",
                ))
        except (ValueError, IndexError) as exc:
            entry.action = "unsupported"
            device.warnings.append(ParseWarning(
                line=lineno, message=f"Unsupported ACL entry ({exc}): {display}"
            ))
        return entry

    # -- misc ---------------------------------------------------------------------

    @staticmethod
    def _expand_vlan_list(spec: str) -> list[int]:
        ids: list[int] = []
        for part in spec.replace(" ", "").split(","):
            if not part:
                continue
            if "-" in part:
                a, b = part.split("-", 1)
                ids.extend(range(int(a), int(b) + 1))
            else:
                ids.append(int(part))
        return ids

    @staticmethod
    def _pick_management_ip(device: ParsedDevice) -> str | None:
        """Heuristic (labeled as such in the UI): Loopback0, then mgmt, then
        lowest-numbered SVI, then first L3 interface."""
        def first_ip(iface: ParsedInterface) -> str | None:
            for ip in iface.ip_addresses:
                if not ip.secondary:
                    return ip.address
            return None

        by_name = {i.name.lower(): i for i in device.interfaces}
        for candidate in ("loopback0", "mgmt0", "management0"):
            if candidate in by_name and first_ip(by_name[candidate]):
                return first_ip(by_name[candidate])
        def svi_number(iface: ParsedInterface) -> int:
            m = re.match(r"^vlan\s*(\d+)$", iface.name.lower())
            return int(m.group(1)) if m else 10**9

        svis = sorted(
            (i for i in device.interfaces if re.match(r"^vlan\s*\d+$", i.name.lower())
             and i.ip_addresses),
            key=svi_number,
        )
        if svis:
            return first_ip(svis[0])
        for iface in device.interfaces:
            ip = first_ip(iface)
            if ip:
                return ip
        return None


def parse_cisco_config(text: str) -> ParsedDevice:
    return CiscoConfigParser().parse(text)
