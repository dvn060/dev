#!/usr/bin/env python3
"""Build SolarWinds-NCM-style zip archives from the plain fixture configs.

Produces, under fixtures/ncm-archives/:
  ncm-archive-baseline.zip  — per-device folders, timestamped Running configs,
                              plus an older Running copy, a Startup copy and a
                              readme to exercise the importer's selection and
                              skip logic.
  ncm-archive-changed.zip   — the broken state (ACL permit removed).
  ncm-archive-restored.zip  — the fix applied on top of the changed state.

Run: python scripts/build_fixture_archives.py
"""

import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CISCO = ROOT / "fixtures" / "cisco"
OUT = ROOT / "fixtures" / "ncm-archives"

SNAPSHOTS = {
    "baseline": "2024-05-01_020000",
    "changed": "2024-06-05_020000",
    "restored": "2024-07-02_020000",
}


def build(snapshot: str, stamp: str) -> Path:
    src = CISCO / snapshot
    out_path = OUT / f"ncm-archive-{snapshot}.zip"
    OUT.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for cfg in sorted(src.glob("*.cfg")):
            device = cfg.stem
            content = cfg.read_text()
            zf.writestr(f"{device}/{device}-Running-{stamp}.cfg", content)
            if snapshot == "baseline" and device == "CORE-RTR-01":
                # Older running copy: importer must pick the newest one.
                old = content.replace("ntp server 10.10.20.123", "ntp server 10.10.20.99")
                zf.writestr(f"{device}/{device}-Running-2024-04-01_020000.cfg", old)
                # Startup copy: importer must prefer Running.
                zf.writestr(f"{device}/{device}-Startup-{stamp}.cfg", content)
        if snapshot == "baseline":
            zf.writestr("readme.txt", "Exported from SolarWinds NCM (fixture). Not a config.\n")
    return out_path


def main() -> None:
    for snapshot, stamp in SNAPSHOTS.items():
        path = build(snapshot, stamp)
        print(f"wrote {path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
