/**
 * Raw configuration viewer — the ground truth every evidence link lands on.
 * `?lines=12,15-18` highlights and scrolls to the referenced lines.
 */
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { clsx } from 'clsx';
import { api } from '../lib/api';
import { Card, ErrorNote, Spinner } from '../components/ui';

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
  const highlighted = useMemo(
    () => parseLinesParam(searchParams.get('lines')),
    [searchParams],
  );
  const firstHighlight = useRef<HTMLDivElement>(null);

  const config = useQuery({
    queryKey: ['device-config', deviceId],
    queryFn: () => api.getDeviceConfig(deviceId),
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

      <Card className="overflow-hidden">
        <div className="max-h-[75vh] overflow-y-auto bg-slate-950 py-2 font-mono text-xs leading-5">
          {cfg.lines.map((text, idx) => {
            const lineNo = idx + 1;
            const isHighlighted = highlighted.has(lineNo);
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
                <span className={isHighlighted ? 'text-amber-100' : 'text-slate-200'}>
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
