import React, { useEffect, useState } from "react";
import { api, formatCurrency } from "../../lib/api";
import { Input } from "../../components/ui/input";
import { Search } from "lucide-react";

export default function AgentCatalog() {
  const [list, setList] = useState([]);
  const [search, setSearch] = useState("");
  useEffect(() => { api.get("/products").then((r) => setList(r.data)); }, []);
  const filtered = list.filter((p) =>
    [p.name, p.sku, p.category].join(" ").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4" data-testid="agent-catalog">
      <p className="overline">Browse</p>
      <h1 className="font-display text-3xl tracking-tighter mt-1 mb-4">Catalog</h1>
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"/>
        <Input placeholder="Search SKU, name…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-11"/>
      </div>
      <div className="space-y-2">
        {filtered.map((p) => (
          <div key={p.id} className="surface-card p-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-medium truncate">{p.name}</div>
              <div className="text-xs font-mono text-[var(--text-muted)]">{p.sku} · {p.category}</div>
              <div className="mt-1 flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono">{formatCurrency(p.base_price)}/{p.unit}</span>
                {(p.tiers || []).slice(0, 2).map((t, i) => (
                  <span key={i} className="text-[10px] font-mono px-1.5 py-0.5 bg-[var(--primary-soft)] text-[var(--primary)] rounded">
                    {t.min_qty}+ → {formatCurrency(t.price)}
                  </span>
                ))}
              </div>
            </div>
            <div className="text-right">
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${p.stock <= p.low_stock_threshold ? "bg-[var(--danger)]/10 text-[var(--danger)]" : "bg-[var(--success)]/10 text-[var(--success)]"}`}>
                {p.stock} {p.unit}
              </span>
            </div>
          </div>
        ))}
        {!filtered.length && <div className="text-center py-10 text-sm text-[var(--text-muted)]">No products.</div>}
      </div>
    </div>
  );
}
