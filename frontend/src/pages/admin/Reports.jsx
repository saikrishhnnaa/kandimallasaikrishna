import React, { useEffect, useState } from "react";
import { api, formatCurrency } from "../../lib/api";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

export default function Reports() {
  const [stats, setStats] = useState(null);

  useEffect(() => { api.get("/dashboard/stats").then((r) => setStats(r.data)); }, []);

  if (!stats) return <div className="p-8 overline">Loading…</div>;

  return (
    <div className="p-8 max-w-[1400px] mx-auto" data-testid="reports-page">
      <p className="overline">Insights</p>
      <h1 className="font-display text-4xl tracking-tighter mt-1 mb-8">Reports</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div className="surface-card p-6">
          <p className="overline mb-4">Top Products by Revenue</p>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.top_products} layout="vertical" margin={{ left: 24 }}>
                <CartesianGrid stroke="#E5E5E0" horizontal={false}/>
                <XAxis type="number" stroke="#5C5C5C" fontSize={11} tickLine={false} axisLine={false}/>
                <YAxis type="category" dataKey="name" stroke="#5C5C5C" fontSize={11} tickLine={false} axisLine={false} width={120}/>
                <Tooltip formatter={(v) => formatCurrency(v)} contentStyle={{ borderRadius: 6, borderColor: "#E5E5E0", fontSize: 12 }}/>
                <Bar dataKey="revenue" fill="#9C462C" radius={[0, 4, 4, 0]}/>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="surface-card p-6">
          <p className="overline mb-4">Sales Agents · Revenue & Commission</p>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.agents}>
                <CartesianGrid stroke="#E5E5E0" vertical={false}/>
                <XAxis dataKey="name" stroke="#5C5C5C" fontSize={11} tickLine={false} axisLine={false}/>
                <YAxis stroke="#5C5C5C" fontSize={11} tickLine={false} axisLine={false}/>
                <Tooltip formatter={(v) => formatCurrency(v)} contentStyle={{ borderRadius: 6, borderColor: "#E5E5E0", fontSize: 12 }}/>
                <Bar dataKey="revenue" fill="#0A0A0A" radius={[4, 4, 0, 0]}/>
                <Bar dataKey="commission" fill="#9C462C" radius={[4, 4, 0, 0]}/>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="surface-card p-6">
        <p className="overline mb-3">Low Stock Alerts</p>
        {stats.low_stock?.length ? (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[var(--text-muted)]">
              {["SKU", "Name", "Stock", "Threshold"].map((h) => <th key={h} className="py-2 overline font-medium">{h}</th>)}
            </tr></thead>
            <tbody>
              {stats.low_stock.map((p) => (
                <tr key={p.id} className="border-t border-[var(--border)]">
                  <td className="py-2 font-mono text-xs">{p.sku}</td>
                  <td className="py-2">{p.name}</td>
                  <td className="py-2 font-mono text-[var(--danger)]">{p.stock}</td>
                  <td className="py-2 font-mono">{p.low_stock_threshold}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div className="text-sm text-[var(--text-muted)]">All stock levels are healthy.</div>}
      </div>
    </div>
  );
}
