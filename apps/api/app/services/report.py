"""Standalone HTML report export for a snapshot.

Self-contained (inline CSS, no external assets, no scripts) so the file can
be attached to a ticket or change record. Secrets are redacted by default;
an unredacted report requires the explicit `redacted=false` request and is
labeled as such in its banner.
"""

from __future__ import annotations

import html
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from .. import branding
from ..models import Device, Snapshot
from .secrets import redact_config_text

_CSS = """
body { font-family: 'Segoe UI', system-ui, sans-serif; margin: 2rem auto; max-width: 60rem;
       color: #0f172a; line-height: 1.5; }
h1 { font-size: 1.4rem; } h2 { font-size: 1.1rem; margin-top: 2rem; }
table { border-collapse: collapse; width: 100%; font-size: 0.85rem; }
th, td { border: 1px solid #cbd5e1; padding: 0.35rem 0.6rem; text-align: left; }
th { background: #f1f5f9; }
.banner { padding: 0.6rem 1rem; border-radius: 6px; margin: 1rem 0; font-size: 0.9rem; }
.banner.ok { background: #ecfdf5; border: 1px solid #6ee7b7; }
.banner.warn { background: #fffbeb; border: 1px solid #fcd34d; }
.muted { color: #64748b; font-size: 0.8rem; }
pre { background: #0f172a; color: #e2e8f0; padding: 1rem; border-radius: 6px;
      font-size: 0.72rem; overflow-x: auto; }
.kpi { display: inline-block; margin-right: 2rem; }
.kpi b { font-size: 1.3rem; display: block; }
"""


def render_snapshot_report(db: Session, snapshot: Snapshot, redacted: bool = True) -> str:
    devices = (
        db.execute(
            select(Device)
            .where(Device.snapshot_id == snapshot.id)
            .options(selectinload(Device.interfaces))
            .order_by(Device.hostname)
        ).scalars().all()
    )
    e = html.escape
    total_secrets = sum(d.secret_count for d in devices)
    generated = datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC")

    parts: list[str] = [
        f"<!doctype html><html><head><meta charset='utf-8'>"
        f"<title>{e(branding.PRODUCT_NAME)} report — {e(snapshot.display_name)}</title>"
        f"<style>{_CSS}</style></head><body>",
        f"<h1>{e(branding.PRODUCT_NAME)} — snapshot report</h1>",
        f"<p class='muted'>Snapshot <b>{e(snapshot.display_name)}</b> · effective "
        f"{e(str(snapshot.effective_at))} · generated {generated}. "
        f"Read-only analysis of imported configuration backups; no live device access.</p>",
    ]

    if redacted:
        parts.append(
            f"<div class='banner ok'><b>Secrets redacted.</b> {total_secrets} credential "
            "value(s) detected at import were replaced with &lt;REDACTED&gt; throughout "
            "this report.</div>"
        )
    else:
        parts.append(
            "<div class='banner warn'><b>UNREDACTED REPORT.</b> This document contains "
            "credential material from device configurations. Handle accordingly.</div>"
        )

    parts.append("<h2>Summary</h2>")
    parts.append(
        "<p>"
        f"<span class='kpi'><b>{len(devices)}</b>devices</span>"
        f"<span class='kpi'><b>{snapshot.completeness_score * 100:.0f}%</b>parsed</span>"
        f"<span class='kpi'><b>{snapshot.warning_count}</b>parser warnings</span>"
        f"<span class='kpi'><b>{snapshot.parse_error_count}</b>parse errors</span>"
        f"<span class='kpi'><b>{total_secrets}</b>secrets detected</span>"
        "</p>"
    )
    if snapshot.completeness_score < 1.0 or snapshot.parse_error_count:
        parts.append(
            "<p class='muted'>Completeness below 100% means part of the configuration "
            "content was not understood by the parser and is excluded from structured "
            "answers — it is not silently interpreted.</p>"
        )

    parts.append("<h2>Devices</h2><table><tr><th>Hostname</th><th>OS</th>"
                 "<th>Management IP</th><th>Interfaces</th><th>Parse</th>"
                 "<th>Completeness</th><th>Warnings</th><th>Secrets</th><th>Source file</th></tr>")
    for d in devices:
        parts.append(
            f"<tr><td>{e(d.hostname)}</td><td>{e(d.os_family)}</td>"
            f"<td>{e(d.management_ip or '—')}</td><td>{len(d.interfaces)}</td>"
            f"<td>{e(d.parse_status)}</td><td>{d.completeness_score * 100:.0f}%</td>"
            f"<td>{d.warning_count}</td><td>{d.secret_count}</td>"
            f"<td>{e(d.source_filename)}</td></tr>"
        )
    parts.append("</table>")

    warned = [d for d in devices if d.parse_warnings]
    if warned:
        parts.append("<h2>Parser warnings</h2>")
        for d in warned:
            parts.append(f"<h3>{e(d.hostname)}</h3><ul>")
            for w in d.parse_warnings:
                parts.append(f"<li class='muted'>line {w['line']}: {e(w['message'])}</li>")
            parts.append("</ul>")

    parts.append("<h2>Appendix — configurations</h2>")
    parts.append("<p class='muted'>Verbatim stored configurations"
                 + (" with detected secrets redacted." if redacted else " (unredacted).")
                 + "</p>")
    for d in devices:
        text = redact_config_text(d.raw_config, d.secret_lines or []) if redacted else d.raw_config
        parts.append(f"<h3>{e(d.hostname)}</h3><pre>{e(text)}</pre>")

    parts.append(f"<p class='muted'>Generated by {e(branding.PRODUCT_NAME)} "
                 f"({e(branding.PRODUCT_TAGLINE)}).</p></body></html>")
    return "".join(parts)
