import { useQuery } from '@tanstack/react-query';
import { ArrowLeftRight, Camera, ChevronRight, Route as RouteIcon, Upload } from 'lucide-react';
import { Link, NavLink, Outlet, useParams } from 'react-router-dom';
import { clsx } from 'clsx';
import { api } from '../lib/api';
import { ErrorNote, Spinner } from '../components/ui';

const NAV = [
  { to: 'snapshots', label: 'Snapshots', icon: Camera },
  { to: 'imports', label: 'Imports', icon: Upload },
  { to: 'path', label: 'Path analysis', icon: RouteIcon },
  { to: 'compare', label: 'Compare & root cause', icon: ArrowLeftRight },
];

export function WorkspaceLayout() {
  const { workspaceId = '' } = useParams();
  const workspace = useQuery({
    queryKey: ['workspace', workspaceId],
    queryFn: () => api.getWorkspace(workspaceId),
  });

  if (workspace.isLoading) return <Spinner label="Loading workspace…" />;
  if (workspace.isError) return <ErrorNote error={workspace.error} />;

  return (
    <div className="space-y-4">
      <nav className="flex items-center gap-1 text-sm text-slate-500">
        <Link to="/" className="hover:text-slate-900">
          Workspaces
        </Link>
        <ChevronRight size={14} aria-hidden />
        <span className="font-medium text-slate-900">{workspace.data?.name}</span>
      </nav>
      <div className="flex gap-5">
        <aside className="w-48 shrink-0">
          <ul className="space-y-1">
            {NAV.map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  className={({ isActive }) =>
                    clsx(
                      'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm',
                      isActive
                        ? 'bg-slate-900 font-medium text-white'
                        : 'text-slate-600 hover:bg-slate-100',
                    )
                  }
                >
                  <Icon size={14} aria-hidden />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </aside>
        <section className="min-w-0 flex-1">
          <Outlet context={{ workspaceId }} />
        </section>
      </div>
    </div>
  );
}
