/**
 * Import wizard: upload → proposed snapshot grouping → user corrections
 * (rename snapshots, move files between them, exclude files) → confirm.
 * Nothing is committed until Confirm.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Upload, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { z } from 'zod';
import { Badge, Button, Card, CardHeader, ErrorNote, Input, Label, Select } from './ui';

const PreviewSchema = z.object({
  staged_import_id: z.string(),
  ambiguous: z.boolean(),
  file_count: z.number(),
  skipped: z.array(z.string()),
  groups: z.array(
    z.object({
      name: z.string(),
      date: z.string().nullable(),
      effective_at: z.string().nullable(),
      files: z.array(
        z.object({
          path: z.string(),
          device: z.string(),
          config_type: z.string(),
          timestamp: z.string().nullable(),
        }),
      ),
    }),
  ),
});
type Preview = z.infer<typeof PreviewSchema>;

const ConfirmSchema = z.object({
  results: z.array(
    z.object({ import_id: z.string(), job_id: z.string(), snapshot_name: z.string() }),
  ),
});

interface FileRow {
  path: string;
  device: string;
  config_type: string;
  timestamp: string | null;
  group: number; // index into names
  excluded: boolean;
}

export function ImportWizard({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [snapshotName, setSnapshotName] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [names, setNames] = useState<string[]>([]);
  const [effectiveAts, setEffectiveAts] = useState<(string | null)[]>([]);
  const [rows, setRows] = useState<FileRow[]>([]);

  const previewMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      if (snapshotName.trim()) form.append('snapshot_name', snapshotName.trim());
      const resp = await fetch(`/api/workspaces/${workspaceId}/imports/preview`, {
        method: 'POST',
        body: form,
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(typeof body.detail === 'string' ? body.detail : resp.statusText);
      }
      return PreviewSchema.parse(await resp.json());
    },
    onSuccess: (data) => {
      setPreview(data);
      setNames(data.groups.map((g) => g.name));
      setEffectiveAts(data.groups.map((g) => g.effective_at));
      setRows(
        data.groups.flatMap((g, gi) =>
          g.files.map((f) => ({ ...f, group: gi, excluded: false })),
        ),
      );
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const groups = names
        .map((name, gi) => ({
          name,
          file_paths: rows.filter((r) => r.group === gi && !r.excluded).map((r) => r.path),
          effective_at: effectiveAts[gi],
        }))
        .filter((g) => g.file_paths.length > 0);
      const excluded = rows.filter((r) => r.excluded).map((r) => r.path);
      const resp = await fetch(`/api/imports/staged/${preview!.staged_import_id}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groups, excluded }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(typeof body.detail === 'string' ? body.detail : resp.statusText);
      }
      return ConfirmSchema.parse(await resp.json());
    },
    onSuccess: () => {
      reset();
      void queryClient.invalidateQueries({ queryKey: ['imports', workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ['snapshots', workspaceId] });
    },
  });

  function reset() {
    setPreview(null);
    setRows([]);
    setNames([]);
    setSnapshotName('');
    if (fileInput.current) fileInput.current.value = '';
  }

  return (
    <Card>
      <CardHeader
        title="Import configurations"
        subtitle="Upload a single Cisco config (.cfg/.txt) or a zip archive exported from SolarWinds NCM. You review the proposed snapshot grouping before anything is committed. Files are processed locally; nothing leaves this machine."
      />
      {!preview && (
        <form
          className="flex flex-wrap items-end gap-3 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const file = fileInput.current?.files?.[0];
            if (file) previewMutation.mutate(file);
          }}
        >
          <div>
            <Label>File (.cfg, .txt, .conf or .zip)</Label>
            <input
              ref={fileInput}
              type="file"
              accept=".cfg,.txt,.conf,.config,.zip"
              required
              className="block text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-slate-700"
            />
          </div>
          <div className="w-64">
            <Label>Snapshot name (optional)</Label>
            <Input
              value={snapshotName}
              onChange={(e) => setSnapshotName(e.target.value)}
              placeholder="e.g. May 2024 baseline"
            />
          </div>
          <Button type="submit" disabled={previewMutation.isPending}>
            <Upload size={14} aria-hidden />
            {previewMutation.isPending ? 'Analyzing…' : 'Preview import'}
          </Button>
          {previewMutation.isError && <ErrorNote error={previewMutation.error} />}
        </form>
      )}

      {preview && (
        <div className="space-y-4 p-4" data-testid="import-wizard">
          <div className="flex flex-wrap items-center gap-2">
            {preview.ambiguous ? (
              <Badge className="border-amber-300 bg-amber-50 text-amber-800">
                Grouping is ambiguous — the files span multiple export runs. Review before
                confirming.
              </Badge>
            ) : (
              <Badge className="border-emerald-300 bg-emerald-50 text-emerald-800">
                {preview.file_count} file(s), one snapshot proposed
              </Badge>
            )}
            <Button variant="ghost" onClick={reset}>
              <X size={14} aria-hidden /> Cancel
            </Button>
          </div>

          {names.map((name, gi) => {
            const groupRows = rows.filter((r) => r.group === gi);
            return (
              <div key={gi} className="rounded-md border border-slate-200" data-testid={`wizard-group-${gi}`}>
                <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 bg-slate-50 px-3 py-2">
                  <Label>Snapshot name</Label>
                  <Input
                    className="w-72"
                    value={name}
                    onChange={(e) =>
                      setNames((ns) => ns.map((n, i) => (i === gi ? e.target.value : n)))
                    }
                    aria-label={`Snapshot ${gi + 1} name`}
                  />
                  <span className="text-xs text-slate-500">
                    {groupRows.filter((r) => !r.excluded).length} file(s)
                  </span>
                </div>
                <ul className="divide-y divide-slate-50">
                  {groupRows.map((row) => (
                    <li
                      key={row.path}
                      className={`flex flex-wrap items-center gap-3 px-3 py-1.5 text-sm ${row.excluded ? 'opacity-50' : ''}`}
                    >
                      <span className="w-36 truncate font-medium text-slate-800">{row.device}</span>
                      <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-500">
                        {row.path}
                      </span>
                      <span className="w-40 font-mono text-xs text-slate-400">
                        {row.timestamp
                          ? new Date(row.timestamp).toLocaleString()
                          : 'no timestamp'}
                      </span>
                      {names.length > 1 && (
                        <Select
                          className="w-44"
                          value={String(row.group)}
                          aria-label={`Snapshot for ${row.device}`}
                          onChange={(e) =>
                            setRows((rs) =>
                              rs.map((r) =>
                                r.path === row.path
                                  ? { ...r, group: parseInt(e.target.value, 10) }
                                  : r,
                              ),
                            )
                          }
                        >
                          {names.map((n, i) => (
                            <option key={i} value={i}>
                              → {n}
                            </option>
                          ))}
                        </Select>
                      )}
                      <label className="flex items-center gap-1 text-xs text-slate-500">
                        <input
                          type="checkbox"
                          checked={row.excluded}
                          onChange={(e) =>
                            setRows((rs) =>
                              rs.map((r) =>
                                r.path === row.path ? { ...r, excluded: e.target.checked } : r,
                              ),
                            )
                          }
                        />
                        exclude
                      </label>
                    </li>
                  ))}
                  {groupRows.length === 0 && (
                    <li className="px-3 py-2 text-xs text-slate-400">
                      No files — this snapshot will not be created.
                    </li>
                  )}
                </ul>
              </div>
            );
          })}

          {preview.skipped.length > 0 && (
            <details className="text-xs text-slate-500">
              <summary>{preview.skipped.length} file(s) skipped automatically</summary>
              <ul className="mt-1 list-inside list-disc">
                {preview.skipped.map((msg, i) => (
                  <li key={i}>{msg}</li>
                ))}
              </ul>
            </details>
          )}

          <div className="flex items-center gap-3">
            <Button
              onClick={() => confirmMutation.mutate()}
              disabled={
                confirmMutation.isPending || rows.every((r) => r.excluded) ||
                names.some((n) => !n.trim())
              }
            >
              <CheckCircle2 size={14} aria-hidden />
              {confirmMutation.isPending ? 'Importing…' : 'Confirm import'}
            </Button>
            {confirmMutation.isError && <ErrorNote error={confirmMutation.error} />}
          </div>
        </div>
      )}
    </Card>
  );
}
