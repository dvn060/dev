/**
 * The evidence link: every conclusion in the UI routes back to the exact
 * configuration lines that support it. Clicking opens the device's config
 * viewer scrolled to and highlighting those lines.
 */
import { FileText } from 'lucide-react';
import { Link } from 'react-router-dom';

export function evidenceUrl(deviceId: string, lines: number[]): string {
  const param = lines.length > 0 ? `?lines=${lines.join(',')}` : '';
  return `/devices/${deviceId}/config${param}`;
}

export function EvidenceLink({
  deviceId,
  hostname,
  lines,
  compact,
}: {
  deviceId: string;
  hostname?: string;
  lines: number[];
  compact?: boolean;
}) {
  if (lines.length === 0) return null;
  const label = compact
    ? `L${lines[0]}${lines.length > 1 ? '…' : ''}`
    : `${hostname ? hostname + ' ' : ''}line${lines.length > 1 ? 's' : ''} ${summarizeLines(lines)}`;
  return (
    <Link
      to={evidenceUrl(deviceId, lines)}
      className="inline-flex items-center gap-1 rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-xs text-slate-700 hover:border-slate-500 hover:bg-white"
      title="Open configuration at these lines"
    >
      <FileText size={12} aria-hidden />
      {label}
    </Link>
  );
}

/** Collapse [5,6,7,12] into "5-7, 12". Exported for tests. */
export function summarizeLines(lines: number[]): string {
  const sorted = [...new Set(lines)].sort((a, b) => a - b);
  const parts: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (const n of sorted.slice(1)) {
    if (n === prev + 1) {
      prev = n;
      continue;
    }
    parts.push(start === prev ? `${start}` : `${start}-${prev}`);
    start = n;
    prev = n;
  }
  parts.push(start === prev ? `${start}` : `${start}-${prev}`);
  return parts.join(', ');
}
