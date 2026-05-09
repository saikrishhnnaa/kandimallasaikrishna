import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatCurrency, formatDate } from "../../lib/api";
import { Input } from "../../components/ui/input";
import {
  Tabs, TabsList, TabsTrigger,
} from "../../components/ui/tabs";
import { Switch } from "../../components/ui/switch";
import { Plus } from "lucide-react";

const TYPES = [
  { id: "all", label: "All" },
  { id: "quote", label: "Quotes" },
  { id: "order", label: "Orders" },
  { id: "invoice", label: "Invoices" },
];

const STATUSES = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "deleted", label: "Deleted" },
  { id: "paid", label: "Paid invoices" },
  { id: "unpaid", label: "Unpaid invoices" },
];

export default function Orders() {
  const [list, setList] = useState([]);
  const [tab, setTab] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");
  const [search, setSearch] = useState("");

  useEffect(() => {
    api.get("/orders", { params: { include_deleted: true } }).then((r) => setList(r.data));
  }, []);

  const filtered = list
    .filter((o) => tab === "all" || o.type === tab)
    .filter((o) => {
      if (statusFilter === "active") return !o.deleted_at;
      if (statusFilter === "deleted") return !!o.deleted_at;
      if (statusFilter === "paid") return o.type === "invoice" && o.payment_status === "paid";
      if (statusFilter === "unpaid") return o.type === "invoice" && o.payment_status !== "paid" && !o.deleted_at;
      return true;
    })
    .filter((o) => [o.number, o.customer_name, o.created_by_name].join(" ").toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-8 max-w-[1400px] mx-auto" data-testid="orders-page">
      <div className="flex items-end justify-between mb-6">
        <div>
          <p className="overline">Sales</p>
          <h1 className="font-display text-4xl tracking-tighter mt-1">Orders & Invoices</h1>
        </div>
        <Link to="/admin/orders/new" className="px-4 h-10 inline-flex items-center bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white rounded-md text-sm" data-testid="new-order-button">
          <Plus size={16} className="mr-1.5"/>New Order
        </Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            {TYPES.map((t) => <TabsTrigger key={t.id} value={t.id} data-testid={`tab-${t.id}`}>{t.label}</TabsTrigger>)}
          </TabsList>
        </Tabs>
        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
          <TabsList>
            {STATUSES.map((s) => <TabsTrigger key={s.id} value={s.id} data-testid={`status-${s.id}`}>{s.label}</TabsTrigger>)}
          </TabsList>
        </Tabs>
        <Input placeholder="Search number, customer…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-72 h-10"/>
      </div>

      <div className="surface-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-black/[0.02]">
            <tr className="text-left border-b border-[var(--border)]">
              {["Number", "Type", "Customer", "Created by", "Total", "Status", "Date"].map((h) => (
                <th key={h} className="px-4 py-3 overline text-[var(--text-muted)] font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((o) => (
              <tr key={o.id} className={`border-b border-[var(--border)] last:border-0 hover:bg-black/[0.015] cursor-pointer ${o.deleted_at ? "opacity-50" : ""}`}>
                <td className="px-4 py-3 font-mono text-xs">
                  <Link to={`/admin/orders/${o.id}`} className="hover:text-[var(--primary)]" data-testid={`order-link-${o.number}`}>
                    {o.number}{o.deleted_at && <span className="ml-1 text-[10px] text-[var(--danger)]">(deleted)</span>}
                  </Link>
                </td>
                <td className="px-4 py-3"><TypeBadge t={o.type}/></td>
                <td className="px-4 py-3">{o.customer_name}</td>
                <td className="px-4 py-3 text-[var(--text-muted)] text-xs">{o.created_by_name}</td>
                <td className="px-4 py-3 font-mono">{formatCurrency(o.total)}</td>
                <td className="px-4 py-3"><PayBadge o={o}/></td>
                <td className="px-4 py-3 text-[var(--text-muted)] text-xs">{formatDate(o.created_at)}</td>
              </tr>
            ))}
            {!filtered.length && <tr><td colSpan={7} className="px-4 py-10 text-center text-[var(--text-muted)]">No records.</td></tr>}
          </tbody>
        </table>
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
  return <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded ${map[t] || ""}`}>{t}</span>;
}

function PayBadge({ o }) {
  if (o.deleted_at) return <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-[var(--danger)]/10 text-[var(--danger)]">deleted</span>;
  if (o.type !== "invoice") return <span className="text-xs text-[var(--text-muted)]">—</span>;
  const map = {
    paid: "bg-[var(--success)]/10 text-[var(--success)]",
    partial: "bg-[var(--warning)]/10 text-[var(--warning)]",
    unpaid: "bg-[var(--danger)]/10 text-[var(--danger)]",
  };
  return <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded ${map[o.payment_status] || ""}`}>{o.payment_status}</span>;
}
