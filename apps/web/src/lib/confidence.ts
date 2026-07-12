/**
 * Confidence-tier presentation. One source of truth for how the UI renders
 * the epistemic status of every statement (architecture principle 10).
 */
export type Confidence = 'confirmed' | 'inferred' | 'possible';

export const CONFIDENCE_META: Record<
  Confidence,
  { label: string; className: string; description: string }
> = {
  confirmed: {
    label: 'Confirmed',
    className: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    description: 'Stated directly by configuration lines (evidence attached).',
  },
  inferred: {
    label: 'Inferred',
    className: 'bg-sky-100 text-sky-800 border-sky-300',
    description: 'Deduced from configuration facts; not literally stated.',
  },
  possible: {
    label: 'Possible',
    className: 'bg-amber-100 text-amber-800 border-amber-300',
    description: 'A hint (e.g. an interface description). May be stale or wrong.',
  },
};

export type Verdict = 'permitted' | 'denied' | 'undeliverable' | 'mixed' | 'unknown' | 'error';

export const VERDICT_META: Record<
  Verdict,
  { label: string; className: string }
> = {
  permitted: { label: 'Permitted', className: 'bg-emerald-600 text-white' },
  denied: { label: 'Denied', className: 'bg-red-600 text-white' },
  undeliverable: { label: 'Undeliverable', className: 'bg-orange-600 text-white' },
  mixed: { label: 'Mixed results', className: 'bg-violet-600 text-white' },
  unknown: { label: 'Unknown', className: 'bg-slate-500 text-white' },
  error: { label: 'Analysis error', className: 'bg-rose-700 text-white' },
};

export function completenessTone(score: number): string {
  if (score >= 0.9) return 'text-emerald-700';
  if (score >= 0.7) return 'text-amber-700';
  return 'text-red-700';
}
