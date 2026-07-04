import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api/client';

export default function ProjectDetail() {
  const { id } = useParams();
  const [project, setProject] = useState(null);

  useEffect(() => { api.get(`/projects/${id}`).then((r) => setProject(r.data)).catch(() => {}); }, [id]);

  if (!project) return <div className="text-slate-400 text-sm">Loading project…</div>;

  return (
    <div>
      <div className="mb-6">
        <div className="eyebrow mb-1">{project.project_code}</div>
        <h1 className="font-display text-2xl font-semibold text-white">{project.project_name}</h1>
        <span className="status-pill text-accent mt-2 inline-block">{project.status}</span>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="panel p-5">
          <div className="eyebrow mb-1">Customer</div>
          <div className="text-white text-sm">{project.customer_name}</div>
        </div>
        <div className="panel p-5">
          <div className="eyebrow mb-1">Contract Value</div>
          <div className="font-mono-num text-white text-sm">{project.contract_value ? `$${Number(project.contract_value).toLocaleString()}` : '—'}</div>
        </div>
        <div className="panel p-5">
          <div className="eyebrow mb-1">Exchange Rate</div>
          <div className="font-mono-num text-white text-sm">{project.exchange_rate}</div>
        </div>
      </div>

      <div className="panel p-5 mb-6">
        <div className="eyebrow mb-3">BOQ Versions</div>
        {project.boqVersions?.length ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left eyebrow border-b border-line">
                <th className="pb-2">Version</th><th className="pb-2">Status</th>
                <th className="pb-2 text-right">Cost</th><th className="pb-2 text-right">Selling</th><th className="pb-2 text-right">Profit</th>
              </tr>
            </thead>
            <tbody>
              {project.boqVersions.map((b) => (
                <tr key={b.boq_id} className="border-b border-line/50">
                  <td className="py-2 text-white font-mono-num">V{b.version}</td>
                  <td className="py-2"><span className="status-pill text-accent2">{b.status}</span></td>
                  <td className="py-2 text-right font-mono-num">${Number(b.total_cost).toLocaleString()}</td>
                  <td className="py-2 text-right font-mono-num">${Number(b.total_selling).toLocaleString()}</td>
                  <td className="py-2 text-right font-mono-num text-good">${Number(b.profit).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div className="text-slate-500 text-sm">No BOQ prepared yet.</div>}
      </div>

      <div className="panel p-5">
        <div className="eyebrow mb-3">Execution Phases</div>
        {project.executionPhases?.length ? (
          <ul className="space-y-2 text-sm">
            {project.executionPhases.map((p) => (
              <li key={p.phase_id} className="flex justify-between border-b border-line/50 pb-2">
                <span className="text-white">{p.phase_name}</span>
                <span className="flex items-center gap-3">
                  <span className="status-pill text-accent">{p.status}</span>
                  <span className="font-mono-num text-accent2">{p.progress_percent}%</span>
                </span>
              </li>
            ))}
          </ul>
        ) : <div className="text-slate-500 text-sm">No execution phases defined yet.</div>}
      </div>
    </div>
  );
}
