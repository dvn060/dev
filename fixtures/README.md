# Fixtures

A small four-device Cisco lab used by tests, demos and manual validation.

## Topology

```
                    198.51.100.0/30 ("ISP")
                          │ Gi0/1
                    ┌─────┴─────┐
                    │ EDGE-FW-01│  ACLs: INSIDE-OUT, OUTSIDE-IN
                    └─────┬─────┘
                          │ Gi0/0        10.0.1.0/30
                    ┌─────┴─────┐
                    │CORE-RTR-01│  static routes to all inside nets
                    └─────┬─────┘
                          │ Gi0/0        10.0.0.0/30
                    ┌─────┴─────┐
                    │ DIST-SW-01│  SVIs: Vlan10/20/30/99 (L3 gateway)
                    └─────┬─────┘  ACL SERVERS-IN applied out on Vlan20
              Po1 (trunk) │
                    ┌─────┴─────┐
                    │ACCESS-SW-01│  access ports in VLANs 10/30, mgmt SVI 99
                    └───────────┘
```

Key addresses: user workstation `10.10.10.42` (VLAN 10), server APP-01
`10.10.20.50` (VLAN 20).

## Directories

* `cisco/baseline/` — the working state ("May baseline"). Users in VLAN 10
  are permitted to APP-01 on TCP/443 and 80 by ACL `SERVERS-IN`.
* `cisco/changed/` — a later state ("June change") where the
  `permit tcp 10.10.10.0 0.0.0.255 host 10.10.20.50 eq 443` entry was
  **removed** from `SERVERS-IN` on DIST-SW-01 (the intended root cause),
  plus two decoy changes: an NTP server change on CORE-RTR-01 and an
  interface description change on ACCESS-SW-01.
* `ncm-archives/` — the same states packaged as SolarWinds-NCM-style zip
  archives (per-device folders, timestamped `-Running-` filenames; the
  baseline archive also carries an older running copy, a startup copy and a
  readme to exercise the importer's selection logic). Rebuild with
  `python scripts/build_fixture_archives.py`.

## Expected analysis results

Import of either archive: 4 devices, 100% completeness, 0 parse errors.

Batfish dispositions, as returned by the live engine (batfish/allinone
`latest`, verified 2026-07-12; node names in traces are lowercased by
Batfish):

| Flow | Snapshot | Verdict | Disposition | Deciding ACL |
| --- | --- | --- | --- | --- |
| 10.10.10.42 → 10.10.20.50 tcp/443 | baseline | permitted | `DELIVERED_TO_SUBNET` | permitted by `SERVERS-IN` (DIST-SW-01, egress) |
| 10.10.10.42 → 10.10.20.50 tcp/80 | baseline | permitted | `DELIVERED_TO_SUBNET` | permitted by `SERVERS-IN` |
| 10.10.30.5 → 10.10.20.50 tcp/443 | baseline | denied | `DENIED_OUT` | denied by `SERVERS-IN` (voice VLAN never permitted) |
| 10.10.10.42 → 203.0.113.9 tcp/443 | baseline | permitted | `EXITS_NETWORK` | permitted by `INSIDE-OUT` (EDGE-FW-01) |
| 10.10.10.42 → 203.0.113.9 tcp/25 | baseline | denied | `DENIED_IN` | denied by `INSIDE-OUT` (ingress on EDGE Gi0/0) |
| 10.10.10.42 → 10.10.20.50 tcp/443 | changed | denied | `DENIED_OUT` | denied by `SERVERS-IN` (the removed permit) |
| 10.10.10.42 → 10.10.20.50 tcp/80 | changed | permitted | `DELIVERED_TO_SUBNET` | still permitted by `SERVERS-IN` |

Without Batfish, every one of these returns verdict `unknown` with the
relevant ACL entries as inferred candidate evidence — never a guessed
verdict.

Compare baseline → changed with the tcp/443 flow: suspect #1 is the removed
ACL permit on DIST-SW-01, score 100; description/NTP changes rank nowhere.
