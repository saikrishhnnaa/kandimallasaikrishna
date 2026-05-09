import React, { useEffect, useState } from "react";
import { api, formatCurrency, formatDate } from "../../lib/api";

export default function AgentSales() {
  const [list, setList] = useState([]);
  useEffect(() => { api.get("/orders").then((r) => setList(r.data)); }, []);
  const totalRev = list.reduce((s, o) => s + o.total, 0);
  const totalComm = list.reduce((s, o) => s + (o.agent_commission || 0), 0);

  return (
    <div className="p-4" data-testid="agent-sales">
      <p className="overline">My performance</p>
      <h1 className="font-display text-3xl tracking-tighter mt-1 mb-4">My Sales</h1>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="surface-card p-4">
          <p className="overline">Revenue</p>
          <div className="font-display text-2xl mt-1">{formatCurrency(totalRev)}</div>
        </div>
        <div className="surface-card p-4 bg-[var(--primary)] text-white border-[var(--primary)]">
          <p className="overline text-white/80">Commission</p>
          <div className="font-display text-2xl mt-1">{formatCurrency(totalComm)}</div>
        </div>
      </div>

      <ul className="space-y-2">
        {list.map((o) => (
          <li key={o.id} className="surface-card p-4">
            <div className="flex items-center justify-between mb-1">
              <div className="font-medium truncate">{o.customer_name}</div>
              <div className="font-mono">{formatCurrency(o.total)}</div>
            </div>
            <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
              <span className="font-mono">{o.number} · {formatDate(o.created_at)}</span>
              {o.agent_commission > 0 && <span className="text-[var(--primary)]">+{formatCurrency(o.agent_commission)}</span>}
            </div>
          </li>
        ))}
        {!list.length && <li className="text-center py-10 text-sm text-[var(--text-muted)]">No orders yet.</li>}
      </ul>
    </div>
  );
}
