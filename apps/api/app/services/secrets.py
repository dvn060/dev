"""Secret detection and redaction for Cisco configurations.

Configuration backups carry credential material: password/secret hashes,
SNMP community strings, AAA server keys, routing-protocol authentication
keys, IPsec pre-shared keys. This module finds them at import time and the
API serves *redacted* content by default everywhere configuration text is
exposed (config viewer, search, diffs, report export). The only way to see
a secret is the explicit unredacted viewer (`?redacted=false`).

Detection is line-based and pattern-driven. It is deliberately biased toward
over-matching (redacting a non-secret is annoying; leaking a secret is a
breach). The replacement token is fixed-width so nothing about the secret —
including its length — survives redaction.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

REDACTION_TOKEN = "<REDACTED>"

# Each pattern must contain a named group `secret` (the value to mask).
# Order matters only for the `kind` reported on first match.
_PATTERNS: list[tuple[str, re.Pattern]] = [
    ("enable_secret", re.compile(
        r"^\s*enable\s+(?:secret|password)(?:\s+level\s+\d+)?(?:\s+[0-9])?\s+(?P<secret>\S+.*)$")),
    ("username_secret", re.compile(
        r"^\s*username\s+\S+.*?\b(?:secret|password)(?:\s+[0-9])?\s+(?P<secret>\S+.*)$")),
    ("snmp_community", re.compile(
        r"^\s*snmp-server\s+community\s+(?P<secret>\S+)")),
    ("tacacs_key", re.compile(
        r"^\s*tacacs(?:-server)?\s+(?:host\s+\S+\s+)?key(?:\s+[0-9])?\s+(?P<secret>\S+.*)$")),
    ("server_key", re.compile(r"^\s*key(?:\s+[0-9])?\s+(?P<secret>\S+.*)$")),  # aaa server block
    ("radius_key", re.compile(
        r"^\s*radius(?:-server)?\s+(?:host\s+\S+\s+)?key(?:\s+[0-9])?\s+(?P<secret>\S+.*)$")),
    ("ipsec_psk", re.compile(
        r"^\s*crypto\s+isakmp\s+key(?:\s+[0-9])?\s+(?P<secret>\S+)")),
    ("bgp_password", re.compile(
        r"^\s*neighbor\s+\S+\s+password(?:\s+[0-9])?\s+(?P<secret>\S+.*)$")),
    ("hsrp_auth", re.compile(
        r"^\s*standby\s+\d+\s+authentication(?:\s+(?:md5\s+)?key-string(?:\s+[0-9])?)?\s+(?P<secret>\S+.*)$")),
    ("key_chain_key", re.compile(r"^\s*key-string(?:\s+[0-9])?\s+(?P<secret>\S+.*)$")),
    ("ospf_md5", re.compile(
        r"^\s*ip\s+ospf\s+message-digest-key\s+\d+\s+md5(?:\s+[0-9])?\s+(?P<secret>\S+.*)$")),
    ("ntp_auth_key", re.compile(
        r"^\s*ntp\s+authentication-key\s+\d+\s+md5\s+(?P<secret>\S+.*)$")),
    ("ppp_password", re.compile(
        r"^\s*ppp\s+(?:chap|pap)\s+(?:sent-username\s+\S+\s+)?password(?:\s+[0-9])?\s+(?P<secret>\S+.*)$")),
    ("wireless_psk", re.compile(
        r"^\s*(?:wpa-psk|psk)\s+(?:ascii|hex)?(?:\s+[0-9])?\s*(?P<secret>\S+.*)$")),
]

# `key ...` lines are only secrets inside AAA server-group blocks; restrict
# the bare-key pattern to indented lines to avoid mangling `key chain` etc.
_BARE_KEY = re.compile(r"^\s+key(?:\s+[0-9])?\s+(?P<secret>\S+.*)$")
_KEY_CHAIN_HEADER = re.compile(r"^\s*key\s+\d+\s*$")


@dataclass
class SecretMatch:
    line: int  # 1-based
    kind: str
    redacted_line: str

    def as_dict(self) -> dict:
        return {"line": self.line, "kind": self.kind, "redacted_line": self.redacted_line}


def _redact(text: str, match: re.Match) -> str:
    start, end = match.span("secret")
    return text[:start] + REDACTION_TOKEN + text[end:]


def detect_secrets(text: str) -> list[SecretMatch]:
    matches: list[SecretMatch] = []
    for lineno, line in enumerate(text.splitlines(), start=1):
        if not line.strip() or line.strip().startswith("!"):
            continue
        if _KEY_CHAIN_HEADER.match(line):  # "key 1" inside a key chain: not a value
            continue
        for kind, pattern in _PATTERNS:
            m = pattern.match(line)
            if m and m.group("secret"):
                # Skip the block-scoped bare "key" pattern at top level.
                if kind == "server_key" and not _BARE_KEY.match(line):
                    continue
                matches.append(SecretMatch(
                    line=lineno, kind=kind, redacted_line=_redact(line, m)
                ))
                break
    return matches


def redact_config_lines(lines: list[str], secret_lines: list[dict]) -> list[str]:
    """Return a copy of `lines` with detected secret lines replaced by their
    redacted form. `secret_lines` is the persisted detect_secrets() output."""
    out = list(lines)
    for entry in secret_lines:
        idx = entry["line"] - 1
        if 0 <= idx < len(out):
            out[idx] = entry["redacted_line"]
    return out


def redact_config_text(text: str, secret_lines: list[dict]) -> str:
    return "\n".join(redact_config_lines(text.splitlines(), secret_lines))
