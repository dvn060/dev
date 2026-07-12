import { useQuery } from '@tanstack/react-query';
import { Network } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { PRODUCT_NAME } from '../lib/branding';
import { Badge } from './ui';

export function AppShell({ children }: { children: ReactNode }) {
  const health = useQuery({ queryKey: ['health'], queryFn: api.health, refetchInterval: 60_000 });
  const batfish = health.data?.batfish;

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-2.5">
          <Link to="/" className="flex items-center gap-2 text-slate-900">
            <Network size={20} aria-hidden />
            <span className="text-sm font-semibold tracking-tight">{PRODUCT_NAME}</span>
            <span className="text-xs text-slate-400">local-first · read-only</span>
          </Link>
          <div className="flex items-center gap-2">
            {health.data && (
              <Badge
                className={
                  batfish?.available
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                    : 'border-amber-300 bg-amber-50 text-amber-800'
                }
                title={batfish?.detail}
              >
                {batfish?.available ? 'Analysis engine: ready' : 'Analysis engine: unavailable'}
              </Badge>
            )}
            {health.isError && (
              <Badge className="border-red-300 bg-red-50 text-red-800">Backend unreachable</Badge>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5">{children}</main>
    </div>
  );
}
