# Importing configuration backups

## What you can upload

* A single Cisco configuration file: `.cfg`, `.txt`, `.conf`, `.config`.
* A **zip archive** containing many configs — including archives exported
  from SolarWinds NCM ("Config Archive" folder trees or flat exports).

No connection to SolarWinds or to any device is needed: export/copy the
files anywhere NCM already stores them and upload the result.

One upload creates **one snapshot** — a picture of the network at a point in
time. Import your Monday archive and your Friday archive as two snapshots to
compare them.

## How NCM archives are interpreted

The importer recognizes the common NCM layouts:

```
Archive/
  CORE-RTR-01/CORE-RTR-01-Running-2024-05-01_020000.cfg
  CORE-RTR-01/CORE-RTR-01-Startup-2024-05-01_020000.cfg
  ...
```

or flat exports like `CORE-SW-01_Running_2024-05-01_120000.cfg`.

Rules applied (each decision is written to the import log):

1. **Device identity** comes from the `hostname` line inside the config. The
   filename/folder is only a fallback and a cross-check; a mismatch produces
   a warning, never a silent rename.
2. **Running beats startup.** If both exist for a device, the running config
   is used and the startup copy is logged as skipped.
3. **Newest wins.** Multiple timestamped copies of the same device+type: the
   latest filename timestamp is used (zip file dates as fallback).
4. **Non-configs are skipped** (readme files, CSV reports, etc.) and logged.
5. The snapshot's *effective time* defaults to the newest config timestamp
   found; you can override it at upload time.

## Reading the results

* **Completeness** (per device and per snapshot) is the share of significant
  configuration lines the parser understood. Lines it could not model are
  listed as parser warnings with line numbers — they are excluded from
  structured answers rather than guessed at.
* **Parse status** `partial` means less than half the config was understood —
  treat structured answers for that device with care and check the raw
  config (always available, unmodified, in the config viewer).
* **Warnings** never block an import; **errors** (per file) mean that file
  contributed no device.

## Limits

* Upload ≤ 200 MiB (configurable), ≤ 5 000 files per archive, ≤ 20 MiB per
  config file.
* Cisco IOS / IOS-XE are fully supported; NX-OS basics. Other vendors are
  not yet parsed (they will appear as failed files in the log).
* Archives are read in memory and never extracted to disk.
