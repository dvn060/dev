"""Import wizard: preview an upload's proposed snapshot grouping and let the
user correct it (move files between snapshots, exclude files, rename
snapshots) before anything is committed.

Grouping heuristic: candidates cluster by the calendar date of their
timestamp. One dated cluster → one proposed snapshot; several → several
(an archive spanning multiple export runs). Undated files join the only
cluster when there is exactly one, otherwise they form their own "Undated"
group for the user to place. The proposal is exactly that — a proposal; the
confirm step applies the user's corrections verbatim.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime
from typing import Any

from . import ncm

UNDATED = "undated"


def build_proposal(candidates: list[ncm.ConfigFileCandidate],
                   requested_name: str | None,
                   default_name: str) -> dict[str, Any]:
    clusters: dict[str, list[ncm.ConfigFileCandidate]] = defaultdict(list)
    for c in candidates:
        # Only filename-derived timestamps are trustworthy for grouping;
        # zip modification times reflect when the archive was built.
        if c.timestamp is not None and c.timestamp_source == "filename":
            key = c.timestamp.date().isoformat()
        else:
            key = UNDATED
        clusters[key].append(c)

    dated_keys = sorted(k for k in clusters if k != UNDATED)
    undated = clusters.get(UNDATED, [])

    # Version history vs. distinct export runs: an older cluster whose devices
    # are all present in a newer cluster is almost certainly older *copies*
    # (NCM keeps version history), not a separate network state. Merge it into
    # that newer cluster — duplicate resolution picks the newest per device at
    # import time, and the user can still split manually in the wizard.
    def devices_of(members: list[ncm.ConfigFileCandidate]) -> set[str]:
        return {(ncm.extract_hostname(c.content) or c.device_name_hint
                 or c.relative_path).lower() for c in members}

    merged = True
    while merged and len(dated_keys) > 1:
        merged = False
        for old_key in list(dated_keys[:-1]):
            old_devices = devices_of(clusters[old_key])
            for new_key in [k for k in dated_keys if k > old_key]:
                if old_devices <= devices_of(clusters[new_key]):
                    clusters[new_key].extend(clusters.pop(old_key))
                    dated_keys.remove(old_key)
                    merged = True
                    break
            if merged:
                break

    groups: list[dict] = []
    if len(dated_keys) == 1 and undated:
        clusters[dated_keys[0]].extend(undated)
        undated = []

    base_name = requested_name or default_name
    for key in dated_keys:
        members = clusters[key]
        name = base_name if len(dated_keys) == 1 else f"{base_name} ({key})"
        groups.append(_group(name, key, members))
    if undated:
        groups.append(_group(f"{base_name} (undated)", None, undated))
    if not groups:  # only undated files existed
        groups = [_group(base_name, None, candidates)]
    # De-duplicate group names defensively
    seen: set[str] = set()
    for g in groups:
        while g["name"] in seen:
            g["name"] += " (2)"
        seen.add(g["name"])

    return {
        "ambiguous": len(groups) > 1,
        "groups": groups,
        "file_count": len(candidates),
    }


def _group(name: str, date_key: str | None,
           members: list[ncm.ConfigFileCandidate]) -> dict:
    newest = max((c.timestamp for c in members
                  if c.timestamp and c.timestamp_source == "filename"), default=None)
    return {
        "name": name,
        "date": date_key,
        "effective_at": newest.isoformat() if newest else None,
        "files": [{
            "path": c.relative_path,
            "device": ncm.extract_hostname(c.content) or c.device_name_hint or c.relative_path,
            "config_type": c.config_type,
            "timestamp": c.timestamp.isoformat()
            if c.timestamp and c.timestamp_source == "filename" else None,
        } for c in sorted(members, key=lambda c: c.relative_path)],
    }


def parse_effective_at(value: str | None) -> datetime | None:
    if not value:
        return None
    dt = datetime.fromisoformat(value)
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)
