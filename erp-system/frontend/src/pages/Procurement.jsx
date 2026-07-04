import { useEffect, useState } from 'react';
import api from '../api/client';

export default function Procurement() {
  const [prs, setPrs] = useState([]);
  const [pos, setPos] = useState([]);

  useEffect(() => {
    api.get('/procurement/pr').then((r) => setPrs(r.data)).catch(() => {});
    api.get('/procurement/po').then((r) => setPos(r.data)).catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <div className="eyebrow mb-1">02 · Local + International</div>
        <h1 className="font-display text-2xl font-semibold text-white">Procurement</h1>
      </div>

      <div className="panel">
        <div className="eyebrow px-5 pt-4 pb-2">Purchase Requests</div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left eyebrow border-b border-line">
              <th className="px-5 py-2">PR Code</th><th className="py-2">Item</th><th className="py-2">Qty</th><th className="py-2 pr-5">Status</th>
            </tr>
          </thead>
          <tbody>
            {prs.map((pr) => (
              <tr key={pr.pr_id} className="border-b border-line/50">
                <td className="px-5 py-2 font-mono-num text-accent">{pr.pr_code}</td>
                <td className="py-2 text-white">{pr.item_description}</td>
                <td className="py-2 font-mono-num">{pr.quantity_requested}</td>
                <td className="py-2 pr-5"><span className="status-pill text-accent2">{pr.status}</span></td>
              </tr>
            ))}
            {!prs.length && <tr><td colSpan={4} className="px-5 py-6 text-center text-slate-500">No purchase requests yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <div className="eyebrow px-5 pt-4 pb-2">Purchase Orders</div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left eyebrow border-b border-line">
              <th className="px-5 py-2">PO Code</th><th className="py-2">Supplier</th><th className="py-2">Type</th>
              <th className="py-2 text-right">Value</th><th className="py-2 pr-5">Status</th>
            </tr>
          </thead>
          <tbody>
            {pos.map((po) => (
              <tr key={po.po_id} className="border-b border-line/50">
                <td className="px-5 py-2 font-mono-num text-accent">{po.po_code}</td>
                <td className="py-2 text-white">{po.supplier_name}</td>
                <td className="py-2 text-slate-300">{po.po_type}</td>
                <td className="py-2 text-right font-mono-num">${Number(po.total_value).toLocaleString()}</td>
                <td className="py-2 pr-5"><span className="status-pill text-good">{po.status}</span></td>
              </tr>
            ))}
            {!pos.length && <tr><td colSpan={5} className="px-5 py-6 text-center text-slate-500">No purchase orders yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
