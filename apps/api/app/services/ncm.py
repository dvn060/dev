"""SolarWinds NCM configuration-archive interpretation.

NCM exports come in a handful of shapes seen in the field. This module
normalizes them into a list of `ConfigFileCandidate` objects with the best
available metadata, without requiring any SolarWinds access:

1. Zip archives / folder trees produced by NCM's "Config Archive" feature:
       <ArchiveRoot>/<DeviceName>/<DeviceName>-Running-<timestamp>.cfg
       <ArchiveRoot>/<DeviceName>/<DeviceName>.Startup.cfg
2. Flat exports:
       CORE-SW-01_Running_2024-05-01_120000.cfg
       edge-rtr-1.startup.txt
3. Plain single-device backups: any *.cfg / *.txt / *.conf / *.config file.

Rules (documented for users in docs/importing.md):
* Config type is inferred from filename tokens ("running", "startup"). When a
  device has both, running-config wins and a log entry records the choice.
* When multiple timestamped copies of the same device+type exist in one
  archive, the newest (by parsed filename timestamp, falling back to zip
  mtime) is used and the others are logged as skipped.
* The authoritative device identity is the `hostname` line inside the config;
  the filename is only a fallback and a cross-check. A mismatch produces a
  warning, never a silent rename.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import UTC, datetime

CONFIG_EXTENSIONS = {".cfg", ".txt", ".conf", ".config", ".confg"}

_TYPE_TOKENS = {
    "running": "running",
    "run": "running",
    "startup": "startup",
    "start": "startup",
    "baseline": "baseline",
}

# Timestamp shapes seen in NCM filenames, most specific first.
_TS_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"(\d{4})-(\d{2})-(\d{2})[_\-T](\d{2})[.\-_:]?(\d{2})[.\-_:]?(\d{2})"), "ymdhms"),
    (re.compile(r"(\d{4})(\d{2})(\d{2})[_\-]?(\d{2})(\d{2})(\d{2})"), "ymdhms"),
    (re.compile(r"(\d{4})-(\d{2})-(\d{2})"), "ymd"),
]


@dataclass
class ConfigFileCandidate:
    relative_path: str
    content: str
    device_name_hint: str | None = None
    config_type: str = "unknown"  # running | startup | baseline | unknown
    timestamp: datetime | None = None
    notes: list[str] = field(default_factory=list)


def _strip_ext(name: str) -> str:
    for ext in CONFIG_EXTENSIONS:
        if name.lower().endswith(ext):
            return name[: -len(ext)]
    return name


def parse_filename_metadata(relative_path: str) -> tuple[str | None, str, datetime | None]:
    """Extract (device hint, config type, timestamp) from an NCM-style path."""
    parts = relative_path.replace("\\", "/").split("/")
    filename = parts[-1]
    stem = _strip_ext(filename)

    timestamp: datetime | None = None
    ts_span: tuple[int, int] | None = None
    for pattern, shape in _TS_PATTERNS:
        m = pattern.search(stem)
        if m:
            g = [int(x) for x in m.groups()]
            try:
                if shape == "ymdhms":
                    timestamp = datetime(g[0], g[1], g[2], g[3], g[4], g[5], tzinfo=UTC)
                else:
                    timestamp = datetime(g[0], g[1], g[2], tzinfo=UTC)
                ts_span = m.span()
            except ValueError:
                timestamp = None
            break

    stem_wo_ts = (stem[: ts_span[0]] + stem[ts_span[1]:]) if ts_span else stem

    config_type = "unknown"
    device_tokens: list[str] = []
    for token in re.split(r"[._\-]+", stem_wo_ts):
        if not token:
            continue
        low = token.lower()
        if low in _TYPE_TOKENS:
            config_type = _TYPE_TOKENS[low]
        elif low in ("config", "configs", "confg"):
            continue
        else:
            device_tokens.append(token)

    device_hint = "-".join(device_tokens) if device_tokens else None
    # An enclosing per-device folder is the strongest name hint in NCM trees.
    if len(parts) >= 2 and parts[-2] and parts[-2] not in (".", ".."):
        folder = parts[-2]
        if not re.fullmatch(r"(configs?|archive|backups?|ncm|export|\d{4}-\d{2}-\d{2})",
                            folder, re.IGNORECASE):
            device_hint = folder

    return device_hint, config_type, timestamp


def extract_hostname(content: str) -> str | None:
    for line in content.splitlines():
        m = re.match(r"^\s*hostname\s+(\S+)", line)
        if m:
            return m.group(1).strip('"')
    return None


def looks_like_cisco_config(content: str) -> bool:
    """Cheap sniff to reject README files, CSVs and other non-config content."""
    markers = ("hostname ", "interface ", "ip address", "version ", "line vty", "boot ")
    sample = content[:20000]
    hits = sum(1 for m in markers if m in sample)
    return hits >= 2


def select_candidates(
    files: list[ConfigFileCandidate],
) -> tuple[list[ConfigFileCandidate], list[dict]]:
    """Pick one config per device: running preferred, newest timestamp wins.

    Returns (selected, log_entries).
    """
    log: list[dict] = []
    by_device: dict[str, list[ConfigFileCandidate]] = {}
    for f in files:
        hostname = extract_hostname(f.content)
        if hostname and f.device_name_hint and hostname.lower() != f.device_name_hint.lower():
            f.notes.append(
                f"Filename suggests device '{f.device_name_hint}' but configuration "
                f"hostname is '{hostname}'. Using the hostname."
            )
        key = (hostname or f.device_name_hint or f.relative_path).lower()
        by_device.setdefault(key, []).append(f)

    type_rank = {"running": 0, "unknown": 1, "baseline": 2, "startup": 3}
    selected: list[ConfigFileCandidate] = []
    for key, group in sorted(by_device.items()):
        group.sort(key=lambda f: (
            type_rank.get(f.config_type, 9),
            -(f.timestamp.timestamp() if f.timestamp else 0),
        ))
        chosen = group[0]
        selected.append(chosen)
        for skipped in group[1:]:
            log.append({
                "level": "info",
                "message": (
                    f"Skipped '{skipped.relative_path}' for device '{key}': "
                    f"using '{chosen.relative_path}' "
                    f"({chosen.config_type} config"
                    + (f", {chosen.timestamp:%Y-%m-%d %H:%M:%S} UTC" if chosen.timestamp else "")
                    + ")."
                ),
            })
    return selected, log
