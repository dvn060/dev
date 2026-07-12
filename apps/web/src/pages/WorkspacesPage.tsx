import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FolderOpen, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { PRODUCT_TAGLINE } from '../lib/branding';
import { Button, Card, CardHeader, EmptyState, ErrorNote, Input, Label, Spinner } from '../components/ui';

export function WorkspacesPage() {
  const queryClient = useQueryClient();
  const workspaces = useQuery({ queryKey: ['workspaces'], queryFn: api.listWorkspaces });
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const create = useMutation({
    mutationFn: () => api.createWorkspace(name.trim(), description.trim()),
    onSuccess: () => {
      setName('');
      setDescription('');
      void queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    },
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold">Workspaces</h1>
        <p className="text-sm text-slate-500">
          {PRODUCT_TAGLINE}. A workspace isolates one organization, customer or lab.
        </p>
      </div>

      <Card>
        <CardHeader title="New workspace" />
        <form
          className="flex flex-wrap items-end gap-3 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create.mutate();
          }}
        >
          <div className="w-56">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme HQ" required />
          </div>
          <div className="w-80">
            <Label>Description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <Button type="submit" disabled={create.isPending || !name.trim()}>
            <Plus size={14} aria-hidden /> Create
          </Button>
          {create.isError && <ErrorNote error={create.error} />}
        </form>
      </Card>

      {workspaces.isLoading && <Spinner label="Loading workspaces…" />}
      {workspaces.isError && <ErrorNote error={workspaces.error} />}
      {workspaces.data && workspaces.data.length === 0 && (
        <EmptyState
          title="No workspaces yet"
          hint="Create one above, then import a configuration backup or NCM archive."
        />
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {workspaces.data?.map((ws) => (
          <Link key={ws.id} to={`/w/${ws.id}`}>
            <Card className="p-4 transition-shadow hover:shadow-md">
              <div className="flex items-center gap-2 font-medium text-slate-900">
                <FolderOpen size={16} className="text-slate-400" aria-hidden />
                {ws.name}
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                {ws.description || 'No description'}
              </p>
              <p className="mt-2 text-xs text-slate-400">
                Created {new Date(ws.created_at).toLocaleDateString()}
              </p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
