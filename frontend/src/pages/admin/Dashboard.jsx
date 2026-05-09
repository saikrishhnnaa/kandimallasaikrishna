import React, { useEffect, useState } from "react";
import { api, formatCurrency, formatDate } from "../../lib/api";
import { Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { TrendingUp, AlertTriangle, Receipt, Wallet } from "lucide-react";

const KPI = ({ label, value, sub, icon: Icon, accent }) => (
  <div className="surface-card p-5" data-testid={`kpi-${label.toLowerCase().replace(/\s+/g, "-")}`}>
    <div className="flex items-start justify-between">
      <div>
        <p className="overline">{label}</p>
        <div className="font-display text-3xl tracking-tighter mt-2">{value}</div>
        {sub && <div className="text-xs text-[var(--text-muted)] mt-1">{sub}</div>}
      </div>
      <div
        className={`w-9 h-9 flex items-center justify-center rounded-md ${
          accent ? "bg-[var(--primary)] text-white" : "bg-black/5 text-[var(--text)]"
        }`}
      >
        <Icon size={18} />
      </div>
    </div>
  </div>
);

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    api.get("/dashboard/stats").then((r) => setStats(r.data)).catch(() => setStats({}));
    api.get("/orders").then((r) => setRecent(r.data.slice(0, 8)));
  }, []);

  if (!stats) return <div className="p-8 overline">Loading…</div>;

  return (
    <div className="p-8 max-w-[1400px] mx-auto" data-testid="admin-dashboard">
      <div className="flex items-end justify-between mb-8">
        <div>
          <p className="overline">Overview</p>
          <h1 className="font-display text-4xl tracking-tighter mt-1">
            Hello, {user.name.split(" ")[0]}.
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Here's how the floor is performing today.
          </p>
        </div>
        <Link
          to="/admin/orders/new"
          className="px-4 py-2.5 bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white rounded-md text-sm font-medium"
          data-testid="dashboard-new-order"
        >
          + New Order
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPI label="Revenue Today" value={formatCurrency(stats.revenue_today)} sub={`${stats.orders_today} orders today`} icon={TrendingUp} accent />
        <KPI label="Total Revenue" value={formatCurrency(stats.total_revenue)} sub={`${stats.invoices_count} invoices`} icon={Receipt} />
        <KPI label="Outstanding" value={formatCurrency(stats.outstanding)} sub="Across all customers" icon={Wallet} />
        <KPI label="Low Stock" value={stats.low_stock?.length || 0} sub="Items at/below threshold" icon={AlertTriangle} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="lg:col-span-2 surface-card p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="overline">Revenue · Last 7 days</p>
            <span className="text-xs font-mono text-[var(--text-muted)]">USD</span>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.revenue_series}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#9C462C" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#9C462C" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#E5E5E0" vertical={false} />
                <XAxis dataKey="date" stroke="#5C5C5C" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#5C5C5C" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: 6, borderColor: "#E5E5E0", fontSize: 12 }} />
                <Area type="monotone" dataKey="revenue" stroke="#9C462C" strokeWidth={2} fill="url(#rev)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="surface-card p-6">
          <p className="overline mb-4">Top Products</p>
          <ul className="space-y-3">
            {(stats.top_products || []).slice(0, 5).map((p, i) => (
              <li key={p.sku} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-6 h-6 bg-[var(--primary-soft)] text-[var(--primary)] text-xs font-mono flex items-center justify-center rounded">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{p.name}</div>
                    <div className="text-xs font-mono text-[var(--text-muted)]">{p.sku} · {p.quantity} units</div>
                  </div>
                </div>
                <div className="text-sm font-mono">{formatCurrency(p.revenue)}</div>
              </li>
            ))}
            {!stats.top_products?.length && <li className="text-sm text-[var(--text-muted)]">No sales yet.</li>}
          </ul>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 surface-card p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="overline">Recent Activity</p>
            <Link to="/admin/orders" className="text-xs text-[var(--primary)] hover:underline">View all →</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--text-muted)] border-b border-[var(--border)]">
                  <th className="py-2 font-medium overline">Number</th>
                  <th className="py-2 font-medium overline">Type</th>
                  <th className="py-2 font-medium overline">Customer</th>
                  <th className="py-2 font-medium overline text-right">Total</th>
                  <th className="py-2 font-medium overline">Date</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((o) => (
                  <tr key={o.id} className="border-b border-[var(--border)] last:border-0 data-row">
                    <td className="py-2.5 font-mono text-xs">
                      <Link to={`/admin/orders/${o.id}`} className="hover:text-[var(--primary)]">{o.number}</Link>
                    </td>
                    <td className="py-2.5"><TypeBadge t={o.type} /></td>
                    <td className="py-2.5">{o.customer_name}</td>
                    <td className="py-2.5 text-right font-mono">{formatCurrency(o.total)}</td>
                    <td className="py-2.5 text-[var(--text-muted)]">{formatDate(o.created_at)}</td>
                  </tr>
                ))}
                {!recent.length && (
                  <tr><td colSpan="5" className="py-6 text-center text-[var(--text-muted)]">No activity yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="surface-card p-6">
          <p className="overline mb-4">Agent Leaderboard</p>
          <ul className="space-y-3">
            {(stats.agents || []).slice(0, 6).map((a, i) => (
              <li key={a.id} className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-7 h-7 bg-black text-white text-xs font-display flex items-center justify-center rounded-full">
                    {a.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{a.name}</div>
                    <div className="text-xs text-[var(--text-muted)]">{a.orders} orders</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-mono">{formatCurrency(a.revenue)}</div>
                  <div className="text-[10px] text-[var(--text-muted)]">+{formatCurrency(a.commission)} comm.</div>
                </div>
              </li>
            ))}
            {!stats.agents?.length && <li className="text-sm text-[var(--text-muted)]">No agents yet.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}

function TypeBadge({ t }) {
  const map = {
    quote: "bg-black/5 text-[var(--text)]",
    order: "bg-[var(--primary-soft)] text-[var(--primary)]",
    invoice: "bg-[var(--success)]/10 text-[var(--success)]",
  };
  return (
    <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded ${map[t] || ""}`}>{t}</span>
  );
}
