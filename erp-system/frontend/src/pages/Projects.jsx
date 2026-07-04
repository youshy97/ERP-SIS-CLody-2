import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';

const STATUS_COLOR = {
  intake: 'text-slate-300', boq_preparation: 'text-accent', management_approval: 'text-accent2',
  execution: 'text-good', closed: 'text-slate-500', cancelled: 'text-bad',
};

export default function Projects() {
  const [projects, setProjects] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState({ projectCode: '', projectName: '', customerId: '', description: '' });
  const [error, setError] = useState('');

  function load() {
    api.get('/projects').then((r) => setProjects(r.data)).catch(() => {});
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/projects', form);
      setShowForm(false);
      setForm({ projectCode: '', projectName: '', customerId: '', description: '' });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not create project');
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="eyebrow mb-1">01 · Root Entity</div>
          <h1 className="font-display text-2xl font-semibold text-white">Projects</h1>
        </div>
        <button onClick={() => setShowForm((s) => !s)} className="bg-accent text-ink text-sm font-semibold rounded px-4 py-2">
          {showForm ? 'Cancel' : '+ New Project'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="panel p-5 mb-6 grid grid-cols-2 gap-4">
          <input placeholder="Project Code (e.g. PRJ-2026-014)" required
            value={form.projectCode} onChange={(e) => setForm({ ...form, projectCode: e.target.value })}
            className="bg-ink border border-line rounded px-3 py-2 text-sm text-white" />
          <input placeholder="Project Name" required
            value={form.projectName} onChange={(e) => setForm({ ...form, projectName: e.target.value })}
            className="bg-ink border border-line rounded px-3 py-2 text-sm text-white" />
          <input placeholder="Customer ID (UUID)" required
            value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })}
            className="bg-ink border border-line rounded px-3 py-2 text-sm text-white col-span-2" />
          <textarea placeholder="Description" value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="bg-ink border border-line rounded px-3 py-2 text-sm text-white col-span-2" rows={2} />
          {error && <div className="text-bad text-xs font-mono col-span-2">{error}</div>}
          <button type="submit" className="bg-accent text-ink text-sm font-semibold rounded px-4 py-2 col-span-2">
            Create Project
          </button>
        </form>
      )}

      <div className="panel">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left eyebrow border-b border-line">
              <th className="px-5 py-3">Code</th><th className="py-3">Name</th><th className="py-3">Customer</th>
              <th className="py-3">Status</th><th className="py-3">PM</th><th className="py-3 pr-5">Received</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.project_id} className="border-b border-line/50 hover:bg-steel/30">
                <td className="px-5 py-3 font-mono-num text-accent">
                  <Link to={`/projects/${p.project_id}`}>{p.project_code}</Link>
                </td>
                <td className="py-3 text-white">{p.project_name}</td>
                <td className="py-3 text-slate-300">{p.customer_name}</td>
                <td className="py-3"><span className={`status-pill ${STATUS_COLOR[p.status] || 'text-slate-300'}`}>{p.status}</span></td>
                <td className="py-3 text-slate-400">{p.project_manager_id ? p.project_manager_id.slice(0, 8) : '—'}</td>
                <td className="py-3 pr-5 text-slate-400 font-mono-num">{p.received_date ? new Date(p.received_date).toLocaleDateString() : '—'}</td>
              </tr>
            ))}
            {!projects.length && (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-slate-500">No projects yet. Create the first one.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
