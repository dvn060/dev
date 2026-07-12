/**
 * Topology presentation: React Flow rendering with automatic ELK layout.
 * Edge styling encodes the confidence tier (confirmed / inferred / possible);
 * clicking an edge shows its explanation and evidence links.
 */
import { useQuery } from '@tanstack/react-query';
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import ELK from 'elkjs/lib/elk.bundled.js';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import type { Topology } from '../lib/api-schemas';
import { CONFIDENCE_META, type Confidence } from '../lib/confidence';
import { EvidenceLink } from './EvidenceLink';
import { Card, ConfidenceBadge, ErrorNote, Spinner } from './ui';

const elk = new ELK();

type LayoutedGraph = { nodes: Node[]; edges: Edge[] };

const EDGE_STYLE: Record<Confidence, { stroke: string; dash?: string }> = {
  confirmed: { stroke: '#059669' },
  inferred: { stroke: '#0284c7', dash: '6 3' },
  possible: { stroke: '#d97706', dash: '2 4' },
};

function DeviceNode({ data }: NodeProps) {
  const d = data as { label: string; device_id: string; os_family: string; management_ip: string | null };
  return (
    <div className="rounded-md border-2 border-slate-700 bg-white px-3 py-2 shadow-sm">
      <Handle type="target" position={Position.Top} className="opacity-0" />
      <Link to={`/devices/${d.device_id}`} className="block">
        <div className="text-xs font-semibold text-slate-900">{d.label}</div>
        <div className="font-mono text-[10px] text-slate-500">
          {d.os_family}
          {d.management_ip ? ` · ${d.management_ip}` : ''}
        </div>
      </Link>
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  );
}

function NetworkNode({ data }: NodeProps) {
  const d = data as { label: string };
  return (
    <div className="rounded-full border border-slate-400 bg-slate-100 px-3 py-1.5">
      <Handle type="target" position={Position.Top} className="opacity-0" />
      <div className="font-mono text-[10px] text-slate-600">{d.label}</div>
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  );
}

const nodeTypes = { device: DeviceNode, network: NetworkNode };

async function layout(topology: Topology): Promise<LayoutedGraph> {
  const elkGraph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.spacing.nodeNode': '60',
      'elk.layered.spacing.nodeNodeBetweenLayers': '90',
    },
    children: topology.nodes.map((n) => ({
      id: n.id,
      width: n.type === 'device' ? 190 : 130,
      height: n.type === 'device' ? 56 : 32,
    })),
    edges: topology.edges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  };
  const result = await elk.layout(elkGraph);
  const positions = new Map(
    (result.children ?? []).map((c) => [c.id, { x: c.x ?? 0, y: c.y ?? 0 }]),
  );
  return {
    nodes: topology.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: positions.get(n.id) ?? { x: 0, y: 0 },
      data: { ...n.data, label: n.label },
    })),
    edges: topology.edges.map((e) => {
      const style = EDGE_STYLE[e.confidence];
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label,
        labelStyle: { fontSize: 9, fill: '#64748b' },
        style: {
          stroke: style.stroke,
          strokeWidth: 1.5,
          strokeDasharray: style.dash,
        },
        data: { ...e.data, confidence: e.confidence, kind: e.kind },
      };
    }),
  };
}

export function TopologyView({ snapshotId }: { snapshotId: string }) {
  const topology = useQuery({
    queryKey: ['topology', snapshotId],
    queryFn: () => api.getTopology(snapshotId),
  });
  const [graph, setGraph] = useState<LayoutedGraph | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (topology.data) {
      void layout(topology.data).then((g) => {
        if (!cancelled) setGraph(g);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [topology.data]);

  const legend = useMemo(
    () =>
      (Object.keys(CONFIDENCE_META) as Confidence[]).map((c) => (
        <span key={c} className="flex items-center gap-1.5">
          <svg width="24" height="6" aria-hidden>
            <line
              x1="0"
              y1="3"
              x2="24"
              y2="3"
              stroke={EDGE_STYLE[c].stroke}
              strokeWidth="2"
              strokeDasharray={EDGE_STYLE[c].dash}
            />
          </svg>
          <span className="text-xs text-slate-600" title={CONFIDENCE_META[c].description}>
            {CONFIDENCE_META[c].label}
          </span>
        </span>
      )),
    [],
  );

  if (topology.isLoading) return <Spinner label="Deriving topology…" />;
  if (topology.isError) return <ErrorNote error={topology.error} />;
  if (!graph) return <Spinner label="Computing layout…" />;

  const edgeData = selectedEdge?.data as
    | {
        confidence: Confidence;
        kind: string;
        explanation?: string;
        evidence?: { device_id: string; hostname: string; lines?: number[] }[];
        subnet?: string;
        endpoints?: { device_id: string; hostname: string; interface: string; address: string; evidence_lines: number[] }[];
      }
    | undefined;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <span className="text-xs font-medium text-slate-500">Relationship confidence:</span>
        {legend}
      </div>
      <Card className="h-[520px] overflow-hidden">
        <ReactFlow
          nodes={graph.nodes}
          edges={graph.edges}
          nodeTypes={nodeTypes}
          onEdgeClick={(_, edge) => setSelectedEdge(edge)}
          onPaneClick={() => setSelectedEdge(null)}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <Controls showInteractive={false} />
        </ReactFlow>
      </Card>
      {selectedEdge && edgeData && (
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <ConfidenceBadge confidence={edgeData.confidence} />
            <span className="text-sm font-medium text-slate-800">
              {edgeData.kind.replaceAll('_', ' ')}
            </span>
          </div>
          {edgeData.explanation && (
            <p className="mt-2 text-sm text-slate-600">{edgeData.explanation}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {edgeData.evidence?.map((ev, i) => (
              <EvidenceLink
                key={i}
                deviceId={ev.device_id}
                hostname={ev.hostname}
                lines={ev.lines ?? []}
              />
            ))}
            {edgeData.endpoints?.map((ep, i) => (
              <EvidenceLink
                key={`ep-${i}`}
                deviceId={ep.device_id}
                hostname={`${ep.hostname} ${ep.interface} (${ep.address})`}
                lines={ep.evidence_lines}
              />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
