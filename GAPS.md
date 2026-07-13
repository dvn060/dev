# Gap audit — specification vs. verified reality

Audited 2026-07-12 against the original product specification. **Status
reflects only what was verified in this session** (live Docker stack, live
Batfish, test runs). "Working" claims below each cite how they were
verified; anything not re-verified is marked accordingly.

Statuses: **working** (verified this session) · **partial** (exists, with
named limitations) · **absent** (no implementation).

## Core requirements

| Requirement | Status | Location | Effort to close |
| --- | --- | --- | --- |
| Docker Compose stack, three services, loopback-only | **working** — `docker compose up` run this session; all 3 containers up; web answers 200 | `docker-compose.yml`, `apps/*/Dockerfile` | — |
| Backend ↔ Batfish connectivity | **working** — `/api/health` reports `available: true` from inside the api container | `app/services/batfish_client.py` | — |
| Import single configs + NCM zip archives, audit log | **working** — both fixture archives imported through the containerized API this session; pytest covers selection rules | `app/services/{importer,ncm}.py` | — |
| Cisco parse → inventory with line-level evidence | **working** — 5 devices, 100% completeness, evidence lines asserted by pytest (run this session, 30 passed) | `app/services/cisco_parser.py` | — |
| Path analysis with Batfish verdicts + evidence mapping | **working** — 7 flows returned real dispositions (DELIVERED_TO_SUBNET, DENIED_IN, DENIED_OUT, EXITS_NETWORK) with ACL evidence attached; see fixtures/README.md | `app/services/{pathfinder,batfish_client}.py` | — |
| Degraded mode: verdict `unknown`, never guessed | **working** — pytest asserts it; degraded flows also exercised live before Batfish came up | `app/services/pathfinder.py` | — |
| Snapshot diff (raw + semantic) & suspect ranking | **working** — pytest run this session; ranking is a heuristic (see below) | `app/services/diff.py` | — |
| Topology with confirmed/inferred/possible tiers | **working** — pytest this session; UI rendering verified last session (screenshots) and unchanged since | `app/services/topology.py` | — |
| Frontend build/tests/e2e | **working** — vitest (11), tsc, eslint, build, degraded smoke e2e and live-stack e2e all passed this session | `apps/web` | — |
| Tauri packaging | **absent** (explicitly deferred by spec: "not a dependency for the MVP") | — | M3, ~1–2 weeks |

## Items called out for this audit

| Requirement | Status | Location | Effort to close |
| --- | --- | --- | --- |
| Findings engine | **working** — 10 deterministic rules (duplicate IP, overlapping prefixes, unused/undefined ACLs, open trunks, duplicate configs, hostname mismatch, stale age, unsupported syntax) + live Batfish parse/init issues; severity/category/confidence/evidence; 7 kinds fire on the lab and are asserted in the UI with evidence click-through (live e2e this session) | `app/services/findings.py`, `FindingsView.tsx`, `tests/test_findings.py` | — |
| HTML report export | **working** — GET /snapshots/{id}/report, standalone HTML, redacted by default; covered by tests run this session | `app/services/report.py` | — |
| Secret detection (enable secrets, SNMP communities, TACACS/RADIUS keys…) | **working** — detector + per-line redaction data stored at import; leak-hunt test greps every API surface for planted fake secrets (run this session) | `app/services/secrets.py`, `tests/test_secrets.py` | — |
| Redacted viewing mode (default-safe display; explicit unredacted viewer) | **working** — config viewer, search, diffs and reports serve redacted content by default; `?redacted=false` / the "Show secrets" toggle is the explicit escape hatch; verified by pytest leak-hunt + live e2e this session | `app/routers/devices.py`, `ConfigViewerPage.tsx` | — |
| Dashboard page (per-workspace overview: snapshots, devices, warnings, recent changes at a glance) | **absent** — landing page is a workspace card list; workspace home redirects to the snapshot table | `apps/web/src/pages/` | ~1–2 days |
| Import wizard: user correction of snapshot grouping | **working** — two-phase import (preview → correct → confirm): proposed grouping clusters by filename date (version-history subsets merged; zip mtimes never trusted for grouping); user can rename snapshots, move files between them, and exclude files; verified by pytest (4 tests) and a live e2e exercising rename+move+exclude against the ambiguous fixture this session | `app/services/staging.py`, `routers/imports.py`, `ImportWizard.tsx`, `e2e/import-wizard.spec.ts` | — |
| Batfish **differential reachability** | **working** — /diff/reachability runs the engine's differentialReachability; verified live (found the broken flow, the fix, and zero diff for baseline→restored); heuristic ranker demoted to a labeled "temporal correlation only" fallback | `app/services/batfish_client.py`, `ComparePage.tsx` | — |
| Restored third snapshot (break → fix arc) | **working** — `restored` fixture verified live: DENIED_OUT → DELIVERED_TO_SUBNET | `fixtures/cisco/restored/` | — |
| No-route flow fixture | **working** — LAB-RTR-01 (no default route) returns `NO_ROUTE` live; CORE Null0 blackhole returns `NULL_ROUTED` live | `fixtures/cisco/baseline/LAB-RTR-01.cfg` | — |
| Denied-ingress vs denied-egress distinguished end-to-end | **working** — API returns first-class `dispositions`; UI shows distinct labels ("Denied by ingress filter" vs "Denied by egress filter" vs "No route" vs "Null routed"); asserted by the live e2e this session | `lib/confidence.ts` DISPOSITION_META, `e2e/live-batfish.spec.ts` | — |
| ECMP fixture | **working** — dual CORE↔DIST links + dual defaults produce 2 traces per crossing flow (observed live); divergent-policy ECMP (a real `mixed` verdict) still untested | `fixtures/cisco/baseline/` | divergent-policy variant: ~½ day |
| NX-OS parse coverage | **working (basics)** — NXOS-CORE-01 fixture: VLANs/SVIs/port-channels/mgmt0-VRF/prefix ACLs/`vrf context` routes parse (91% completeness, zero unparsed lines); HSRP surfaces as warnings, never silently dropped; verified live: Batfish PASSED/CISCO_NX, permitted+denied NX-OS path results with evidence. show-run-all advisory in import log + docs. Not modeled in inventory: HSRP, NX-OS object-groups | `app/services/cisco_parser.py`, `tests/test_nxos.py`, `fixtures/cisco/nxos/` | HSRP inventory: ~1 day |

## Also noted while auditing (not in the checklist)

| Item | Status | Note |
| --- | --- | --- |
| Batfish auto-run after import | absent | analysis engine is invoked lazily on first path query; snapshot `analysis_status` never reaches `batfish_ready` |
| Bidirectional / return-path analysis | absent | forward traceroute only; return traffic (and `established` semantics) not analyzed |
| Route-step evidence mapping | partial | filter steps carry config-line evidence; routing steps show the route text from Batfish but do not link to `ip route` lines |
| VRF-aware endpoint location | absent | `_locate_endpoint` ignores VRFs |
| Proposed-change impact ("what would be affected") | absent | spec question 7; roadmap M2 |
| Object-groups / time-ranges in ACLs | absent by design | flagged `unsupported`, never guessed — verified by pytest |
