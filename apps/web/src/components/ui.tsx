/**
 * Small shadcn-style component set. Kept hand-rolled and dependency-light so
 * the app stays fully offline-buildable; visual language follows shadcn/ui.
 */
import { clsx } from 'clsx';
import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { CONFIDENCE_META, type Confidence } from '../lib/confidence';

export function Button({
  variant = 'default',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'outline' | 'ghost' | 'destructive';
}) {
  return (
    <button
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
        'disabled:pointer-events-none disabled:opacity-50',
        variant === 'default' && 'bg-slate-900 text-white hover:bg-slate-700',
        variant === 'outline' &&
          'border border-slate-300 bg-white text-slate-900 hover:bg-slate-100',
        variant === 'ghost' && 'text-slate-700 hover:bg-slate-100',
        variant === 'destructive' && 'bg-red-600 text-white hover:bg-red-500',
        className,
      )}
      {...props}
    />
  );
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx('rounded-lg border border-slate-200 bg-white shadow-sm', className)}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between border-b border-slate-100 px-4 py-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Badge({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        className,
      )}
      {...props}
    />
  );
}

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  const meta = CONFIDENCE_META[confidence];
  return (
    <Badge className={meta.className} title={meta.description}>
      {meta.label}
    </Badge>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx(
        'w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm',
        'placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500',
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={clsx(
        'w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm',
        'focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500',
        className,
      )}
      {...props}
    />
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <label className="mb-1 block text-xs font-medium text-slate-600">{children}</label>;
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 p-4 text-sm text-slate-500" role="status">
      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
      {label ?? 'Loading…'}
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
      {message}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center">
      <p className="text-sm font-medium text-slate-600">{title}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

export function Th({ children }: { children?: ReactNode }) {
  return (
    <th className="border-b border-slate-200 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
      {children}
    </th>
  );
}

export function Td({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return <td className={clsx('border-b border-slate-100 px-3 py-2 align-top', className)}>{children}</td>;
}

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex gap-1 border-b border-slate-200">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={clsx(
            'px-3 py-2 text-sm font-medium',
            active === tab.id
              ? 'border-b-2 border-slate-900 text-slate-900'
              : 'text-slate-500 hover:text-slate-800',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
