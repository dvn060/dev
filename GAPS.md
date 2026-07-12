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
| Cisco parse → inventory with line-level evidence | **working** — 4 devices, 100% completeness, evidence lines asserted by pytest (run this session, 24 passed) | `app/services/cisco_parser.py` | — |
| Path analysis with Batfish verdicts + evidence mapping | **working** — 7 flows returned real dispositions (DELIVERED_TO_SUBNET, DENIED_IN, DENIED_OUT, EXITS_NETWORK) with ACL evidence attached; see fixtures/README.md | `app/services/{pathfinder,batfish_client}.py` | — |
| Degraded mode: verdict `unknown`, never guessed | **working** — pytest asserts it; degraded flows also exercised live before Batfish came up | `app/services/pathfinder.py` | — |
| Snapshot diff (raw + semantic) & suspect ranking | **working** — pytest run this session; ranking is a heuristic (see below) | `app/services/diff.py` | — |
| Topology with confirmed/inferred/possible tiers | **working** — pytest run this session; rendered UI verified last session only | `app/services/topology.py`, `apps/web/.../TopologyView.tsx` | re-verify UI in e2e (Step 4) |
| Frontend build/tests/e2e | **partial** — vitest+tsc+eslint+build+Playwright passed **last** session; not yet re-run this session | `apps/web` | re-run in Step 4 |
| Tauri packaging | **absent** (explicitly deferred by spec: "not a dependency for the MVP") | — | M3, ~1–2 weeks |

## Items called out for this audit

| Requirement | Status | Location | Effort to close |
| --- | --- | --- | --- |
| Findings engine (proactive analysis findings — e.g. shutdown-but-described ports, ACLs referenced but undefined, duplicate subnets — as a first-class reviewed list) | **absent** — parser warnings and completeness exist, but there is no findings model, no rules engine, no UI | nearest neighbors: `Device.parse_warnings`, import log | ~3–5 days: `findings.py` rule registry + table + API + UI page |
| HTML report export | **absent** | — | ~2–3 days basic (snapshot summary, path result, diff → standalone HTML). **In scope Step 4.** |
| Secret detection (enable secrets, SNMP communities, TACACS/RADIUS keys…) | **absent** — configs are stored and displayed verbatim; SECURITY.md documents the lack | — | ~2 days detector + storage of secret line spans. **In scope Step 4.** |
| Redacted viewing mode (default-safe display; explicit unredacted viewer) | **absent** | — | ~2 days across config viewer, search, diff, evidence links, logs, exports. **In scope Step 4.** |
| Dashboard page (per-workspace overview: snapshots, devices, warnings, recent changes at a glance) | **absent** — landing page is a workspace card list; workspace home redirects to the snapshot table | `apps/web/src/pages/` | ~1–2 days |
| Import wizard: user correction of snapshot grouping (review which files → which device/snapshot before commit) | **absent** — grouping is automatic; decisions are visible in the log only after the fact, and cannot be corrected | `app/services/ncm.select_candidates` | ~3–4 days: two-phase import (propose → confirm) + UI step |
| Batfish **differential reachability** (engine-computed "what became blocked/allowed between snapshots", distinct from the heuristic ranker) | **absent** — the suspect ranker is a config-diff heuristic, not a Batfish differential analysis | `app/services/diff.rank_suspects` | ~2–3 days: `differentialReachability` in batfish_client + endpoint + UI. **In scope Step 4.** |
| Restored third snapshot (break → fix arc in fixtures) | **absent** — only `baseline` and `changed` exist | `fixtures/cisco/` | hours. **In scope Step 4.** |
| No-route flow fixture (verdict from routing, not filtering) | **absent** — every current fixture flow is decided by an ACL or delivered | `fixtures/` | hours. **In scope Step 4.** |
| Denied-ingress vs denied-egress distinguished end-to-end | **partial** — Batfish returns DENIED_IN and DENIED_OUT (both observed live this session) and the API preserves them, but the UI verdict banner collapses both to "Denied"; the raw disposition is visible only in the trace detail | `apps/web/src/lib/confidence.ts` (`VERDICT_META`) | ~½ day: surface disposition-level labels + e2e assertions. **In scope Step 4.** |
| ECMP fixture (multiple equal-cost paths, potentially divergent policy) | **absent** — no fixture produces multiple traces; the `mixed` verdict path in `pathfinder.py` has never executed against real data | `fixtures/`, `app/services/pathfinder.py` | hours–1 day. **In scope Step 4.** |
| NX-OS parse coverage | **partial** — detection heuristics (`feature`, `boot nxos`, `A.B.C.D/len` addresses, `vrf member`) exist but there is **no NX-OS fixture and no test exercising them**; real NX-OS configs (`interface Ethernet1/1`, `ip access-list` without standard/extended keyword, port-channels, mgmt0 VRF) would parse only partially and the completeness score would show it | `app/services/cisco_parser.py` | ~2–4 days for honest basics + fixture + tests |

## Also noted while auditing (not in the checklist)

| Item | Status | Note |
| --- | --- | --- |
| Batfish auto-run after import | absent | analysis engine is invoked lazily on first path query; snapshot `analysis_status` never reaches `batfish_ready` |
| Bidirectional / return-path analysis | absent | forward traceroute only; return traffic (and `established` semantics) not analyzed |
| Route-step evidence mapping | partial | filter steps carry config-line evidence; routing steps show the route text from Batfish but do not link to `ip route` lines |
| VRF-aware endpoint location | absent | `_locate_endpoint` ignores VRFs |
| Proposed-change impact ("what would be affected") | absent | spec question 7; roadmap M2 |
| Object-groups / time-ranges in ACLs | absent by design | flagged `unsupported`, never guessed — verified by pytest |
