# Batfish service

[Batfish](https://batfish.org) is the authoritative engine this application
uses for routing, ACL and forwarding behavior. It runs as a **local Docker
container** (`batfish/allinone`, pinned in `/docker-compose.yml`) and is never
exposed beyond `127.0.0.1`.

The application owns everything around Batfish — import workflows, snapshot
organization, evidence mapping back to configuration lines, presentation —
but does not reimplement its dataplane model.

## How the backend talks to it

`apps/api/app/services/batfish_client.py` (via `pybatfish`):

1. Health probe, cached for 30 s (`GET /api/health` reports it).
2. On the first path analysis for a snapshot, device configs are written from
   the database to a temp directory in the Batfish snapshot layout
   (`configs/*.cfg`) and initialized as `snap_<snapshot-id>` inside network
   `ne_<workspace-id>`.
3. `traceroute` answers are mapped back to our stored configuration lines by
   ACL name so every hop decision carries evidence links.

## Running without Batfish

The application stays fully functional for inventory, topology, search, diff
and root-cause ranking. Path analysis then reports verdict **unknown** with
clearly labeled inferred candidate evidence — it never guesses a
permitted/denied verdict without the engine (architecture rule 5).

Disable intentionally with `NE_BATFISH_ENABLED=false`.

## Version pinning

The image tag is pinned in `docker-compose.yml`. When bumping it, re-run the
backend test suite and one manual path analysis against
`fixtures/ncm-archives/ncm-archive-baseline.zip` (expected results are
documented in `/fixtures/README.md`).
