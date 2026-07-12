import { PathResultSchema, TopologySchema } from '../lib/api-schemas';

describe('API schema validation', () => {
  it('accepts a degraded-mode path result', () => {
    const result = PathResultSchema.parse({
      query: {
        snapshot_id: 's1',
        src_ip: '10.0.0.1',
        dst_ip: '10.0.0.2',
        protocol: 'tcp',
        dst_port: 443,
        src_port: null,
      },
      src_locations: [],
      dst_locations: [],
      missing_evidence: ['No imported device has an interface subnet containing source 10.0.0.1.'],
      verdict: 'unknown',
      verdict_source: 'none',
      verdict_explanation: 'Batfish is not available.',
      batfish: { available: false, detail: 'disabled' },
      candidate_evidence: [],
    });
    expect(result.verdict).toBe('unknown');
  });

  it('rejects an invented verdict value', () => {
    expect(() =>
      PathResultSchema.parse({
        query: {
          snapshot_id: 's1',
          src_ip: '10.0.0.1',
          dst_ip: '10.0.0.2',
          protocol: 'tcp',
          dst_port: null,
          src_port: null,
        },
        src_locations: [],
        dst_locations: [],
        missing_evidence: [],
        verdict: 'probably-fine',
        verdict_source: 'none',
        verdict_explanation: '',
        batfish: { available: false, detail: '' },
      }),
    ).toThrow();
  });

  it('requires a valid confidence tier on topology edges', () => {
    expect(() =>
      TopologySchema.parse({
        nodes: [{ id: 'a', type: 'device', label: 'A', data: {} }],
        edges: [
          { id: 'e', source: 'a', target: 'a', kind: 'x', confidence: 'certain', data: {} },
        ],
      }),
    ).toThrow();
  });
});
