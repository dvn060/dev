/**
 * Findings tab: deterministic, evidence-backed observations about a snapshot.
 * Severity reflects operational impact; hygiene items say so explicitly.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Finding } from '../lib/api-schemas';
import { EvidenceLink } from './EvidenceLink';
import { Badge, Card, EmptyState, ErrorNote, Spinner } from './ui';

const SEVERITY_STYLE: Record<Finding['severity'], string> = {
  high: 'border-red-300 bg-red-50 text-red-800',
  medium: 'border-orange-300 bg-orange-50 text-orange-800',
  low: 'border-amber-300 bg-amber-50 text-amber-800',
  info: 'border-slate-300 bg-slate-50 text-slate-600',
};

const CATEGORY_LABEL: Record<string, string> = {
  correctness: 'correctness',
  hygiene: 'hygiene',
  analysis_coverage: 'analysis coverage',
  freshness: 'freshness',
};

export function FindingsView({ snapshotId }: { snapshotId: string }) {
  const findings = useQuery({
    queryKey: ['findings', snapshotId],
    queryFn: () => api.getFindings(snapshotId),
    staleTime: 60_000,
  });

  if (findings.isLoading) return <Spinner label="Computing findings…" />;
  if (findings.isError) return <ErrorNote error={findings.error} />;
  const data = findings.data!;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {(['high', 'medium', 'low', 'info'] as const).map((sev) => (
          <Badge key={sev} className={SEVERITY_STYLE[sev]}>
            {data.counts[sev] ?? 0} {sev}
          </Badge>
        ))}
        <Badge
          className={
            data.batfish.consulted
              ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
              : 'border-amber-300 bg-amber-50 text-amber-800'
          }
          title={data.batfish.detail}
        >
          {data.batfish.consulted
            ? 'Analysis engine consulted'
            : 'Analysis engine not consulted — engine-derived findings missing'}
        </Badge>
      </div>

      {data.findings.length === 0 && (
        <EmptyState title="No findings" hint="The deterministic rules found nothing to flag in this snapshot." />
      )}

      {data.findings.map((f) => (
        <Card key={f.id} className="p-4" data-testid={`finding-${f.kind}`}>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={SEVERITY_STYLE[f.severity]}>{f.severity}</Badge>
            <Badge className="border-slate-300 bg-slate-50 text-slate-600">
              {CATEGORY_LABEL[f.category] ?? f.category}
            </Badge>
            <Badge
              className={
                f.confidence === 'confirmed'
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                  : 'border-sky-300 bg-sky-50 text-sky-800'
              }
            >
              {f.confidence}
            </Badge>
            <span className="text-sm font-medium text-slate-900">{f.title}</span>
          </div>
          <p className="mt-2 text-sm text-slate-600">{f.explanation}</p>
          {(f.evidence.length > 0 || f.affected.length > 0) && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {f.evidence.map((ev, i) => (
                <EvidenceLink
                  key={i}
                  deviceId={ev.device_id}
                  hostname={ev.hostname}
                  lines={ev.lines}
                />
              ))}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
