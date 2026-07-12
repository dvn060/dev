import { useQuery } from '@tanstack/react-query';
import { ChevronRight, FileCode } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { completenessTone } from '../lib/confidence';
import { EvidenceLink } from '../components/EvidenceLink';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ErrorNote,
  Spinner,
  Table,
  Tabs,
  Td,
  Th,
} from '../components/ui';

export function DevicePage() {
  const { deviceId = '' } = useParams();
  const [tab, setTab] = useState('interfaces');
  const device = useQuery({
    queryKey: ['device', deviceId],
    queryFn: () => api.getDevice(deviceId),
  });

  if (device.isLoading) return <Spinner label="Loading device…" />;
  if (device.isError) return <ErrorNote error={device.error} />;
  const d = device.data!;

  return (
    <div className="space-y-4">
      <nav className="flex items-center gap-1 text-sm text-slate-500">
        <Link to={`/snapshots/${d.snapshot_id}`} className="hover:text-slate-900">
          Snapshot
        </Link>
        <ChevronRight size={14} aria-hidden />
        <span className="font-medium text-slate-900">{d.hostname}</span>
      </nav>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold">{d.hostname}</h1>
        <Badge className="border-slate-300 bg-slate-50 text-slate-700">{d.vendor}</Badge>
        <Badge className="border-slate-300 bg-slate-50 text-slate-700">{d.os_family}</Badge>
        {d.management_ip && (
          <span className="font-mono text-xs text-slate-500">{d.management_ip}</span>
        )}
        <span className={`text-sm font-medium ${completenessTone(d.completeness_score)}`}>
          {(d.completeness_score * 100).toFixed(0)}% parsed
        </span>
        <Link to={`/devices/${d.id}/config`}>
          <Button variant="outline">
            <FileCode size={14} aria-hidden /> View configuration
          </Button>
        </Link>
      </div>

      {d.parse_warnings.length > 0 && (
        <Card>
          <CardHeader
            title={`Parser warnings (${d.parse_warnings.length})`}
            subtitle="Configuration content the parser recognized but could not fully model. These lines are excluded from structured answers — never silently interpreted."
          />
          <ul className="max-h-48 space-y-1 overflow-y-auto p-4 font-mono text-xs">
            {d.parse_warnings.map((w, i) => (
              <li key={i} className="flex gap-2">
                <Link
                  to={`/devices/${d.id}/config?lines=${w.line}`}
                  className="shrink-0 text-sky-700 hover:underline"
                >
                  L{w.line}
                </Link>
                <span className="text-amber-800">{w.message}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Tabs
        tabs={[
          { id: 'interfaces', label: `Interfaces (${d.interfaces.length})` },
          { id: 'vlans', label: `VLANs (${d.vlans.length})` },
          { id: 'routes', label: `Routes (${d.routes.length})` },
          { id: 'acls', label: `ACLs (${d.acls.length})` },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'interfaces' && (
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Description</Th>
                <Th>Role</Th>
                <Th>State</Th>
                <Th>Addressing / VLANs</Th>
                <Th>ACLs</Th>
                <Th>Evidence</Th>
              </tr>
            </thead>
            <tbody>
              {d.interfaces.map((i) => (
                <tr key={i.id}>
                  <Td className="font-mono text-xs font-medium">{i.name}</Td>
                  <Td className="max-w-56 truncate text-xs">{i.description || '—'}</Td>
                  <Td>
                    <Badge className="border-slate-300 bg-slate-50 text-slate-700">
                      {i.layer_role === 'l3' ? 'Layer 3' : i.layer_role === 'l2' ? 'Layer 2' : 'unknown'}
                    </Badge>
                  </Td>
                  <Td>
                    {i.admin_state === 'shutdown' ? (
                      <Badge className="border-red-300 bg-red-50 text-red-800">shutdown</Badge>
                    ) : (
                      <Badge className="border-emerald-300 bg-emerald-50 text-emerald-800">up</Badge>
                    )}
                  </Td>
                  <Td className="font-mono text-xs">
                    {i.ip_addresses.map((ip) => `${ip.address}/${ip.prefix_length}`).join(', ')}
                    {i.switchport_mode === 'access' && `access vlan ${i.access_vlan ?? '?'}`}
                    {i.switchport_mode === 'trunk' &&
                      `trunk${i.native_vlan ? ` native ${i.native_vlan}` : ''}${i.trunk_allowed_vlans ? ` allowed ${i.trunk_allowed_vlans}` : ''}`}
                    {!i.ip_addresses.length && !i.switchport_mode && '—'}
                  </Td>
                  <Td className="font-mono text-xs">
                    {i.acl_in && <div>in: {i.acl_in}</div>}
                    {i.acl_out && <div>out: {i.acl_out}</div>}
                    {!i.acl_in && !i.acl_out && '—'}
                  </Td>
                  <Td>
                    <EvidenceLink deviceId={d.id} lines={i.evidence_lines} compact />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {tab === 'vlans' && (
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>VLAN</Th>
                <Th>Name</Th>
                <Th>Evidence</Th>
              </tr>
            </thead>
            <tbody>
              {d.vlans.map((v) => (
                <tr key={v.id}>
                  <Td className="font-mono text-xs">{v.vlan_id}</Td>
                  <Td>{v.name ?? '—'}</Td>
                  <Td>
                    <EvidenceLink deviceId={d.id} lines={v.evidence_lines} compact />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {tab === 'routes' && (
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>Prefix</Th>
                <Th>Next hop</Th>
                <Th>VRF</Th>
                <Th>AD</Th>
                <Th>Name</Th>
                <Th>Evidence</Th>
              </tr>
            </thead>
            <tbody>
              {d.routes.map((r) => (
                <tr key={r.id}>
                  <Td className="font-mono text-xs">{r.prefix}</Td>
                  <Td className="font-mono text-xs">{r.next_hop_ip ?? r.next_hop_interface ?? '—'}</Td>
                  <Td>{r.vrf ?? '—'}</Td>
                  <Td>{r.admin_distance ?? '—'}</Td>
                  <Td className="text-xs">{r.name ?? '—'}</Td>
                  <Td>
                    <EvidenceLink deviceId={d.id} lines={r.evidence_lines} compact />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {tab === 'acls' && (
        <div className="space-y-4">
          {d.acls.map((acl) => (
            <Card key={acl.id}>
              <CardHeader
                title={
                  <span className="font-mono">
                    {acl.name} <span className="font-sans text-xs text-slate-400">({acl.kind})</span>
                  </span>
                }
              />
              <ul className="divide-y divide-slate-50 p-2 font-mono text-xs">
                {acl.entries.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 px-2 py-1">
                    <Link
                      to={`/devices/${d.id}/config?lines=${e.line_number}`}
                      className="w-12 shrink-0 text-sky-700 hover:underline"
                    >
                      L{e.line_number}
                    </Link>
                    <span
                      className={
                        e.action === 'permit'
                          ? 'w-20 shrink-0 text-emerald-700'
                          : e.action === 'deny'
                            ? 'w-20 shrink-0 text-red-700'
                            : e.action === 'unsupported'
                              ? 'w-20 shrink-0 text-amber-700'
                              : 'w-20 shrink-0 text-slate-400'
                      }
                    >
                      {e.action}
                    </span>
                    <span className="truncate text-slate-800">{e.text}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
