/**
 * zod schemas mirroring the backend Pydantic contract (apps/api/app/schemas.py).
 * Every API response is validated at the boundary so UI code can trust shapes.
 */
import { z } from 'zod';

export const WorkspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Workspace = z.infer<typeof WorkspaceSchema>;

export const ImportRecordSchema = z.object({
  id: z.string(),
  workspace_id: z.string(),
  original_filename: z.string(),
  source_type: z.string(),
  imported_at: z.string(),
  file_hash: z.string(),
  status: z.string(),
  warning_count: z.number(),
  error_count: z.number(),
});
export type ImportRecord = z.infer<typeof ImportRecordSchema>;

export const ImportLogEntrySchema = z.object({
  level: z.string(),
  message: z.string(),
  file: z.string().optional(),
});
export const ImportDetailSchema = ImportRecordSchema.extend({
  log: z.array(ImportLogEntrySchema),
});
export type ImportDetail = z.infer<typeof ImportDetailSchema>;

export const SnapshotSchema = z.object({
  id: z.string(),
  workspace_id: z.string(),
  import_id: z.string().nullable(),
  display_name: z.string(),
  effective_at: z.string(),
  batfish_snapshot_name: z.string().nullable(),
  analysis_status: z.string(),
  device_count: z.number(),
  warning_count: z.number(),
  parse_error_count: z.number(),
  completeness_score: z.number(),
  notes: z.string(),
  created_at: z.string(),
});
export type Snapshot = z.infer<typeof SnapshotSchema>;

export const DeviceSummarySchema = z.object({
  id: z.string(),
  snapshot_id: z.string(),
  hostname: z.string(),
  vendor: z.string(),
  os_family: z.string(),
  platform: z.string().nullable(),
  model: z.string().nullable(),
  management_ip: z.string().nullable(),
  source_filename: z.string(),
  parse_status: z.string(),
  warning_count: z.number(),
  completeness_score: z.number(),
});
export type DeviceSummary = z.infer<typeof DeviceSummarySchema>;

const IpAddressSchema = z.object({
  address: z.string(),
  prefix_length: z.number(),
  secondary: z.boolean().optional(),
});

export const InterfaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  layer_role: z.string(),
  admin_state: z.string(),
  switchport_mode: z.string().nullable(),
  access_vlan: z.number().nullable(),
  native_vlan: z.number().nullable(),
  trunk_allowed_vlans: z.string().nullable(),
  ip_addresses: z.array(IpAddressSchema),
  vrf: z.string().nullable(),
  acl_in: z.string().nullable(),
  acl_out: z.string().nullable(),
  evidence_lines: z.array(z.number()),
});
export type Interface = z.infer<typeof InterfaceSchema>;

export const AclEntrySchema = z.object({
  id: z.string(),
  position: z.number(),
  sequence: z.number().nullable(),
  action: z.string(),
  protocol: z.string().nullable(),
  src: z.record(z.unknown()).nullable(),
  dst: z.record(z.unknown()).nullable(),
  src_port: z.record(z.unknown()).nullable(),
  dst_port: z.record(z.unknown()).nullable(),
  established: z.number(),
  text: z.string(),
  line_number: z.number(),
});

export const AclSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.string(),
  evidence_lines: z.array(z.number()),
  entries: z.array(AclEntrySchema),
});
export type Acl = z.infer<typeof AclSchema>;

export const DeviceDetailSchema = DeviceSummarySchema.extend({
  config_hash: z.string(),
  parse_warnings: z.array(z.object({ line: z.number(), message: z.string() })),
  interfaces: z.array(InterfaceSchema),
  vlans: z.array(
    z.object({
      id: z.string(),
      vlan_id: z.number(),
      name: z.string().nullable(),
      evidence_lines: z.array(z.number()),
    }),
  ),
  routes: z.array(
    z.object({
      id: z.string(),
      vrf: z.string().nullable(),
      prefix: z.string(),
      next_hop_ip: z.string().nullable(),
      next_hop_interface: z.string().nullable(),
      admin_distance: z.number().nullable(),
      name: z.string().nullable(),
      evidence_lines: z.array(z.number()),
    }),
  ),
  acls: z.array(AclSchema),
});
export type DeviceDetail = z.infer<typeof DeviceDetailSchema>;

export const DeviceConfigSchema = z.object({
  device_id: z.string(),
  hostname: z.string(),
  source_filename: z.string(),
  lines: z.array(z.string()),
});
export type DeviceConfig = z.infer<typeof DeviceConfigSchema>;

export const EvidenceRefSchema = z.object({
  device_id: z.string(),
  hostname: z.string(),
  lines: z.array(z.number()).optional(),
  acl_name: z.string().optional(),
});
export type EvidenceRef = z.infer<typeof EvidenceRefSchema>;

export const TopologySchema = z.object({
  nodes: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      label: z.string(),
      data: z.record(z.unknown()),
    }),
  ),
  edges: z.array(
    z.object({
      id: z.string(),
      source: z.string(),
      target: z.string(),
      kind: z.string(),
      confidence: z.enum(['confirmed', 'inferred', 'possible']),
      label: z.string().optional(),
      data: z.record(z.unknown()),
    }),
  ),
});
export type Topology = z.infer<typeof TopologySchema>;

export const PathLocationSchema = z.object({
  device_id: z.string(),
  hostname: z.string(),
  interface: z.string(),
  subnet: z.string(),
  gateway_ip: z.string(),
  evidence: EvidenceRefSchema,
});

export const CandidateEvidenceSchema = z.object({
  type: z.string(),
  confidence: z.string(),
  hostname: z.string(),
  device_id: z.string(),
  acl_name: z.string().optional(),
  action: z.string().optional(),
  entry_text: z.string().optional(),
  prefix: z.string().optional(),
  next_hop: z.string().nullable().optional(),
  applied_on: z
    .array(z.object({ interface: z.string(), direction: z.string() }))
    .optional(),
  explanation: z.string(),
  evidence: EvidenceRefSchema,
});
export type CandidateEvidence = z.infer<typeof CandidateEvidenceSchema>;

export const TraceStepSchema = z.object({
  type: z.string(),
  action: z.string().nullable(),
  detail: z.string(),
  acl_name: z.string().optional(),
  routes: z.array(z.string()).optional(),
  evidence: EvidenceRefSchema.optional(),
});

export const PathResultSchema = z.object({
  query: z.object({
    snapshot_id: z.string(),
    src_ip: z.string(),
    dst_ip: z.string(),
    protocol: z.string(),
    dst_port: z.number().nullable(),
    src_port: z.number().nullable(),
  }),
  src_locations: z.array(PathLocationSchema),
  dst_locations: z.array(PathLocationSchema),
  missing_evidence: z.array(z.string()),
  verdict: z.enum(['permitted', 'denied', 'undeliverable', 'mixed', 'unknown', 'error']),
  verdict_source: z.enum(['batfish', 'none']),
  verdict_explanation: z.string(),
  batfish: z.object({ available: z.boolean(), detail: z.string() }).passthrough(),
  candidate_evidence: z.array(CandidateEvidenceSchema).optional(),
  traces: z
    .array(
      z.object({
        disposition: z.string(),
        hops: z.array(z.object({ node: z.string(), steps: z.array(TraceStepSchema) })),
      }),
    )
    .optional(),
  batfish_parse_warnings: z.array(z.string()).optional(),
});
export type PathResult = z.infer<typeof PathResultSchema>;

export const SemanticChangeSchema = z
  .object({
    hostname: z.string(),
    category: z.string(),
    kind: z.string(),
    object: z.string(),
    detail: z.string(),
    base_evidence_lines: z.array(z.number()),
    target_evidence_lines: z.array(z.number()),
    field: z.string().optional(),
    acl_name: z.string().optional(),
    entry_kind: z.string().optional(),
    prefix: z.string().optional(),
  })
  .passthrough();
export type SemanticChange = z.infer<typeof SemanticChangeSchema>;

export const DiffResultSchema = z.object({
  base_snapshot: z.object({ id: z.string(), name: z.string() }),
  target_snapshot: z.object({ id: z.string(), name: z.string() }),
  devices_added: z.array(z.string()),
  devices_removed: z.array(z.string()),
  devices_changed: z.array(z.string()),
  devices_unchanged: z.array(z.string()),
  device_diffs: z.array(
    z.object({
      hostname: z.string(),
      base_device_id: z.string(),
      target_device_id: z.string(),
      raw_diff: z.array(z.string()),
      changes: z.array(SemanticChangeSchema),
    }),
  ),
  changes: z.array(SemanticChangeSchema),
});
export type DiffResult = z.infer<typeof DiffResultSchema>;

export const SuspectSchema = SemanticChangeSchema.and(
  z.object({
    score: z.number(),
    reasons: z.array(z.string()),
    confidence: z.string(),
  }),
);
export type Suspect = z.infer<typeof SuspectSchema>;

export const SuspectsResultSchema = z.object({
  base_snapshot: z.object({ id: z.string(), name: z.string() }),
  target_snapshot: z.object({ id: z.string(), name: z.string() }),
  query: z.record(z.unknown()),
  total_changes: z.number(),
  suspects: z.array(SuspectSchema),
  note: z.string(),
});
export type SuspectsResult = z.infer<typeof SuspectsResultSchema>;

export const SearchResultSchema = z.object({
  query: z.string(),
  truncated: z.boolean(),
  hits: z.array(
    z.object({
      device_id: z.string(),
      hostname: z.string(),
      line: z.number(),
      text: z.string(),
    }),
  ),
});
export type SearchResult = z.infer<typeof SearchResultSchema>;

export const JobSchema = z.object({
  id: z.string(),
  kind: z.string(),
  status: z.enum(['pending', 'running', 'done', 'failed']),
  created_at: z.string(),
  finished_at: z.string().nullable(),
  result: z.record(z.unknown()).nullable(),
  error: z.string().nullable(),
});
export type Job = z.infer<typeof JobSchema>;

export const HealthSchema = z.object({
  status: z.string(),
  product: z.string(),
  version: z.string(),
  batfish: z.object({ available: z.boolean(), detail: z.string() }).passthrough(),
});
export type Health = z.infer<typeof HealthSchema>;
