/**
 * Raw configuration viewer — the ground truth every evidence link lands on.
 * `?lines=12,15-18` highlights and scrolls to the referenced lines.
 *
 * Secrets are redacted by default. The "Show secrets" toggle is the ONE
 * sanctioned unredacted view in the entire application.
 */
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { clsx } from 'clsx';
import { api } from '../lib/api';
import { Badge, Button, Card, ErrorNote, Spinner } from '../components/ui';

export function parseLinesParam(param: string | null): Set<number> {
  const out = new Set<number>();
  if (!param) return out;
  for (const part of param.split(',')) {
    const range = part.split('-');
    if (range.length === 2) {
      const [a, b] = [parseInt(range[0], 10), parseInt(range[1], 10)];
      if (Number.isFinite(a) && Number.isFinite(b)) {
        for (let n = Math.min(a, b); n <= Math.max(a, b); n++) out.add(n);
      }
    } else {
      const n = parseInt(part, 10);
      if (Number.isFinite(n)) out.add(n);
    }
  }
  return out;
}

export function ConfigViewerPage() {
  const { deviceId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const [showSecrets, setShowSecrets] = useState(false);
  const highlighted = useMemo(
    () => parseLinesParam(searchParams.get('lines')),
    [searchParams],
  );
  const firstHighlight = useRef<HTMLDivElement>(null);

  const config = useQuery({
    queryKey: ['device-config', deviceId, showSecrets],
    queryFn: () => api.getDeviceConfig(deviceId, !showSecrets),
  });

  useEffect(() => {
    if (config.data && firstHighlight.current) {
      firstHighlight.current.scrollIntoView({ block: 'center' });
    }
  }, [config.data]);

  if (config.isLoading) return <Spinner label="Loading configuration…" />;
  if (config.isError) return <ErrorNote error={config.error} />;
  const cfg = config.data!;
  const firstLine = Math.min(...highlighted);
  const secretLines = new Set(cfg.secret_line_numbers);

  return (
    <div className="space-y-4">
      <nav className="flex items-center gap-1 text-sm text-slate-500">
        <Link to={`/devices/${deviceId}`} className="hover:text-slate-900">
          {cfg.hostname}
        </Link>
        <ChevronRight size={14} aria-hidden />
        <span className="font-medium text-slate-900">Configuration</span>
        <span className="ml-2 font-mono text-xs text-slate-400">{cfg.source_filename}</span>
      </nav>

      {cfg.secret_count > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          {cfg.redacted ? (
            <Badge className="border-emerald-300 bg-emerald-50 text-emerald-800">
              <ShieldCheck size={12} className="mr-1" aria-hidden />
              {cfg.secret_count} secret value{cfg.secret_count === 1 ? '' : 's'} redacted
            </Badge>
          ) : (
            <Badge className="border-red-300 bg-red-50 text-red-800">
              Unredacted view — {cfg.secret_count} secret value
              {cfg.secret_count === 1 ? '' : 's'} visible
            </Badge>
          )}
          <Button variant="outline" onClick={() => setShowSecrets((v) => !v)}>
            {cfg.redacted ? <Eye size={14} aria-hidden /> : <EyeOff size={14} aria-hidden />}
            {cfg.redacted ? 'Show secrets' : 'Hide secrets'}
          </Button>
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="max-h-[75vh] overflow-y-auto bg-slate-950 py-2 font-mono text-xs leading-5">
          {cfg.lines.map((text, idx) => {
            const lineNo = idx + 1;
            const isHighlighted = highlighted.has(lineNo);
            const isSecret = secretLines.has(lineNo);
            return (
              <div
                key={lineNo}
                ref={isHighlighted && lineNo === firstLine ? firstHighlight : undefined}
                className={clsx(
                  'flex px-3',
                  isHighlighted ? 'bg-amber-500/25' : 'hover:bg-slate-800/60',
                )}
              >
                <span
                  className={clsx(
                    'w-12 shrink-0 select-none text-right pr-4',
                    isHighlighted ? 'font-semibold text-amber-300' : 'text-slate-600',
                  )}
                >
                  {lineNo}
                </span>
                <span
                  className={clsx(
                    isHighlighted ? 'text-amber-100' : 'text-slate-200',
                    isSecret && !cfg.redacted && 'text-red-300',
                  )}
                >
                  {text || ' '}
                </span>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
