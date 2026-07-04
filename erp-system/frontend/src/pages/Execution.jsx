import { useEffect, useState } from 'react';
import api from '../api/client';

export default function Execution() {
  const [projects, setProjects] = useState([]);
  const [selected, setSelected] = useState('');
  const [phases, setPhases] = useState([]);

  useEffect(() => { api.get('/projects').then((r) => setProjects(r.data)).catch(() => {}); }, []);

  useEffect(() => {
    if (!selected) return setPhases([]);
    api.get(`/execution/phases/${selected}`).then((r) => setPhases(r.data)).catch(() => {});
  }, [selected]);

  return (
    <div>
      <div className="mb-6">
        <div className="eyebrow mb-1">04 · Internal Execution Only</div>
        <h1 className="font-display text-2xl font-semibold text-white">Execution</h1>
      </div>

      <select value={selected} onChange={(e) => setSelected(e.target.value)}
        className="bg-ink border border-line rounded px-3 py-2 text-sm text-white mb-6">
        <option value="">Select a project…</option>
        {projects.map((p) => <option key={p.project_id} value={p.project_id}>{p.project_code} — {p.project_name}</option>)}
      </select>

      {selected && (
        <div className="panel">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left eyebrow border-b border-line">
                <th className="px-5 py-2">Phase</th><th className="py-2">Site Engineer</th>
                <th className="py-2">Status</th><th className="py-2 pr-5 text-right">Progress</th>
              </tr>
            </thead>
            <tbody>
              {phases.map((ph) => (
                <tr key={ph.phase_id} className="border-b border-line/50">
                  <td className="px-5 py-2 text-white">{ph.phase_name}</td>
                  <td className="py-2 text-slate-300">{ph.site_engineer_name || '—'}</td>
                  <td className="py-2"><span className="status-pill text-accent">{ph.status}</span></td>
                  <td className="py-2 pr-5 text-right font-mono-num text-accent2">{ph.progress_percent}%</td>
                </tr>
              ))}
              {!phases.length && <tr><td colSpan={4} className="px-5 py-6 text-center text-slate-500">No phases defined for this project yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
