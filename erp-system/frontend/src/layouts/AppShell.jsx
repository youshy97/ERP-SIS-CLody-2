import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NAV = [
  { to: '/dashboard', label: 'Dashboard', code: '00' },
  { to: '/projects', label: 'Projects', code: '01' },
  { to: '/procurement', label: 'Procurement', code: '02' },
  { to: '/warehouse', label: 'Warehouse', code: '03' },
  { to: '/execution', label: 'Execution', code: '04' },
  { to: '/finance', label: 'Finance', code: '05' },
];

export default function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex bg-ink bg-blueprint-grid bg-grid-md">
      <aside className="w-60 shrink-0 border-r border-line flex flex-col">
        <div className="px-5 py-6 border-b border-line">
          <div className="eyebrow">Nexus ERP</div>
          <div className="font-display text-lg font-semibold tracking-tight text-white">
            Project Lifecycle
          </div>
        </div>
        <nav className="flex-1 py-4">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-5 py-2.5 text-sm border-l-2 transition-colors ${
                  isActive
                    ? 'border-accent text-white bg-steel/60'
                    : 'border-transparent text-slate-300/70 hover:text-white hover:bg-steel/30'
                }`
              }
            >
              <span className="font-mono text-[10px] text-accent/70">{item.code}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-5 py-4 border-t border-line">
          <div className="text-sm text-white">{user?.name}</div>
          <div className="eyebrow mb-2">{user?.role?.replace('_', ' ')}</div>
          <button
            onClick={() => { logout(); navigate('/login'); }}
            className="text-xs text-slate-400 hover:text-accent2 transition-colors"
          >
            Sign out →
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
