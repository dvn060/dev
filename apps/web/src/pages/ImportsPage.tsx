import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { ImportWizard } from '../components/ImportWizard';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorNote,
  Spinner,
  Table,
  Td,
  Th,
} from '../components/ui';

const STATUS_STYLE: Record<string, string> = {
  completed: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  completed_with_warnings: 'border-amber-300 bg-amber-50 text-amber-800',
  failed: 'border-red-300 bg-red-50 text-red-800',
  running: 'border-sky-300 bg-sky-50 text-sky-800',
  pending: 'border-slate-300 bg-slate-50 text-slate-600',
};

export function ImportsPage() {
  const { workspaceId = '' } = useParams();
  const [expanded, setExpanded] = useState<string | null>(null);

  const imports = useQuery({
    queryKey: ['imports', workspaceId],
    queryFn: () => api.listImports(workspaceId),
    refetchInterval: (query) =>
      query.state.data?.some((i) => i.status === 'pending' || i.status === 'running')
        ? 1500
        : false,
  });

  const detail = useQuery({
    queryKey: ['import', expanded],
    queryFn: () => api.getImport(expanded!),
    enabled: expanded !== null,
  });

  return (
    <div className="space-y-4">
      <ImportWizard workspaceId={workspaceId} />

      <Card>
        <CardHeader title="Import history" subtitle="Every decision made during an import is recorded in its log." />
        {imports.isLoading && <Spinner />}
        {imports.isError && <ErrorNote error={imports.error} />}
        {imports.data && imports.data.length === 0 && (
          <div className="p-4">
            <EmptyState title="Nothing imported yet" hint="Fixtures live in fixtures/ncm-archives if you want a demo dataset." />
          </div>
        )}
        {imports.data && imports.data.length > 0 && (
          <Table>
            <thead>
              <tr>
                <Th>File</Th>
                <Th>Source type</Th>
                <Th>Imported</Th>
                <Th>Status</Th>
                <Th>Warnings</Th>
                <Th>Errors</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {imports.data.map((imp) => (
                <tr key={imp.id}>
                  <Td className="font-mono text-xs">{imp.original_filename}</Td>
                  <Td>{imp.source_type}</Td>
                  <Td>{new Date(imp.imported_at).toLocaleString()}</Td>
                  <Td>
                    <Badge className={STATUS_STYLE[imp.status] ?? STATUS_STYLE.pending}>
                      {imp.status.replaceAll('_', ' ')}
                    </Badge>
                  </Td>
                  <Td>{imp.warning_count}</Td>
                  <Td>{imp.error_count}</Td>
                  <Td>
                    <Button
                      variant="ghost"
                      onClick={() => setExpanded(expanded === imp.id ? null : imp.id)}
                    >
                      {expanded === imp.id ? 'Hide log' : 'View log'}
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {expanded && detail.data && (
          <div className="border-t border-slate-100 bg-slate-50 p-4">
            <h4 className="mb-2 text-xs font-semibold uppercase text-slate-500">Import log</h4>
            <ul className="max-h-72 space-y-1 overflow-y-auto font-mono text-xs">
              {detail.data.log.map((entry, i) => (
                <li key={i} className="flex gap-2">
                  <span
                    className={
                      entry.level === 'error'
                        ? 'text-red-700'
                        : entry.level === 'warning'
                          ? 'text-amber-700'
                          : 'text-slate-400'
                    }
                  >
                    [{entry.level}]
                  </span>
                  <span className="text-slate-700">{entry.message}</span>
                </li>
              ))}
              {detail.data.log.length === 0 && <li className="text-slate-400">Log is empty.</li>}
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
}
