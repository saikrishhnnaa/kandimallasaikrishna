import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api, formatApiError, formatCurrency, formatDate } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { toast } from "sonner";
import { ChevronLeft, Printer, Mail, Wallet } from "lucide-react";

export default function CustomerStatement() {
  const { id } = useParams();
  const nav = useNavigate();
  const [stmt, setStmt] = useState(null);

  useEffect(() => {
    api.get(`/customers/${id}/statement`).then((r) => setStmt(r.data)).catch((e) => toast.error(formatApiError(e)));
  }, [id]);

  const sendEmail = async () => {
    try {
      const { data } = await api.post(`/customers/${id}/statement/email`);
      toast.success(`Statement sent to ${data.to}`);
    } catch (e) { toast.error(formatApiError(e)); }
  };

  if (!stmt) return <div className="p-8 overline">Loading…</div>;
  const c = stmt.customer;
  const a = stmt.aged_buckets;

  return (
    <>
      <style>{`@media print { .no-print { display: none !important; } body { background: white; } }`}</style>
      <div className="min-h-screen bg-[var(--bg)] py-12 px-4 print:py-0 print:px-0" data-testid="customer-statement">
        <div className="max-w-3xl mx-auto">
          <div className="no-print mb-6 flex items-center justify-between">
            <button onClick={() => nav(-1)} className="overline flex items-center gap-1 hover:text-[var(--primary)]">
              <ChevronLeft size={14}/>Back
            </button>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={sendEmail} data-testid="email-statement-button"><Mail size={14} className="mr-1.5"/>Email</Button>
              <Button onClick={() => window.print()} className="bg-[var(--primary)] hover:bg-[var(--primary-hover)]" data-testid="print-statement-button">
                <Printer size={14} className="mr-1.5"/>Print / Save as PDF
              </Button>
            </div>
          </div>

          <div className="bg-white border border-[var(--border)] rounded-lg p-12 print:border-0 print:p-8 shadow-sm print:shadow-none">
            <div className="flex items-start justify-between mb-10">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-9 h-9 bg-[var(--primary)] text-white flex items-center justify-center font-display font-bold">W</div>
                  <span className="font-display tracking-tight text-xl">Wholesale POS</span>
                </div>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                  Your Company Name<br/>contact@yourcompany.com
                </p>
              </div>
              <div className="text-right">
                <p className="overline">Statement</p>
                <h1 className="font-display text-3xl tracking-tighter mt-1">{c.company || c.name}</h1>
                <div className="text-xs font-mono text-[var(--text-muted)] mt-1">As of {formatDate(stmt.as_of)}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-8 mb-8">
              <div>
                <p className="overline mb-2">Bill to</p>
                <div className="text-sm">{c.name}</div>
                <div className="text-xs text-[var(--text-muted)] whitespace-pre-line">{c.address}</div>
                {c.email && <div className="text-xs text-[var(--text-muted)] mt-1">{c.email}</div>}
                {c.phone && <div className="text-xs text-[var(--text-muted)]">{c.phone}</div>}
              </div>
              <div className="text-right">
                <p className="overline mb-2">Terms</p>
                <div className="text-sm font-mono">Net-{c.payment_terms_days}</div>
                <p className="overline mt-3 mb-2">Credit limit</p>
                <div className="text-sm font-mono">{formatCurrency(c.credit_limit)}</div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-8">
              <div className="bg-[var(--primary-soft)] p-4 rounded">
                <p className="overline">Outstanding</p>
                <div className="font-display text-2xl text-[var(--primary)] mt-1">{formatCurrency(stmt.total_outstanding)}</div>
              </div>
              <div className="bg-black/[0.02] p-4 rounded">
                <p className="overline">Total invoiced</p>
                <div className="font-display text-2xl mt-1">{formatCurrency(stmt.total_invoiced)}</div>
              </div>
              <div className="bg-[var(--success)]/10 p-4 rounded">
                <p className="overline flex items-center gap-1"><Wallet size={10}/>Available credit</p>
                <div className="font-display text-2xl text-[var(--success)] mt-1">{formatCurrency(stmt.credit_balance)}</div>
              </div>
            </div>

            <div className="mb-8">
              <p className="overline mb-3">Open invoices</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y-2 border-[var(--text)]">
                    {["Number", "Date", "Due", "Total", "Paid", "Balance"].map((h, i) => (
                      <th key={h} className={`overline py-2 ${i >= 3 ? "text-right" : "text-left"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stmt.open_invoices.map((i) => (
                    <tr key={i.id} className="border-b border-[var(--border)]">
                      <td className="py-3 font-mono text-xs"><Link to={`/admin/orders/${i.id}`} className="hover:text-[var(--primary)] no-print:hover:underline">{i.number}</Link></td>
                      <td className="py-3 text-xs">{formatDate(i.created_at)}</td>
                      <td className="py-3 text-xs">{formatDate(i.due_date)}</td>
                      <td className="py-3 text-right font-mono">{formatCurrency(i.total)}</td>
                      <td className="py-3 text-right font-mono">{formatCurrency(i.amount_paid)}</td>
                      <td className="py-3 text-right font-mono text-[var(--primary)]">{formatCurrency(i.balance_due)}</td>
                    </tr>
                  ))}
                  {!stmt.open_invoices.length && (
                    <tr><td colSpan={6} className="py-8 text-center text-[var(--text-muted)]">No open invoices.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mb-8">
              <p className="overline mb-3">Aged outstanding</p>
              <div className="grid grid-cols-4 gap-2 text-sm">
                {[
                  ["0-30 days", a["0-30"], "bg-black/[0.03]"],
                  ["31-60 days", a["31-60"], "bg-[var(--warning)]/10 text-[var(--warning)]"],
                  ["61-90 days", a["61-90"], "bg-[var(--warning)]/15 text-[var(--warning)]"],
                  ["90+ days", a["90+"], "bg-[var(--danger)]/10 text-[var(--danger)]"],
                ].map(([l, v, cls]) => (
                  <div key={l} className={`p-3 rounded ${cls}`}>
                    <div className="text-[10px] uppercase tracking-widest">{l}</div>
                    <div className="font-mono text-base mt-1">{formatCurrency(v)}</div>
                  </div>
                ))}
              </div>
            </div>

            {stmt.payments.length > 0 && (
              <div className="mb-8">
                <p className="overline mb-3">Recent payments</p>
                <table className="w-full text-sm">
                  <tbody>
                    {stmt.payments.slice(0, 6).map((p) => (
                      <tr key={p.id} className="border-b border-[var(--border)]">
                        <td className="py-2 text-xs">{formatDate(p.created_at)}</td>
                        <td className="py-2 text-xs capitalize">{p.method.replace("_", " ")}</td>
                        <td className="py-2 text-xs font-mono text-[var(--text-muted)]">{p.reference || "—"}</td>
                        <td className="py-2 text-right font-mono text-[var(--success)]">+ {formatCurrency(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="overline text-center mt-12 text-[var(--text-muted)]">
              Please remit payment for outstanding balances at your earliest convenience.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
