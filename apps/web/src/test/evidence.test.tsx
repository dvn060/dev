import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EvidenceLink, evidenceUrl, summarizeLines } from '../components/EvidenceLink';
import { parseLinesParam } from '../pages/ConfigViewerPage';

describe('summarizeLines', () => {
  it('collapses consecutive runs', () => {
    expect(summarizeLines([5, 6, 7, 12])).toBe('5-7, 12');
  });
  it('handles single lines and duplicates', () => {
    expect(summarizeLines([3, 3, 3])).toBe('3');
  });
  it('sorts before summarizing', () => {
    expect(summarizeLines([9, 1, 2])).toBe('1-2, 9');
  });
});

describe('evidenceUrl / parseLinesParam round trip', () => {
  it('produces a URL the config viewer can parse back', () => {
    const url = evidenceUrl('dev1', [10, 11, 12]);
    expect(url).toBe('/devices/dev1/config?lines=10,11,12');
    const parsed = parseLinesParam('10,11,12');
    expect([...parsed].sort((a, b) => a - b)).toEqual([10, 11, 12]);
  });
  it('parses ranges', () => {
    expect([...parseLinesParam('4-6,9')].sort((a, b) => a - b)).toEqual([4, 5, 6, 9]);
  });
  it('ignores garbage safely', () => {
    expect(parseLinesParam('abc,,-')).toEqual(new Set());
    expect(parseLinesParam(null)).toEqual(new Set());
  });
});

describe('EvidenceLink', () => {
  it('renders nothing without lines (no fake evidence)', () => {
    const { container } = render(
      <MemoryRouter>
        <EvidenceLink deviceId="d1" hostname="SW1" lines={[]} />
      </MemoryRouter>,
    );
    expect(container).toBeEmptyDOMElement();
  });
  it('links to the config viewer with line numbers', () => {
    render(
      <MemoryRouter>
        <EvidenceLink deviceId="d1" hostname="SW1" lines={[7, 8]} />
      </MemoryRouter>,
    );
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/devices/d1/config?lines=7,8');
    expect(link).toHaveTextContent('SW1 lines 7-8');
  });
});
