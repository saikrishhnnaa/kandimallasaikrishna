import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatCurrency, formatDate } from "../../lib/api";
import { TrendingUp, Wallet, ShoppingBag, ArrowRight } from "lucide-react";

export default function AgentHome() {
  const [stats, setStats] = useState(null);
  useEffect(() => { api.get("/agent/stats").then((r) => setStats(r.data)); }, []);

  if (!stats) return <div className="p-6 overline">Loading…</div>;

  return (
    <div className="p-4 space-y-4" data-testid="agent-home">
      {/* Hero earnings card */}
      <div className="rounded-xl bg-[var(--primary)] text-white p-6 shadow-md">
        <p className="overline text-white/80">Today</p>
        <div className="flex items-end justify-between mt-1">
          <div className="font-display text-4xl tracking-tighter">{formatCurrency(stats.today_revenue)}</div>
          <div className="text-right">
            <div className="overline text-white/80">Orders</div>
            <div className="font-display text-2xl">{stats.today_orders}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Tile icon={TrendingUp} label="Total revenue" value={formatCurrency(stats.total_revenue)}/>
        <Tile icon={Wallet} label="Commission" value={formatCurrency(stats.total_commission)} sub={`@ ${stats.commission_rate}%`}/>
        <Tile icon={ShoppingBag} label="Total orders" value={stats.total_orders}/>
        <Link to="/agent/catalog" className="rounded-xl bg-black text-white p-4 flex flex-col justify-between" data-testid="agent-quick-new-order">
          <p className="overline text-white/80">Quick</p>
          <div className="flex items-end justify-between">
            <div className="font-display text-lg tracking-tight leading-tight">New<br/>invoice</div>
            <ArrowRight size={20}/>
          </div>
        </Link>
      </div>

      <div className="surface-card p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="overline">Recent</p>
          <Link to="/agent/sales" className="text-xs text-[var(--primary)]">All →</Link>
        </div>
        <ul className="space-y-3">
          {(stats.recent || []).slice(0, 5).map((o) => (
            <li key={o.id} className="flex items-center justify-between text-sm">
              <div className="min-w-0">
                <div className="font-medium truncate">{o.customer_name}</div>
                <div className="font-mono text-xs text-[var(--text-muted)]">{o.number} · {formatDate(o.created_at)}</div>
              </div>
              <div className="font-mono">{formatCurrency(o.total)}</div>
            </li>
          ))}
          {!stats.recent?.length && <li className="text-sm text-[var(--text-muted)]">No orders yet. Start your first one!</li>}
        </ul>
      </div>
    </div>
  );
}

const Tile = ({ icon: Icon, label, value, sub }) => (
  <div className="surface-card p-4">
    <div className="flex items-center justify-between">
      <p className="overline">{label}</p>
      <Icon size={16} className="text-[var(--text-muted)]"/>
    </div>
    <div className="font-display text-2xl tracking-tighter mt-2">{value}</div>
    {sub && <div className="text-xs text-[var(--text-muted)] mt-0.5">{sub}</div>}
  </div>
);
