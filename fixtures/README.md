# Fixtures

A small five-device Cisco lab used by tests, demos and manual validation.

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
              Po1 (trunk) │      │ Gi1/0/22 ── LAB-RTR-01 (10.0.3.0/30;
                    ┌─────┴─────┐         lab segment 10.10.60.0/24; NO default
                    │ACCESS-SW-01│         route — the "no route" demo case)
                    └───────────┘

CORE↔DIST are dual-linked (10.0.0.0/30 and 10.0.2.0/30) and DIST carries two
equal default routes — the ECMP demo. CORE null-routes 10.66.66.0/24
(`ip route ... Null0`) — the blackhole demo.
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
* `cisco/restored/` — the fix applied on top of the changed state (the 443
  permit re-added on 2024-07-01); the decoy changes remain.
* `cisco/secrets-demo/` — a config stuffed with FAKE credentials for the
  secret-detection and redaction tests. Never used in the main lab.
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
| 10.10.10.42 → 10.10.20.50 tcp/443 | restored | permitted | `DELIVERED_TO_SUBNET` | the re-added permit |
| 10.10.60.5 → 10.10.20.50 tcp/443 | baseline | undeliverable | `NO_ROUTE` | LAB-RTR-01 has no matching route (routing, not filtering) |
| 10.10.10.42 → 10.66.66.6 tcp/443 | baseline | undeliverable | `NULL_ROUTED` | CORE's Null0 blackhole route |

The 10.10.10.42 → 203.0.113.9 flows produce **two traces** (ECMP across the
dual CORE↔DIST defaults on DIST-SW-01) with identical dispositions.

Batfish **differential reachability** (verified live): baseline→changed finds
the 10.10.10.x → 10.10.20.50 TCP/443 flow going `DELIVERED_TO_SUBNET` →
`DENIED_OUT`; changed→restored finds the reverse; baseline→restored finds no
behavioral difference (the decoy changes are behaviorally irrelevant).

Without Batfish, every one of these returns verdict `unknown` with the
relevant ACL entries as inferred candidate evidence — never a guessed
verdict.

Compare baseline → changed with the tcp/443 flow: suspect #1 is the removed
ACL permit on DIST-SW-01, score 100; description/NTP changes rank nowhere.
