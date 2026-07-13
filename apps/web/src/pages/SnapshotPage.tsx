import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Search } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { completenessTone } from '../lib/confidence';

// React Flow + ELK are heavy; load them only when the topology tab opens.
const TopologyView = lazy(() =>
  import('../components/TopologyView').then((m) => ({ default: m.TopologyView })),
);
const FindingsView = lazy(() =>
  import('../components/FindingsView').then((m) => ({ default: m.FindingsView })),
);
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  ErrorNote,
  Input,
  Spinner,
  Table,
  Tabs,
  Td,
  Th,
} from '../components/ui';

export function SnapshotPage() {
  const { snapshotId = '' } = useParams();
  const [tab, setTab] = useState('devices');

  const snapshot = useQuery({
    queryKey: ['snapshot', snapshotId],
    queryFn: () => api.getSnapshot(snapshotId),
  });
  const devices = useQuery({
    queryKey: ['devices', snapshotId],
    queryFn: () => api.listDevices(snapshotId),
  });

  if (snapshot.isLoading) return <Spinner label="Loading snapshot…" />;
  if (snapshot.isError) return <ErrorNote error={snapshot.error} />;
  const snap = snapshot.data!;

  return (
    <div className="space-y-4">
      <nav className="flex items-center gap-1 text-sm text-slate-500">
        <Link to="/" className="hover:text-slate-900">Workspaces</Link>
        <ChevronRight size={14} aria-hidden />
        <Link to={`/w/${snap.workspace_id}/snapshots`} className="hover:text-slate-900">Snapshots</Link>
        <ChevronRight size={14} aria-hidden />
        <span className="font-medium text-slate-900">{snap.display_name}</span>
      </nav>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold">{snap.display_name}</h1>
        <Badge className="border-slate-300 bg-slate-50 text-slate-700">
          {snap.device_count} devices
        </Badge>
        <Badge className="border-slate-300 bg-slate-50 text-slate-700">
          effective {new Date(snap.effective_at).toLocaleString()}
        </Badge>
        <span className={`text-sm font-medium ${completenessTone(snap.completeness_score)}`}>
          {(snap.completeness_score * 100).toFixed(0)}% parsed
        </span>
        {snap.warning_count > 0 && (
          <Badge className="border-amber-300 bg-amber-50 text-amber-800">
            {snap.warning_count} warnings
          </Badge>
        )}
        <a
          href={`/api/snapshots/${snap.id}/report`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-100"
          title="Standalone HTML report; secrets redacted"
        >
          Export report
        </a>
      </div>

      <Tabs
        tabs={[
          { id: 'devices', label: 'Devices' },
          { id: 'findings', label: 'Findings' },
          { id: 'topology', label: 'Topology' },
          { id: 'search', label: 'Config search' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'devices' && (
        <Card>
          {devices.isLoading && <Spinner />}
          {devices.isError && <ErrorNote error={devices.error} />}
          {devices.data && (
            <Table>
              <thead>
                <tr>
                  <Th>Hostname</Th>
                  <Th>OS</Th>
                  <Th>Management IP</Th>
                  <Th>Source file</Th>
                  <Th>Parse</Th>
                  <Th>Warnings</Th>
                  <Th>Completeness</Th>
                </tr>
              </thead>
              <tbody>
                {devices.data.map((d) => (
                  <tr key={d.id}>
                    <Td>
                      <Link to={`/devices/${d.id}`} className="font-medium text-slate-900 hover:underline">
                        {d.hostname}
                      </Link>
                    </Td>
                    <Td>{d.os_family}</Td>
                    <Td className="font-mono text-xs">{d.management_ip ?? '—'}</Td>
                    <Td className="font-mono text-xs">{d.source_filename}</Td>
                    <Td>
                      <Badge
                        className={
                          d.parse_status === 'ok'
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                            : 'border-amber-300 bg-amber-50 text-amber-800'
                        }
                      >
                        {d.parse_status}
                      </Badge>
                    </Td>
                    <Td>{d.warning_count}</Td>
                    <Td className={completenessTone(d.completeness_score)}>
                      {(d.completeness_score * 100).toFixed(0)}%
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}

      {tab === 'findings' && (
        <Suspense fallback={<Spinner label="Loading findings…" />}>
          <FindingsView snapshotId={snapshotId} />
        </Suspense>
      )}

      {tab === 'topology' && (
        <Suspense fallback={<Spinner label="Loading topology view…" />}>
          <TopologyView snapshotId={snapshotId} />
        </Suspense>
      )}

      {tab === 'search' && <SnapshotSearch snapshotId={snapshotId} />}
    </div>
  );
}

function SnapshotSearch({ snapshotId }: { snapshotId: string }) {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const results = useQuery({
    queryKey: ['search', snapshotId, query],
    queryFn: () => api.search(snapshotId, query),
    enabled: query.length >= 2,
  });

  return (
    <Card>
      <CardHeader
        title="Search configuration lines"
        subtitle="Find any text across every device configuration in this snapshot. Results link straight to the evidence."
      />
      <div className="p-4">
        <form
          className="flex max-w-md gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(input.trim());
          }}
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="e.g. 10.10.20.50, SERVERS-IN, ntp server"
          />
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-3 text-white hover:bg-slate-700"
            aria-label="Search"
          >
            <Search size={16} aria-hidden />
          </button>
        </form>

        {results.isLoading && <Spinner />}
        {results.isError && <ErrorNote error={results.error} />}
        {results.data && results.data.hits.length === 0 && (
          <div className="mt-4">
            <EmptyState title={`No configuration lines match "${results.data.query}"`} />
          </div>
        )}
        {results.data && results.data.hits.length > 0 && (
          <div className="mt-4">
            {results.data.truncated && (
              <p className="mb-2 text-xs text-amber-700">
                Showing the first 500 matches; refine the search for a complete view.
              </p>
            )}
            <ul className="divide-y divide-slate-100 font-mono text-xs">
              {results.data.hits.map((hit, i) => (
                <li key={i} className="flex items-center gap-3 py-1.5">
                  <span className="w-32 shrink-0 truncate text-slate-500">{hit.hostname}</span>
                  <Link
                    to={`/devices/${hit.device_id}/config?lines=${hit.line}`}
                    className="w-14 shrink-0 text-sky-700 hover:underline"
                  >
                    L{hit.line}
                  </Link>
                  <span className="truncate text-slate-800">{hit.text}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}
