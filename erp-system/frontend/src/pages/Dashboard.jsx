import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from 'recharts';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

function Card({ label, value, accent }) {
  return (
    <div className="panel p-5">
      <div className="eyebrow mb-2">{label}</div>
      <div className={`font-mono-num text-2xl font-semibold ${accent || 'text-white'}`}>{value}</div>
    </div>
  );
}

function ManagementDashboard() {
  const [data, setData] = useState(null);
  useEffect(() => { api.get('/dashboard/management').then((r) => setData(r.data)).catch(() => {}); }, []);
  if (!data) return <div className="text-slate-400 text-sm">Loading management overview…</div>;

  const rev = data.revenueAndProfit || {};
  const cashFlow = [...(data.monthlyCashFlow || [])].reverse().map((m) => ({
    month: new Date(m.month).toLocaleDateString(undefined, { month: 'short', year: '2-digit' }),
    collected: Number(m.collected),
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        <Card label="Approved Pipeline Revenue" value={`$${Number(rev.total_revenue_pipeline || 0).toLocaleString()}`} accent="text-accent" />
        <Card label="Approved Pipeline Profit" value={`$${Number(rev.total_profit_pipeline || 0).toLocaleString()}`} accent="text-good" />
        <Card label="Delayed Phases" value={data.delayedPhases?.length || 0} accent="text-bad" />
        <Card label="Active Projects" value={data.projectStatusBreakdown?.reduce((s, p) => s + Number(p.count), 0) || 0} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="panel p-5">
          <div className="eyebrow mb-4">Monthly Cash Collected</div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={cashFlow}>
              <CartesianGrid stroke="#22344A" strokeDasharray="3 3" />
              <XAxis dataKey="month" stroke="#6C93AE" fontSize={11} />
              <YAxis stroke="#6C93AE" fontSize={11} />
              <Tooltip contentStyle={{ background: '#142236', border: '1px solid #22344A' }} />
              <Line type="monotone" dataKey="collected" stroke="#3FA7D6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="panel p-5">
          <div className="eyebrow mb-4">Projects by Status</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.projectStatusBreakdown}>
              <CartesianGrid stroke="#22344A" strokeDasharray="3 3" />
              <XAxis dataKey="status" stroke="#6C93AE" fontSize={9} angle={-20} textAnchor="end" height={60} />
              <YAxis stroke="#6C93AE" fontSize={11} allowDecimals={false} />
              <Tooltip contentStyle={{ background: '#142236', border: '1px solid #22344A' }} />
              <Bar dataKey="count" fill="#E8A33D" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="panel p-5">
        <div className="eyebrow mb-4">Outstanding by Project (Risk)</div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left eyebrow border-b border-line">
              <th className="pb-2">Project</th><th className="pb-2">Status</th>
              <th className="pb-2 text-right">Invoiced</th><th className="pb-2 text-right">Collected</th><th className="pb-2 text-right">Outstanding</th>
            </tr>
          </thead>
          <tbody>
            {data.projectFinancials?.slice(0, 8).map((p) => (
              <tr key={p.project_id} className="border-b border-line/50">
                <td className="py-2 text-white">{p.project_name}</td>
                <td className="py-2"><span className="status-pill text-accent">{p.status}</span></td>
                <td className="py-2 text-right font-mono-num">${Number(p.total_invoiced).toLocaleString()}</td>
                <td className="py-2 text-right font-mono-num text-good">${Number(p.total_collected).toLocaleString()}</td>
                <td className="py-2 text-right font-mono-num text-bad">${Number(p.outstanding).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DepartmentDashboard() {
  const [data, setData] = useState(null);
  useEffect(() => { api.get('/dashboard/department').then((r) => setData(r.data)).catch(() => {}); }, []);
  if (!data) return <div className="text-slate-400 text-sm">Loading department overview…</div>;

  return (
    <div className="space-y-6">
      <div className="panel p-5">
        <div className="eyebrow mb-4">Progress by Project</div>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data.progressByProject}>
            <CartesianGrid stroke="#22344A" strokeDasharray="3 3" />
            <XAxis dataKey="project_name" stroke="#6C93AE" fontSize={9} angle={-20} textAnchor="end" height={60} />
            <YAxis stroke="#6C93AE" fontSize={11} />
            <Tooltip contentStyle={{ background: '#142236', border: '1px solid #22344A' }} />
            <Bar dataKey="avg_progress" fill="#3FA7D6" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="panel p-5">
          <div className="eyebrow mb-3">Recent BOQ Changes</div>
          <ul className="space-y-2 text-sm">
            {data.recentBoqChanges?.map((b) => (
              <li key={b.boq_id} className="flex justify-between border-b border-line/50 pb-2">
                <span className="text-white">{b.project_name} · v{b.version}</span>
                <span className="status-pill text-accent2">{b.change_type || 'initial'}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="panel p-5">
          <div className="eyebrow mb-3">Procurement Status</div>
          <ul className="space-y-2 text-sm">
            {data.procurementStatus?.map((s) => (
              <li key={s.status} className="flex justify-between border-b border-line/50 pb-2">
                <span className="text-white">{s.status}</span>
                <span className="font-mono-num text-accent">{s.count}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function EmployeeDashboard() {
  const [data, setData] = useState(null);
  useEffect(() => { api.get('/dashboard/employee').then((r) => setData(r.data)).catch(() => {}); }, []);
  if (!data) return <div className="text-slate-400 text-sm">Loading your tasks…</div>;

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="panel p-5">
        <div className="eyebrow mb-3">My Active Phases</div>
        {data.myPhases?.length ? (
          <ul className="space-y-2 text-sm">
            {data.myPhases.map((p) => (
              <li key={p.phase_id} className="flex justify-between border-b border-line/50 pb-2">
                <span className="text-white">{p.project_name} · {p.phase_name}</span>
                <span className="font-mono-num text-accent">{p.progress_percent}%</span>
              </li>
            ))}
          </ul>
        ) : <div className="text-slate-500 text-sm">No active phases assigned.</div>}
      </div>
      <div className="panel p-5">
        <div className="eyebrow mb-3">My Pending Approvals</div>
        {data.myPendingApprovals?.length ? (
          <ul className="space-y-2 text-sm">
            {data.myPendingApprovals.map((a) => (
              <li key={a.approval_id} className="flex justify-between border-b border-line/50 pb-2">
                <span className="text-white">{a.entity_type} · {a.entity_id.slice(0, 8)}</span>
                <span className="status-pill text-accent2">pending</span>
              </li>
            ))}
          </ul>
        ) : <div className="text-slate-500 text-sm">Nothing awaiting approval.</div>}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const isManagement = ['management', 'admin'].includes(user?.role);
  const isDepartment = ['project_controller', 'department_manager'].includes(user?.role);

  return (
    <div>
      <div className="mb-6">
        <div className="eyebrow mb-1">Overview</div>
        <h1 className="font-display text-2xl font-semibold text-white">
          {isManagement ? 'Management Dashboard' : isDepartment ? 'Department Dashboard' : 'My Dashboard'}
        </h1>
      </div>
      {isManagement ? <ManagementDashboard /> : isDepartment ? <DepartmentDashboard /> : <EmployeeDashboard />}
    </div>
  );
}
