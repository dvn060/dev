import { useMutation, useQuery } from '@tanstack/react-query';
import { GitCompareArrows, SearchCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { clsx } from 'clsx';
import { api, type PathQueryInput } from '../lib/api';
import type { DiffResult, SemanticChange, SuspectsResult } from '../lib/api-schemas';
import { EvidenceLink } from '../components/EvidenceLink';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorNote,
  Input,
  Label,
  Select,
  Spinner,
} from '../components/ui';

const CATEGORY_STYLE: Record<string, string> = {
  acl: 'border-red-300 bg-red-50 text-red-800',
  route: 'border-violet-300 bg-violet-50 text-violet-800',
  interface: 'border-sky-300 bg-sky-50 text-sky-800',
  vlan: 'border-amber-300 bg-amber-50 text-amber-800',
};

export function ComparePage() {
  const { workspaceId = '' } = useParams();
  const snapshots = useQuery({
    queryKey: ['snapshots', workspaceId],
    queryFn: () => api.listSnapshots(workspaceId),
  });

  const [baseId, setBaseId] = useState('');
  const [targetId, setTargetId] = useState('');

  const defaults = useMemo(() => {
    const list = snapshots.data ?? [];
    return {
      base: baseId || list.at(-2)?.id || list.at(-1)?.id || '',
      target: targetId || list.at(-1)?.id || '',
    };
  }, [snapshots.data, baseId, targetId]);

  const diff = useQuery({
    queryKey: ['diff', workspaceId, defaults.base, defaults.target],
    queryFn: () => api.diff(workspaceId, defaults.base, defaults.target),
    enabled: Boolean(defaults.base && defaults.target && defaults.base !== defaults.target),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Compare snapshots"
          subtitle="What changed between two network states — as typed changes and as raw configuration diffs."
        />
        <div className="flex flex-wrap items-end gap-3 p-4">
          <div className="w-64">
            <Label>Base (earlier)</Label>
            <Select value={defaults.base} onChange={(e) => setBaseId(e.target.value)}>
              {snapshots.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.display_name}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-64">
            <Label>Target (later)</Label>
            <Select value={defaults.target} onChange={(e) => setTargetId(e.target.value)}>
              {snapshots.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.display_name}
                </option>
              ))}
            </Select>
          </div>
          {defaults.base === defaults.target && defaults.base !== '' && (
            <p className="text-sm text-amber-700">Pick two different snapshots.</p>
          )}
        </div>
      </Card>

      {diff.isLoading && <Spinner label="Comparing snapshots…" />}
      {diff.isError && <ErrorNote error={diff.error} />}
      {diff.data && (
        <>
          <DiffSummary diff={diff.data} />
          <SuspectFinder workspaceId={workspaceId} base={defaults.base} target={defaults.target} />
          <ChangesList diff={diff.data} />
          <RawDiffs diff={diff.data} />
        </>
      )}
    </div>
  );
}

function DiffSummary({ diff }: { diff: DiffResult }) {
  const items = [
    { label: 'changed', values: diff.devices_changed, tone: 'text-sky-700' },
    { label: 'added', values: diff.devices_added, tone: 'text-emerald-700' },
    { label: 'removed', values: diff.devices_removed, tone: 'text-red-700' },
    { label: 'unchanged', values: diff.devices_unchanged, tone: 'text-slate-500' },
  ];
  return (
    <Card className="flex flex-wrap gap-6 p-4">
      {items.map((item) => (
        <div key={item.label}>
          <div className={`text-lg font-semibold ${item.tone}`}>{item.values.length}</div>
          <div className="text-xs uppercase tracking-wide text-slate-500">
            devices {item.label}
          </div>
          {item.values.length > 0 && item.label !== 'unchanged' && (
            <div className="mt-1 font-mono text-xs text-slate-600">{item.values.join(', ')}</div>
          )}
        </div>
      ))}
    </Card>
  );
}

function SuspectFinder({
  workspaceId,
  base,
  target,
}: {
  workspaceId: string;
  base: string;
  target: string;
}) {
  const [srcIp, setSrcIp] = useState('');
  const [dstIp, setDstIp] = useState('');
  const [protocol, setProtocol] = useState('tcp');
  const [dstPort, setDstPort] = useState('');

  const suspects = useMutation({
    mutationFn: (query: PathQueryInput) => api.diffSuspects(workspaceId, base, target, query),
  });

  return (
    <Card>
      <CardHeader
        title="What broke this flow?"
        subtitle="Describe a communication that worked on the base snapshot but fails on the target. Changes are ranked by how plausibly they broke it — an investigation aid, not a simulation."
      />
      <form
        className="flex flex-wrap items-end gap-3 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          suspects.mutate({
            src_ip: srcIp.trim(),
            dst_ip: dstIp.trim(),
            protocol,
            dst_port: dstPort ? parseInt(dstPort, 10) : null,
          });
        }}
      >
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
            <Input value={dstPort} onChange={(e) => setDstPort(e.target.value)} placeholder="443" inputMode="numeric" />
          </div>
        )}
        <Button type="submit" disabled={suspects.isPending}>
          <SearchCheck size={14} aria-hidden /> Rank suspects
        </Button>
      </form>
      {suspects.isError && (
        <div className="px-4 pb-4">
          <ErrorNote error={suspects.error} />
        </div>
      )}
      {suspects.data && <SuspectsView result={suspects.data} />}
    </Card>
  );
}

function SuspectsView({ result }: { result: SuspectsResult }) {
  return (
    <div className="border-t border-slate-100">
      <p className="px-4 pt-3 text-xs text-slate-500">{result.note}</p>
      {result.suspects.length === 0 ? (
        <div className="p-4">
          <EmptyState
            title="No changes plausibly affect this flow"
            hint={`${result.total_changes} semantic change(s) were examined; none match the flow's addresses, ports or path objects.`}
          />
        </div>
      ) : (
        <ol className="divide-y divide-slate-100">
          {result.suspects.map((s, i) => (
            <li key={i} className="space-y-1 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={clsx(
                    'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold',
                    i === 0 ? 'bg-red-600 text-white' : 'bg-slate-200 text-slate-700',
                  )}
                >
                  {i + 1}
                </span>
                <span className="text-sm font-medium text-slate-800">{s.hostname}</span>
                <Badge className={CATEGORY_STYLE[s.category] ?? 'border-slate-300 bg-slate-50 text-slate-700'}>
                  {s.category}
                </Badge>
                <Badge className="border-sky-300 bg-sky-50 text-sky-800">inferred</Badge>
                <span className="text-xs text-slate-400">score {s.score}</span>
              </div>
              <p className="text-sm text-slate-700">{s.detail}</p>
              {s.reasons.map((r, ri) => (
                <p key={ri} className="text-xs text-slate-500">
                  → {r}
                </p>
              ))}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function ChangesList({ diff }: { diff: DiffResult }) {
  if (diff.changes.length === 0) return null;
  return (
    <Card>
      <CardHeader title={`Semantic changes (${diff.changes.length})`} />
      <ul className="divide-y divide-slate-100">
        {diff.changes.map((c, i) => (
          <ChangeRow key={i} change={c} diff={diff} />
        ))}
      </ul>
    </Card>
  );
}

function ChangeRow({ change, diff }: { change: SemanticChange; diff: DiffResult }) {
  const deviceDiff = diff.device_diffs.find((d) => d.hostname === change.hostname);
  return (
    <li className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm">
      <Badge className={CATEGORY_STYLE[change.category] ?? 'border-slate-300 bg-slate-50 text-slate-700'}>
        {change.category}
      </Badge>
      <Badge
        className={
          change.kind === 'added'
            ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
            : change.kind === 'removed'
              ? 'border-red-300 bg-red-50 text-red-800'
              : 'border-sky-300 bg-sky-50 text-sky-800'
        }
      >
        {change.kind}
      </Badge>
      <span className="font-medium text-slate-800">{change.hostname}</span>
      <span className="text-slate-600">{change.detail}</span>
      {deviceDiff && change.base_evidence_lines.length > 0 && (
        <EvidenceLink
          deviceId={deviceDiff.base_device_id}
          hostname="base"
          lines={change.base_evidence_lines}
          compact
        />
      )}
      {deviceDiff && change.target_evidence_lines.length > 0 && (
        <EvidenceLink
          deviceId={deviceDiff.target_device_id}
          hostname="target"
          lines={change.target_evidence_lines}
          compact
        />
      )}
    </li>
  );
}

function RawDiffs({ diff }: { diff: DiffResult }) {
  const [open, setOpen] = useState<string | null>(null);
  if (diff.device_diffs.length === 0) return null;
  return (
    <Card>
      <CardHeader
        title="Raw configuration diffs"
        subtitle="Unified diffs of the stored configurations — the unfiltered ground truth."
      />
      <div className="divide-y divide-slate-100">
        {diff.device_diffs.map((d) => (
          <div key={d.hostname}>
            <button
              className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-medium text-slate-800 hover:bg-slate-50"
              onClick={() => setOpen(open === d.hostname ? null : d.hostname)}
            >
              <GitCompareArrows size={14} className="text-slate-400" aria-hidden />
              {d.hostname}
              <span className="text-xs font-normal text-slate-400">
                {d.raw_diff.filter((l) => l.startsWith('+') || l.startsWith('-')).length} diff lines
              </span>
            </button>
            {open === d.hostname && (
              <pre className="overflow-x-auto bg-slate-950 px-4 py-3 font-mono text-xs leading-5">
                {d.raw_diff.map((line, i) => (
                  <div
                    key={i}
                    className={
                      line.startsWith('+')
                        ? 'text-emerald-400'
                        : line.startsWith('-')
                          ? 'text-red-400'
                          : line.startsWith('@@')
                            ? 'text-sky-400'
                            : 'text-slate-400'
                    }
                  >
                    {line || ' '}
                  </div>
                ))}
              </pre>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
