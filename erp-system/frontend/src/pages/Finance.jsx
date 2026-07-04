import { useEffect, useState } from 'react';
import api from '../api/client';

export default function Finance() {
  const [projects, setProjects] = useState([]);
  const [selected, setSelected] = useState('');
  const [invoices, setInvoices] = useState([]);
  const [schedule, setSchedule] = useState([]);

  useEffect(() => { api.get('/projects').then((r) => setProjects(r.data)).catch(() => {}); }, []);

  useEffect(() => {
    if (!selected) { setInvoices([]); setSchedule([]); return; }
    api.get(`/finance/invoices/${selected}`).then((r) => setInvoices(r.data)).catch(() => {});
    api.get(`/finance/schedule/${selected}`).then((r) => setSchedule(r.data)).catch(() => {});
  }, [selected]);

  return (
    <div>
      <div className="mb-6">
        <div className="eyebrow mb-1">05 · Percentage-Based Payment Plans</div>
        <h1 className="font-display text-2xl font-semibold text-white">Finance</h1>
      </div>

      <select value={selected} onChange={(e) => setSelected(e.target.value)}
        className="bg-ink border border-line rounded px-3 py-2 text-sm text-white mb-6">
        <option value="">Select a project…</option>
        {projects.map((p) => <option key={p.project_id} value={p.project_id}>{p.project_code} — {p.project_name}</option>)}
      </select>

      {selected && (
        <div className="space-y-6">
          <div className="panel">
            <div className="eyebrow px-5 pt-4 pb-2">Payment Schedule (% of Contract)</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left eyebrow border-b border-line">
                  <th className="px-5 py-2">Milestone</th><th className="py-2">Due</th><th className="py-2 pr-5 text-right">%</th>
                </tr>
              </thead>
              <tbody>
                {schedule.map((s) => (
                  <tr key={s.schedule_id} className="border-b border-line/50">
                    <td className="px-5 py-2 text-white">{s.milestone_name}</td>
                    <td className="py-2 text-slate-300">{s.due_date ? new Date(s.due_date).toLocaleDateString() : '—'}</td>
                    <td className="py-2 pr-5 text-right font-mono-num text-accent">{s.percentage}%</td>
                  </tr>
                ))}
                {!schedule.length && <tr><td colSpan={3} className="px-5 py-6 text-center text-slate-500">No payment schedule defined.</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="panel">
            <div className="eyebrow px-5 pt-4 pb-2">Invoices</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left eyebrow border-b border-line">
                  <th className="px-5 py-2">Invoice</th><th className="py-2 text-right">Amount</th>
                  <th className="py-2 text-right">Paid</th><th className="py-2 pr-5">Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.invoice_id} className="border-b border-line/50">
                    <td className="px-5 py-2 font-mono-num text-accent">{inv.invoice_code}</td>
                    <td className="py-2 text-right font-mono-num">${Number(inv.amount).toLocaleString()}</td>
                    <td className="py-2 text-right font-mono-num text-good">${Number(inv.amount_paid).toLocaleString()}</td>
                    <td className="py-2 pr-5"><span className="status-pill text-accent2">{inv.status}</span></td>
                  </tr>
                ))}
                {!invoices.length && <tr><td colSpan={4} className="px-5 py-6 text-center text-slate-500">No invoices raised yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
