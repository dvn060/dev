# Network Evidence

> Working name — branding is isolated in `apps/api/app/branding.py` and
> `apps/web/src/lib/branding.ts` so the product can be renamed later.

**A secure, local-first network configuration investigation application.**
Import Cisco configuration backups — especially archives exported from
SolarWinds Network Configuration Manager — and get evidence-backed answers
about your network, with zero connections to production devices.

## What it answers

1. **What exists?** Devices, interfaces, VLANs, networks, static routes, ACLs
   and the relationships between them.
2. **Can A talk to B?** Path analysis for a source, destination, protocol and
   port, computed by the [Batfish](https://batfish.org) analysis engine.
3. **Why / why not?** The exact forwarding, routing or filtering decision
   involved — hop by hop.
4. **Prove it.** Every conclusion links to the exact configuration lines that
   support it.
5. **What changed?** Semantic and raw diffs between any two snapshots.
6. **What broke it?** Deterministic ranking of the changes most likely to have
   broken a previously working flow.
7. **How sure are we?** Everything is labeled *confirmed*, *inferred* or
   *possible*, and missing evidence is reported instead of papered over.

## What it is not

Not a SolarWinds replacement, not monitoring, not live discovery, not a
deployment tool, not a chatbot. It reads configuration backups you already
have and turns them into understandable, traceable, defensible answers.
The first release is **read-only** and needs **no SSH, SNMP, API credentials,
internet access or SolarWinds administrative access**.

## Quick start (Windows 11 + Docker Desktop)

```powershell
git clone <this repo>
cd <repo>
docker compose up --build      # or .\scripts\up.ps1
```

Open **http://localhost:8080** — all services bind to `127.0.0.1` only.

Then:

1. Create a workspace.
2. **Imports** → upload a Cisco config (`.cfg`/`.txt`) or a zip archive
   exported from SolarWinds NCM. Demo data:
   `fixtures/ncm-archives/ncm-archive-baseline.zip` and
   `...-changed.zip`.
3. Explore devices, topology and configuration search from the snapshot page.
4. **Path analysis** → e.g. `10.10.10.42 → 10.10.20.50` TCP/443 (fixtures).
5. Import the *changed* archive and use **Compare & root cause** to see which
   change broke that flow.

## Development

Prerequisites: Python 3.12+, [uv](https://docs.astral.sh/uv/), Node 20+,
Docker (optional, for Batfish).

```powershell
.\scripts\dev.ps1     # backend :8000 (reload) + frontend :5173 (HMR)
.\scripts\test.ps1    # pytest + ruff + mypy + vitest + tsc + eslint + build
.\scripts\e2e.ps1     # Playwright browser workflow test
```

Equivalent commands on any platform are documented in [CLAUDE.md](CLAUDE.md).

## Repository layout

| Path | Contents |
| --- | --- |
| `apps/api` | FastAPI backend: parsing, import, evidence, diff, analysis |
| `apps/web` | React frontend: investigation UI |
| `services/batfish` | Batfish analysis engine service notes |
| `fixtures/` | Cisco lab configs + NCM-style demo archives |
| `docs/` | User and design documentation |
| `scripts/` | PowerShell development scripts |

See [ARCHITECTURE.md](ARCHITECTURE.md) for design, [SECURITY.md](SECURITY.md)
for the security model, [ROADMAP.md](ROADMAP.md) for what's next.
