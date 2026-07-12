/**
 * Typed API client. All requests go to the same origin (`/api`), which the
 * Vite dev server or nginx proxies to the local backend — the browser never
 * talks to anything but localhost.
 */
import { z } from 'zod';
import {
  DeviceConfigSchema,
  DeviceDetailSchema,
  DeviceSummarySchema,
  DiffResultSchema,
  HealthSchema,
  ImportDetailSchema,
  ImportRecordSchema,
  JobSchema,
  PathResultSchema,
  SearchResultSchema,
  SnapshotSchema,
  SuspectsResultSchema,
  TopologySchema,
  WorkspaceSchema,
} from './api-schemas';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(
  schema: z.ZodType<T>,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const resp = await fetch(path, init);
  if (!resp.ok) {
    let detail = resp.statusText;
    try {
      const body = await resp.json();
      if (typeof body.detail === 'string') detail = body.detail;
      else if (body.detail) detail = JSON.stringify(body.detail);
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(resp.status, detail);
  }
  if (resp.status === 204) return undefined as T;
  return schema.parse(await resp.json());
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export interface PathQueryInput {
  src_ip: string;
  dst_ip: string;
  protocol: string;
  dst_port?: number | null;
  src_port?: number | null;
}

export const api = {
  health: () => request(HealthSchema, '/api/health'),

  listWorkspaces: () => request(z.array(WorkspaceSchema), '/api/workspaces'),
  createWorkspace: (name: string, description: string) =>
    request(WorkspaceSchema, '/api/workspaces', json({ name, description })),
  deleteWorkspace: (id: string) =>
    request(z.undefined(), `/api/workspaces/${id}`, { method: 'DELETE' }),
  getWorkspace: (id: string) => request(WorkspaceSchema, `/api/workspaces/${id}`),

  listImports: (workspaceId: string) =>
    request(z.array(ImportRecordSchema), `/api/workspaces/${workspaceId}/imports`),
  getImport: (importId: string) => request(ImportDetailSchema, `/api/imports/${importId}`),
  uploadImport: (workspaceId: string, file: File, snapshotName?: string) => {
    const form = new FormData();
    form.append('file', file);
    if (snapshotName) form.append('snapshot_name', snapshotName);
    return request(
      z.object({ import_id: z.string(), job_id: z.string(), snapshot_name: z.string() }),
      `/api/workspaces/${workspaceId}/imports`,
      { method: 'POST', body: form },
    );
  },

  getJob: (jobId: string) => request(JobSchema, `/api/jobs/${jobId}`),

  listSnapshots: (workspaceId: string) =>
    request(z.array(SnapshotSchema), `/api/workspaces/${workspaceId}/snapshots`),
  getSnapshot: (snapshotId: string) => request(SnapshotSchema, `/api/snapshots/${snapshotId}`),
  deleteSnapshot: (snapshotId: string) =>
    request(z.undefined(), `/api/snapshots/${snapshotId}`, { method: 'DELETE' }),

  listDevices: (snapshotId: string) =>
    request(z.array(DeviceSummarySchema), `/api/snapshots/${snapshotId}/devices`),
  getDevice: (deviceId: string) => request(DeviceDetailSchema, `/api/devices/${deviceId}`),
  getDeviceConfig: (deviceId: string) =>
    request(DeviceConfigSchema, `/api/devices/${deviceId}/config`),

  getTopology: (snapshotId: string) =>
    request(TopologySchema, `/api/snapshots/${snapshotId}/topology`),

  search: (snapshotId: string, q: string) =>
    request(
      SearchResultSchema,
      `/api/snapshots/${snapshotId}/search?q=${encodeURIComponent(q)}`,
    ),

  pathAnalysis: (snapshotId: string, query: PathQueryInput) =>
    request(PathResultSchema, `/api/snapshots/${snapshotId}/path-analysis`, json(query)),

  diff: (workspaceId: string, base: string, target: string) =>
    request(
      DiffResultSchema,
      `/api/workspaces/${workspaceId}/diff?base=${encodeURIComponent(base)}&target=${encodeURIComponent(target)}`,
    ),

  diffSuspects: (workspaceId: string, base: string, target: string, query: PathQueryInput) =>
    request(
      SuspectsResultSchema,
      `/api/workspaces/${workspaceId}/diff/suspects?base=${encodeURIComponent(base)}&target=${encodeURIComponent(target)}`,
      json(query),
    ),
};
