import { useEffect, useState } from 'react';
import api from '../api/client';

export default function Warehouse() {
  const [grns, setGrns] = useState([]);
  const [stock, setStock] = useState([]);

  useEffect(() => {
    api.get('/warehouse/grn').then((r) => setGrns(r.data)).catch(() => {});
    api.get('/warehouse/stock').then((r) => setStock(r.data)).catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <div className="eyebrow mb-1">03 · Single Central Warehouse</div>
        <h1 className="font-display text-2xl font-semibold text-white">Warehouse</h1>
      </div>

      <div className="panel">
        <div className="eyebrow px-5 pt-4 pb-2">Goods Receipt Notes</div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left eyebrow border-b border-line">
              <th className="px-5 py-2">GRN Code</th><th className="py-2">PO</th><th className="py-2">Qty Received</th><th className="py-2 pr-5">Status</th>
            </tr>
          </thead>
          <tbody>
            {grns.map((g) => (
              <tr key={g.grn_id} className="border-b border-line/50">
                <td className="px-5 py-2 font-mono-num text-accent">{g.grn_code}</td>
                <td className="py-2 text-white">{g.po_code}</td>
                <td className="py-2 font-mono-num">{g.quantity_received}</td>
                <td className="py-2 pr-5"><span className="status-pill text-accent2">{g.status}</span></td>
              </tr>
            ))}
            {!grns.length && <tr><td colSpan={4} className="px-5 py-6 text-center text-slate-500">No GRNs recorded yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <div className="eyebrow px-5 pt-4 pb-2">Stock on Hand</div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left eyebrow border-b border-line">
              <th className="px-5 py-2">Item</th><th className="py-2">Location</th><th className="py-2 pr-5 text-right">Qty Available</th>
            </tr>
          </thead>
          <tbody>
            {stock.map((s) => (
              <tr key={s.stock_id} className="border-b border-line/50">
                <td className="px-5 py-2 text-white">{s.item_description}</td>
                <td className="py-2 text-slate-300">{s.location}</td>
                <td className="py-2 pr-5 text-right font-mono-num text-good">{s.quantity_available}</td>
              </tr>
            ))}
            {!stock.length && <tr><td colSpan={3} className="px-5 py-6 text-center text-slate-500">No stock on hand.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
