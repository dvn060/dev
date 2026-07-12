import { useMutation, useQuery } from '@tanstack/react-query';
import { Play } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, type PathQueryInput } from '../lib/api';
import type { PathResult } from '../lib/api-schemas';
import { dispositionMeta, VERDICT_META } from '../lib/confidence';
import { EvidenceLink } from '../components/EvidenceLink';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ErrorNote,
  Input,
  Label,
  Select,
  Spinner,
} from '../components/ui';

export function PathAnalysisPage() {
  const { workspaceId = '' } = useParams();
  const snapshots = useQuery({
    queryKey: ['snapshots', workspaceId],
    queryFn: () => api.listSnapshots(workspaceId),
  });

  const [snapshotId, setSnapshotId] = useState('');
  const [srcIp, setSrcIp] = useState('');
  const [dstIp, setDstIp] = useState('');
  const [protocol, setProtocol] = useState('tcp');
  const [dstPort, setDstPort] = useState('');

  const analysis = useMutation({
    mutationFn: (input: { snapshotId: string; query: PathQueryInput }) =>
      api.pathAnalysis(input.snapshotId, input.query),
  });

  const effectiveSnapshot = snapshotId || snapshots.data?.at(-1)?.id || '';

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Path analysis"
          subtitle="Can a source reach a destination on a given protocol and port? Verdicts come from the Batfish analysis engine; without it the result is honestly reported as unknown."
        />
        <form
          className="flex flex-wrap items-end gap-3 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            analysis.mutate({
              snapshotId: effectiveSnapshot,
              query: {
                src_ip: srcIp.trim(),
                dst_ip: dstIp.trim(),
                protocol,
                dst_port: dstPort ? parseInt(dstPort, 10) : null,
              },
            });
          }}
        >
          <div className="w-64">
            <Label>Snapshot</Label>
            <Select value={effectiveSnapshot} onChange={(e) => setSnapshotId(e.target.value)}>
              {snapshots.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.display_name}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-40">
            <Label>Source IP</Label>
            <Input value={srcIp} onChange={(e) => setSrcIp(e.target.value)} placeholder="10.10.10.42" required />
          </div>
          <div className="w-40">
            <Label>Destination IP</Label>
            <Input value={dstIp} onChange={(e) => setDstIp(e.target.value)} placeholder="10.10.20.50" required />
          </div>
          <div className="w-28">
            <Label>Protocol</Label>
            <Select value={protocol} onChange={(e) => setProtocol(e.target.value)}>
              <option value="tcp">TCP</option>
              <option value="udp">UDP</option>
              <option value="icmp">ICMP</option>
              <option value="ip">IP (any)</option>
            </Select>
          </div>
          {(protocol === 'tcp' || protocol === 'udp') && (
            <div className="w-28">
              <Label>Dest. port</Label>
              <Input
                value={dstPort}
                onChange={(e) => setDstPort(e.target.value)}
                placeholder="443"
                inputMode="numeric"
              />
            </div>
          )}
          <Button type="submit" disabled={analysis.isPending || !effectiveSnapshot}>
            <Play size={14} aria-hidden /> Analyze
          </Button>
        </form>
      </Card>

      {analysis.isPending && <Spinner label="Analyzing…" />}
      {analysis.isError && <ErrorNote error={analysis.error} />}
      {analysis.data && <PathResultView result={analysis.data} />}
    </div>
  );
}

function PathResultView({ result }: { result: PathResult }) {
  const meta = VERDICT_META[result.verdict];
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className={`rounded-md px-3 py-1 text-sm font-semibold ${meta.className}`}>
            {meta.label}
          </span>
          {result.dispositions?.map((d) => {
            const dm = dispositionMeta(d);
            return (
              <Badge key={d} className={dm.className} title={d}>
                {dm.label}
              </Badge>
            );
          })}
          <Badge
            className={
              result.verdict_source === 'batfish'
                ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                : 'border-amber-300 bg-amber-50 text-amber-800'
            }
          >
            {result.verdict_source === 'batfish'
              ? 'Computed by analysis engine'
              : 'No behavioral verdict (engine unavailable)'}
          </Badge>
        </div>
        <p className="mt-2 text-sm text-slate-700">{result.verdict_explanation}</p>
        {!result.batfish.available && (
          <p className="mt-1 text-xs text-amber-700">{result.batfish.detail}</p>
        )}
      </Card>

      {result.missing_evidence.length > 0 && (
        <Card>
          <CardHeader title="Missing evidence" />
          <ul className="space-y-1 p-4 text-sm text-amber-800">
            {result.missing_evidence.map((m, i) => (
              <li key={i}>• {m}</li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <EndpointCard title="Source location" locations={result.src_locations} />
        <EndpointCard title="Destination location" locations={result.dst_locations} />
      </div>

      {result.traces && result.traces.length > 0 && (
        <Card>
          <CardHeader
            title={`Forwarding traces (${result.traces.length})`}
            subtitle="Hop-by-hop decisions computed by the analysis engine, mapped to configuration evidence."
          />
          <div className="space-y-4 p-4">
            {result.traces.map((trace, ti) => (
              <div key={ti} className="rounded-md border border-slate-200">
                <div className="border-b border-slate-100 bg-slate-50 px-3 py-1.5 font-mono text-xs text-slate-600">
                  disposition: {trace.disposition}
                </div>
                <ol className="divide-y divide-slate-50">
                  {trace.hops.map((hop, hi) => (
                    <li key={hi} className="px-3 py-2">
                      <div className="text-sm font-medium text-slate-800">
                        {hi + 1}. {hop.node}
                      </div>
                      <ul className="mt-1 space-y-0.5">
                        {hop.steps.map((step, si) => (
                          <li key={si} className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                            <span className="font-mono">{step.type}</span>
                            {step.action && (
                              <Badge
                                className={
                                  step.action === 'DENIED'
                                    ? 'border-red-300 bg-red-50 text-red-800'
                                    : 'border-slate-300 bg-slate-50 text-slate-600'
                                }
                              >
                                {step.action}
                              </Badge>
                            )}
                            {step.acl_name && <span className="font-mono">ACL {step.acl_name}</span>}
                            {step.evidence && (
                              <EvidenceLink
                                deviceId={step.evidence.device_id}
                                hostname={step.evidence.hostname}
                                lines={step.evidence.lines ?? []}
                                compact
                              />
                            )}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </Card>
      )}

      {result.candidate_evidence && result.candidate_evidence.length > 0 && (
        <Card>
          <CardHeader
            title="Candidate evidence (inferred)"
            subtitle="Deterministic per-object matches for this flow. This is investigation material, not a reachability verdict: ordering along the real path is not evaluated without the analysis engine."
          />
          <ul className="divide-y divide-slate-100">
            {result.candidate_evidence.map((ev, i) => (
              <li key={i} className="space-y-1 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge className="border-sky-300 bg-sky-50 text-sky-800">inferred</Badge>
                  <span className="font-medium text-slate-800">{ev.hostname}</span>
                  {ev.type === 'acl_entry_match' && (
                    <>
                      <span className="font-mono text-xs">ACL {ev.acl_name}</span>
                      <Badge
                        className={
                          ev.action === 'permit'
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                            : 'border-red-300 bg-red-50 text-red-800'
                        }
                      >
                        {ev.action}
                      </Badge>
                    </>
                  )}
                  {ev.type === 'route_match' && (
                    <span className="font-mono text-xs">
                      route {ev.prefix} → {ev.next_hop}
                    </span>
                  )}
                  <EvidenceLink
                    deviceId={ev.evidence.device_id}
                    hostname={ev.evidence.hostname}
                    lines={ev.evidence.lines ?? []}
                    compact
                  />
                </div>
                {ev.entry_text && (
                  <div className="font-mono text-xs text-slate-500">{ev.entry_text}</div>
                )}
                <p className="text-xs text-slate-500">{ev.explanation}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function EndpointCard({
  title,
  locations,
}: {
  title: string;
  locations: PathResult['src_locations'];
}) {
  return (
    <Card>
      <CardHeader title={title} />
      {locations.length === 0 ? (
        <p className="p-4 text-sm text-slate-500">
          Not found on any imported device — see missing evidence above.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {locations.map((loc, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm">
              <span className="font-medium text-slate-800">{loc.hostname}</span>
              <span className="font-mono text-xs text-slate-500">
                {loc.interface} · {loc.subnet} · gw {loc.gateway_ip}
              </span>
              <EvidenceLink
                deviceId={loc.evidence.device_id}
                hostname={loc.evidence.hostname}
                lines={loc.evidence.lines ?? []}
                compact
              />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
