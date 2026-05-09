import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatCurrency, formatDate } from "../../lib/api";
import { Pencil, Lock } from "lucide-react";

export default function AgentSales() {
  const [list, setList] = useState([]);
  useEffect(() => { api.get("/orders").then((r) => setList(r.data)); }, []);
  const totalRev = list.reduce((s, o) => s + o.total, 0);
  const totalComm = list.reduce((s, o) => s + (o.agent_commission || 0), 0);
  const editableCount = list.filter((o) => o.agent_can_edit && !o.deleted_at).length;

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

      {editableCount > 0 && (
        <div className="mb-3 text-xs text-[var(--primary)] flex items-center gap-1.5" data-testid="editable-banner">
          <Pencil size={12}/>
          {editableCount} order{editableCount > 1 ? "s" : ""} unlocked for editing
        </div>
      )}

      <ul className="space-y-2">
        {list.map((o) => (
          <li key={o.id} className={`surface-card p-4 ${o.deleted_at ? "opacity-50" : ""}`}>
            <div className="flex items-center justify-between mb-1 gap-2">
              <div className="font-medium truncate">{o.customer_name}</div>
              <div className="font-mono">{formatCurrency(o.total)}</div>
            </div>
            <div className="flex items-center justify-between text-xs text-[var(--text-muted)] gap-2">
              <span className="font-mono">{o.number} · {formatDate(o.created_at)}</span>
              <div className="flex items-center gap-2">
                {o.agent_commission > 0 && <span className="text-[var(--primary)]">+{formatCurrency(o.agent_commission)}</span>}
                {!o.deleted_at && (
                  o.agent_can_edit ? (
                    <Link to={`/agent/orders/${o.id}/edit`} data-testid={`agent-edit-${o.number}`}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-[var(--primary)] text-white rounded text-[11px] font-medium hover:bg-[var(--primary-hover)]">
                      <Pencil size={11}/>Edit
                    </Link>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-black/5 rounded text-[11px] text-[var(--text-muted)]" title="Ask admin to unlock">
                      <Lock size={11}/>Locked
                    </span>
                  )
                )}
              </div>
            </div>
          </li>
        ))}
        {!list.length && <li className="text-center py-10 text-sm text-[var(--text-muted)]">No orders yet.</li>}
      </ul>
    </div>
  );
}
