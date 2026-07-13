# Windows 11 verification checklist

Everything below was **statically audited or fixed on Linux (2026-07-12)**
but can only be *proven* on Windows. Run top to bottom in PowerShell from the
repo root. Each item gives the exact command and the expected output.

## Already audited (fixed or verified clean on Linux)

| Concern | Result |
| --- | --- |
| Hardcoded `/` paths, `os.path` in backend | clean — pathlib throughout; the only path strings are inside Linux containers |
| `Path.read_text()/write_text()` locale-encoding trap (cp1252) | fixed — every call now passes `encoding="utf-8"` |
| CRLF in uploaded/checked-out configs | safe — all parsing uses `splitlines()` (handles `\r\n`); verified no `split("\n")` anywhere |
| Case-sensitive filename/hostname comparisons | clean — all comparisons `.lower()`ed |
| PowerShell `$args` automatic-variable collision in `up.ps1` | fixed — renamed to `$composeArgs` |
| Line endings on checkout | `.gitattributes` added: `*.cfg`/fixtures forced LF (byte-stable hashes), `*.ps1` CRLF, zips binary |
| docker-compose volume mounts | named volumes only — no host paths, nothing to translate for Docker Desktop |
| Port bindings | `127.0.0.1:8080/8000/9996` — Docker Desktop supports loopback binds; see item 3 |

## To verify on Windows (in order)

**0. Prerequisites** — Docker Desktop running (WSL2 backend), Git, and for
dev-mode items 6–8: Python 3.12+, [uv](https://docs.astral.sh/uv/), Node 20+.

**1. Clean clone (line endings)**
```powershell
git clone <repo> ne-check; cd ne-check
git status
```
Expect: `working tree clean` — no phantom modifications from CRLF conversion.

**2. Full stack build and start**
```powershell
docker compose up --build -d
docker compose ps
```
Expect: three services `Up` (`web`, `api`, `batfish`). First build downloads
images and compiles; allow several minutes.

**3. Loopback binding + health (PowerShell, not curl.exe aliasing)**
```powershell
Invoke-RestMethod http://localhost:8000/api/health | ConvertTo-Json -Depth 3
```
Expect: `status: ok` and, within ~90 s of start, `batfish.available: true`
with `detail: "Batfish reachable at batfish:9996."`. If `available` stays
false, check `docker logs dev-batfish-1`.

**4. UI walkthrough (the scripted demo)**
Open http://localhost:8080 and:
1. Create a workspace.
2. Imports → upload `fixtures\ncm-archives\ncm-archive-baseline.zip` →
   wizard shows **one** proposed snapshot, 5 devices listed → Confirm.
   Expect status `completed`, snapshot shows 5 devices, 100% parsed.
3. Upload `ncm-archive-ambiguous.zip` → wizard flags **“Grouping is
   ambiguous”** with three groups (2024-05-01 / 2024-06-05 / undated).
   Cancel (or confirm — either is fine).
4. Path analysis: `10.10.10.42 → 10.10.20.50` tcp/443 on baseline.
   Expect **Permitted / “Delivered to destination subnet”** and an
   evidence-linked PERMITTED step at `SERVERS-IN`.
5. Import `ncm-archive-changed.zip`, then Compare & root cause →
   **Compute impact**. Expect the engine-computed flow
   `was: Delivered to destination subnet → now: Denied by egress filter`.
6. Snapshot → Findings tab. Expect ≥6 findings including
   `duplicate_ip` (high) and `acl_unused` labeled “not a security finding”;
   click an evidence link and land on highlighted config lines.
7. Device → View configuration. Expect “N secret values redacted” badge;
   “Show secrets” reveals them and flags the view as unredacted.
8. Snapshot → Export report. Expect a standalone HTML report with the
   “Secrets redacted” banner.

**5. Windows-named upload paths**
Upload a config from a path with spaces and mixed case
(e.g. `C:\Temp\My Configs\CORE-RTR-01.CFG` — note the uppercase extension).
Expect: imports normally (extension matching is case-insensitive).

**6. Dev mode — backend on the Windows host**
```powershell
cd apps\api
uv sync --extra batfish
uv run pytest -q
```
Expect: `54 passed`. This exercises UTF-8 file reads, zip handling and
SQLite WAL on NTFS. (Batfish-dependent behavior is not covered by pytest —
it runs degraded by design.)

**7. Dev mode — frontend on the Windows host**
```powershell
cd apps\web
npm install
npm run test; npm run typecheck; npm run build
```
Expect: 11 vitest tests pass; tsc and build clean.

**8. PowerShell scripts**
```powershell
.\scripts\up.ps1 -Detach     # expect "Stack started. Open http://localhost:8080"
.\scripts\test.ps1           # expect "All checks passed."
.\scripts\dev.ps1            # expect backend :8000 + Vite :5173; Ctrl+C stops both
.\scripts\e2e.ps1            # expect Playwright smoke test passing
```

**9. Data persistence across restarts**
```powershell
docker compose down; docker compose up -d
```
Expect: workspaces/snapshots still present (named volume `ne_data`
survives `down`; only `docker compose down -v` destroys it).

## Known Windows-only unknowns (not fixable from Linux)

* Docker Desktop file-sharing/WSL2 performance for the first `--build`.
* Corporate TLS-inspection proxies on the Windows host: if `docker build`
  fails on pip/npm TLS errors, drop the proxy's CA as
  `apps\api\build-cas\proxy-ca.crt` and `apps\web\build-cas\proxy-ca.crt`
  (see Dockerfile comments) and rebuild.
* Windows Defender/SmartScreen prompts for the PowerShell scripts
  (`Unblock-File .\scripts\*.ps1` if downloaded as a zip).
