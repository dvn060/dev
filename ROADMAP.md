# Roadmap

## M0 — Evidence MVP ✅ (current)

* Monorepo, Docker Compose stack (web / api / batfish), loopback-only.
* Cisco IOS/IOS-XE (+ basic NX-OS) parsing with line-level evidence,
  completeness scoring, honest unsupported-syntax handling.
* SolarWinds NCM archive import (folders, timestamps, running vs startup)
  with a full audit log per import.
* Inventory, topology (confirmed/inferred/possible tiers), config search.
* Path analysis via Batfish with degraded "unknown + candidate evidence"
  mode when the engine is absent.
* Snapshot compare: raw diffs, semantic changes, deterministic suspect
  ranking for broken flows.
* Test suite: pytest (24), Vitest (11), Playwright e2e, ruff/mypy/eslint/tsc.

## M1 — Batfish depth & trust

* Run Batfish automatically after import; surface its parse coverage per
  device next to our own completeness score.
* Bidirectional traceroute (return-path verdicts), ECMP presentation.
* ACL reachability questions ("what can reach this server?") via
  `searchFilters`.
* Map Batfish route/next-hop decisions to `ip route`/routing-protocol lines
  (today only filter steps carry evidence links).
* Object groups, port-groups, VRF-aware endpoint location; IPv6 static
  routes.
* Windows install polish: one-command bootstrap script, health diagnostics
  page.

## M2 — Investigation workflows

* Proposed-change impact preview: paste a candidate config change, diff it
  against the snapshot and re-run affected path analyses (still read-only).
* Saved investigations: pin a flow, auto-re-evaluate it on every new import,
  alert on verdict change.
* Exportable evidence reports (HTML/PDF) with embedded config excerpts.
* Secret redaction on ingest (hashes, SNMP strings) as an import option.
* Optional AI assist (explicitly opt-in, needs an API key): natural-language
  querying and narrative summaries — always quoting, never overriding,
  deterministic results (architecture rule 6).

## M3 — Desktop packaging & scale

* Tauri wrapper for a signed Windows desktop app (bundled services,
  first-run experience); the web app remains the canonical product.
* Multi-vendor parsing (Arista EOS, Juniper via Batfish's support).
* Larger-estate performance: incremental import, indexed search, snapshot
  retention policies.
* Multi-user/team option (auth, Postgres) for MSP deployments.

## Explicit non-goals

Live device access, configuration deployment, monitoring/alerting on live
state, SolarWinds feature parity, packet capture. See "PRODUCT POSITIONING"
in [CLAUDE.md](CLAUDE.md).
