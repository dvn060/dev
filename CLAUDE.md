# CLAUDE.md — project guide for AI-assisted development

## Product purpose

**Network Evidence** (temporary working name — branding lives ONLY in
`apps/api/app/branding.py` and `apps/web/src/lib/branding.ts`) is a secure,
local-first application that imports Cisco configuration backups (especially
SolarWinds NCM archives) and produces **evidence-backed answers**: what
exists, whether A can reach B, which exact configuration lines prove it, what
changed, and which change broke a working flow. It is Cisco-first, offline,
and read-only. It is NOT monitoring, live discovery, deployment tooling, a
SolarWinds replacement, or a chatbot.

Primary users are experienced network engineers who are not software
developers — UI text must speak their language and never oversell certainty.

## Architecture (short form; details in ARCHITECTURE.md)

* `apps/api` — FastAPI + SQLAlchemy 2 + SQLite + Alembic. Owns import,
  parsing, evidence mapping, topology, diff, suspect ranking, jobs.
* `apps/web` — React + TS + Vite + TanStack Query + React Flow/ELK +
  Tailwind v4. zod validates every API response (`src/lib/api-schemas.ts`
  mirrors `app/schemas.py` — keep them in sync when changing the API).
* `services/batfish` — local Batfish container; **the** engine for
  routing/ACL/forwarding verdicts via `app/services/batfish_client.py`.
* Evidence pipeline: every parsed object carries `evidence_lines` (1-based
  line numbers into the stored raw config); every UI conclusion links to
  `/devices/:id/config?lines=…`. Do not break this chain when adding
  features.

## Commands

Backend (from `apps/api`, uses [uv](https://docs.astral.sh/uv/)):

```bash
uv sync --extra batfish          # install (Python 3.12)
uv run pytest -q                 # tests (must stay green)
uv run ruff check app tests      # lint
uv run mypy app                  # types
uv run uvicorn app.main:app --reload --port 8000
uv run alembic revision --autogenerate -m "…" && uv run alembic upgrade head
```

Frontend (from `apps/web`):

```bash
npm install
npm run test | typecheck | lint | build
npm run dev                      # :5173, proxies /api to :8000
npm run e2e                      # Playwright (backend must be running)
```

Stack: `docker compose up --build` → http://localhost:8080.
Windows wrappers: `scripts/dev.ps1`, `scripts/test.ps1`, `scripts/e2e.ps1`,
`scripts/up.ps1`. Fixture archives: `python scripts/build_fixture_archives.py`.

## Coding standards

* Python 3.12, typed; ruff + mypy must pass. Line length 100.
* TypeScript strict; eslint + tsc must pass. Server state via TanStack
  Query only; API calls only through `src/lib/api.ts`.
* Keep routers thin — domain logic lives in `app/services/*`.
* Every new parsed object type MUST carry `evidence_lines` and be exposed
  with them.
* User-facing wording: distinguish confirmed / inferred / possible; say
  "unknown" when we don't know. No invented certainty, ever.

## Non-negotiable safety rules

1. Read-only: no code that connects to or modifies network devices.
2. Local-first: no cloud calls, telemetry, or off-machine transmission of
   configuration data. Compose ports bind to 127.0.0.1.
3. Batfish is authoritative for behavior; never hand-roll a forwarding
   engine, and never let heuristics or (future) LLM output override its
   results.
4. Never report certainty when evidence is missing — degraded modes must say
   so explicitly (see `pathfinder.py` for the pattern).
5. Unsupported configuration syntax is recorded (warnings/completeness), not
   silently guessed.
6. AI features (none exist yet) must be optional; the core app works with no
   API key and no internet.

## Current milestone

M0 (Evidence MVP) is complete — see ROADMAP.md. Next is M1: auto-run Batfish
after import, bidirectional traceroute, `searchFilters` reachability, route
-step evidence mapping, object-group support.

## Known limitations

* Single user, no auth, no encryption at rest, no secret redaction
  (SECURITY.md). Loopback binding is the safety boundary.
* Parser models IOS/IOS-XE well; NX-OS basics; no object-groups, time-ranges
  or IPv6 routes (flagged as warnings, entries marked `unsupported`).
* Degraded path analysis (no Batfish) yields verdict `unknown` by design.
* Suspect ranking is an ordinal heuristic, labeled as such.
* Topology edges: physical cabling cannot be proven from configs — /30
  adjacency is `inferred`, description hints are `possible`.

## How to validate changes

1. `apps/api`: `uv run pytest -q && uv run ruff check app tests && uv run mypy app`
2. `apps/web`: `npm run test && npm run typecheck && npm run lint && npm run build`
3. If the change touches a user workflow, run the Playwright smoke test
   (start backend with `NE_JOBS_SYNC=true NE_BATFISH_ENABLED=false`, then
   `npm run e2e`).
4. Manual sanity: import `fixtures/ncm-archives/ncm-archive-baseline.zip`,
   expect 4 devices at 100% completeness; path-analyze 10.10.10.42 →
   10.10.20.50 tcp/443; import `…-changed.zip` and confirm suspect #1 is the
   removed `permit … eq 443` on DIST-SW-01 (score 100).
5. Update this file, ARCHITECTURE.md and ROADMAP.md when behavior, commands
   or milestones change.
