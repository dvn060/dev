import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { completenessTone } from '../lib/confidence';
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

export function SnapshotsPage() {
  const { workspaceId = '' } = useParams();
  const queryClient = useQueryClient();
  const snapshots = useQuery({
    queryKey: ['snapshots', workspaceId],
    queryFn: () => api.listSnapshots(workspaceId),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteSnapshot(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['snapshots', workspaceId] }),
  });

  return (
    <Card>
      <CardHeader
        title="Snapshots"
        subtitle="Each snapshot is one network state, built from one import. Completeness shows how much of the configuration content the parser understood."
      />
      {snapshots.isLoading && <Spinner />}
      {snapshots.isError && <ErrorNote error={snapshots.error} />}
      {snapshots.data && snapshots.data.length === 0 && (
        <div className="p-4">
          <EmptyState title="No snapshots yet" hint="Import a configuration backup to create one." />
        </div>
      )}
      {snapshots.data && snapshots.data.length > 0 && (
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Effective</Th>
              <Th>Devices</Th>
              <Th>Warnings</Th>
              <Th>Parse errors</Th>
              <Th>Completeness</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {snapshots.data.map((snap) => (
              <tr key={snap.id}>
                <Td>
                  <Link to={`/snapshots/${snap.id}`} className="font-medium text-slate-900 hover:underline">
                    {snap.display_name}
                  </Link>
                </Td>
                <Td>{new Date(snap.effective_at).toLocaleString()}</Td>
                <Td>{snap.device_count}</Td>
                <Td>{snap.warning_count}</Td>
                <Td className={snap.parse_error_count > 0 ? 'font-medium text-red-700' : ''}>
                  {snap.parse_error_count}
                </Td>
                <Td>
                  <span className={`font-medium ${completenessTone(snap.completeness_score)}`}>
                    {(snap.completeness_score * 100).toFixed(0)}%
                  </span>
                </Td>
                <Td>
                  <Badge className="border-slate-300 bg-slate-50 text-slate-700">
                    {snap.analysis_status}
                  </Badge>
                </Td>
                <Td>
                  <Button
                    variant="ghost"
                    title="Delete snapshot"
                    onClick={() => {
                      if (confirm(`Delete snapshot "${snap.display_name}"?`)) remove.mutate(snap.id);
                    }}
                  >
                    <Trash2 size={14} aria-hidden />
                  </Button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}
