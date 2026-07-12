# Architecture

## System overview

```
┌────────────────────────── user's machine (127.0.0.1 only) ─────────────────────────┐
│                                                                                     │
│  Browser ──► web (nginx / Vite)  ──/api──►  api (FastAPI)  ──pybatfish──► batfish   │
│              React + React Flow             │        │                  (container) │
│                                             │        └── SQLite (ne_data volume)    │
│                                             └── background job runner               │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

Three services via Docker Compose: `web`, `api`, `batfish`. No service has
any off-machine dependency.

## Division of responsibility

**Batfish is the behavioral analysis engine.** Routing, ACL evaluation and
forwarding verdicts come from it; we deliberately do not reimplement a
forwarding engine (`app/services/batfish_client.py` is the only integration
point).

**This application owns everything else:** import workflows, snapshot
organization, SolarWinds NCM archive interpretation, metadata normalization,
evidence mapping, configuration-line references, topology presentation, user
workflows, historical comparison, suspect ranking, confidence/completeness
indicators, and packaging.

## The evidence pipeline (the core idea)

Every answer must be traceable to configuration text:

1. **Parse with provenance** — `cisco_parser.py` extracts objects
   (interfaces, VLANs, routes, ACL entries…) and stamps each with the exact
   1-based line numbers it came from (`evidence_lines`). Raw configs are
   stored verbatim.
2. **Analyze** — topology derivation, diffing, flow matching and Batfish
   traces all operate on those objects and *propagate* the line references.
3. **Present** — the frontend renders every conclusion with an
   `EvidenceLink` that opens the device's configuration scrolled to and
   highlighting the supporting lines (`/devices/:id/config?lines=…`).

### Honesty rules (non-negotiable)

* **Never report certainty absent evidence.** Without Batfish, path analysis
  returns verdict `unknown` plus clearly-labeled *candidate evidence*; it
  never simulates a verdict. Endpoints that can't be located on imported
  devices are reported under `missing_evidence`.
* **Confidence tiers everywhere.** `confirmed` (stated by config lines),
  `inferred` (sound deduction, e.g. two devices on one /30), `possible`
  (hints, e.g. interface descriptions). One source of truth per side:
  `topology.py` / `confidence.ts`.
* **Unsupported syntax is flagged, not guessed.** Unknown lines lower the
  snapshot's completeness score and appear as parser warnings; an ACL entry
  the parser can't model becomes `action: unsupported`, never a guess.
* **No LLM may override deterministic results.** There is currently no LLM
  integration at all; if added, it will be presentation-side only.

## Backend (apps/api)

* **FastAPI + Pydantic v2** — schemas in `app/schemas.py` are the API
  contract, mirrored by zod schemas in the frontend.
* **SQLAlchemy 2 + SQLite + Alembic** — models in `app/models.py`:
  `Workspace → Import → Snapshot → Device → {Interface, Vlan, StaticRoute,
  Acl → AclEntry}`, plus `Job`. JSON columns hold evidence-line lists and
  parsed match fields; they can be promoted to tables when query patterns
  demand it.
* **Jobs** — `services/jobs.py`, a thread-pool job table. Imports run through
  it; `NE_JOBS_SYNC=true` makes them inline (tests, simple deployments).
* **Import flow** — `routers/imports.py` → `services/importer.py` →
  `services/ncm.py` (archive interpretation) → `services/cisco_parser.py`.
  One import produces one snapshot; every decision (skipped duplicate,
  hostname mismatch, rejected file) is appended to the import's audit log.
* **Analysis** — `services/topology.py` (presentation graph),
  `services/diff.py` (raw + semantic diff, suspect ranking),
  `services/pathfinder.py` (orchestrates Batfish or degraded mode),
  `services/batfish_client.py` (pybatfish, lazily imported).
* **Logging** — structured JSON lines on stdout (`logging_setup.py`).

## Frontend (apps/web)

React 18 + TypeScript + Vite. React Router for navigation, TanStack Query
for all server state, zod validation at the API boundary (`lib/api.ts`),
Tailwind CSS v4 with a small hand-rolled shadcn-style component set
(`components/ui.tsx` — kept dependency-light so builds are fully offline).
Topology uses `@xyflow/react` with ELK layered layout, lazy-loaded as its own
chunk. `lib/branding.ts` isolates the product name.

## SolarWinds NCM interpretation

`services/ncm.py` normalizes the archive shapes seen in the field
(per-device folders, `Device-Running-<timestamp>.cfg`, flat exports). Rules:
running-config beats startup; newest timestamp wins; the in-config
`hostname` is authoritative over filenames (mismatch ⇒ warning). Details and
user guidance: [docs/importing.md](docs/importing.md).

## Testing strategy

* Backend: pytest against a real SQLite DB through the HTTP API (24 tests:
  parser semantics, import selection rules, topology tiers, diff/suspects,
  degraded-mode honesty). ruff + mypy clean.
* Frontend: Vitest unit tests (evidence-link round-trips, schema honesty
  guards) + tsc + eslint.
* End-to-end: Playwright drives the real stack through the full
  investigation workflow (`apps/web/e2e/smoke.spec.ts`).
* Batfish integration is exercised manually against the fixtures (the
  container is heavy for CI); everything else degrades gracefully without it.

## Decisions & trade-offs

* **SQLite over Postgres** — single-user local MVP; SQLAlchemy keeps the door
  open.
* **Configs stored in the DB** rather than on disk — one artifact to back up
  or destroy; Batfish snapshots are materialized to a temp dir on demand.
* **`packages/shared-types` not created yet** — with a single API consumer,
  the zod mirror in `apps/web/src/lib/api-schemas.ts` is the shared contract;
  a generated package becomes worthwhile with a second consumer (e.g. Tauri).
* **Suspect ranking is heuristic on purpose** — it orders human
  investigation and says so (`confidence: inferred`); Batfish-on-both-
  snapshots is the rigorous check.
* **Tauri later** — the web app is the product; a Tauri wrapper is roadmap
  item M3 and required no MVP compromises.
