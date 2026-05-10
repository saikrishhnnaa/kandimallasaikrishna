import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, formatCurrency, formatDate } from "../../lib/api";
import { Printer } from "lucide-react";

export default function OrderPrint() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [stmt, setStmt] = useState(null);

  useEffect(() => {
    (async () => {
      const o = await api.get(`/orders/${id}`).then((r) => r.data);
      setOrder(o);
      const cs = await api.get(`/customers`).then((r) => r.data);
      setCustomer(cs.find((c) => c.id === o.customer_id) || null);
      if (o.type === "invoice") {
        try {
          const s = await api.get(`/customers/${o.customer_id}/statement`, { params: { exclude_invoice_id: id } }).then((r) => r.data);
          setStmt(s);
        } catch (_e) { /* ignore */ }
      }
    })();
  }, [id]);

  if (!order) return <div className="p-8 overline">Loading…</div>;

  return (
    <>
      <style>{`@media print { .no-print { display: none !important; } body { background: white; } }`}</style>
      <div className="min-h-screen bg-[var(--bg)] py-12 px-4 print:py-0 print:px-0" data-testid="order-print">
        <div className="max-w-3xl mx-auto">
          <div className="no-print mb-6 flex items-center justify-between">
            <a href={`/admin/orders/${id}`} className="overline hover:text-[var(--primary)]">← Back to order</a>
            <button
              onClick={() => window.print()}
              data-testid="print-button"
              className="px-4 h-10 inline-flex items-center bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white rounded-md text-sm font-medium"
            >
              <Printer size={16} className="mr-1.5"/> Print / Save as PDF
            </button>
          </div>

          <div className="bg-white border border-[var(--border)] rounded-lg p-12 print:border-0 print:rounded-none print:p-8 shadow-sm print:shadow-none">
            {/* Header */}
            <div className="flex items-start justify-between mb-12">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-9 h-9 bg-[var(--primary)] text-white flex items-center justify-center font-display font-bold">W</div>
                  <span className="font-display tracking-tight text-xl">Wholesale POS</span>
                </div>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                  Your Company Name<br/>
                  Your business address<br/>
                  contact@yourcompany.com
                </p>
              </div>
              <div className="text-right">
                <p className="overline">{order.type}</p>
                <h1 className="font-display text-4xl tracking-tighter mt-1">{order.number}</h1>
                <div className="text-xs font-mono text-[var(--text-muted)] mt-2 space-y-0.5">
                  <div>Issued: {formatDate(order.created_at)}</div>
                  {order.due_date && <div>Due: {formatDate(order.due_date)}</div>}
                </div>
              </div>
            </div>

            {/* Bill to */}
            <div className="grid grid-cols-2 gap-8 mb-10">
              <div>
                <p className="overline mb-2">Bill to</p>
                <div className="font-display text-xl tracking-tight">{customer?.company || customer?.name || order.customer_name}</div>
                {customer?.name && customer?.company && <div className="text-sm text-[var(--text-muted)]">{customer.name}</div>}
                <div className="text-xs text-[var(--text-muted)] mt-1 whitespace-pre-line">{customer?.address}</div>
                {customer?.email && <div className="text-xs text-[var(--text-muted)] mt-1">{customer.email}</div>}
                {customer?.tax_id && <div className="text-xs font-mono text-[var(--text-muted)] mt-1">Tax ID: {customer.tax_id}</div>}
              </div>
              <div className="text-right">
                <p className="overline mb-2">Payment terms</p>
                <div className="text-sm">Net-{order.payment_terms_days}</div>
                <p className="overline mt-3 mb-2">Created by</p>
                <div className="text-sm">{order.created_by_name}</div>
              </div>
            </div>

            {/* Items */}
            <table className="w-full text-sm mb-8">
              <thead>
                <tr className="border-y-2 border-[var(--text)]">
                  {["SKU", "Description", "Qty", "Unit price", "Amount"].map((h, i) => (
                    <th key={h} className={`overline py-2.5 ${i >= 2 ? "text-right" : "text-left"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {order.items.map((it, i) => (
                  <tr key={i} className="border-b border-[var(--border)]">
                    <td className="py-3 font-mono text-xs">{it.sku}</td>
                    <td className="py-3">{it.name}{it.variant_label ? <span className="text-[var(--text-muted)] ml-2 text-xs">· {it.variant_label}</span> : null}</td>
                    <td className="py-3 text-right font-mono">{it.quantity}</td>
                    <td className="py-3 text-right font-mono">{formatCurrency(it.unit_price)}</td>
                    <td className="py-3 text-right font-mono">{formatCurrency(it.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totals */}
            <div className="flex justify-end">
              <div className="w-72 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--text-muted)]">Subtotal</span>
                  <span className="font-mono">{formatCurrency(order.subtotal)}</span>
                </div>
                {(order.trade_in_total || 0) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--text-muted)]">Trade-in</span>
                    <span className="font-mono">− {formatCurrency(order.trade_in_total)}</span>
                  </div>
                )}
                {(order.credit_applied || 0) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--text-muted)]">Credit applied</span>
                    <span className="font-mono">− {formatCurrency(order.credit_applied)}</span>
                  </div>
                )}
                {(order.tax_components || []).length > 0 ? (
                  <>
                    {order.tax_jurisdiction_name && (
                      <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] pt-1">{order.tax_jurisdiction_name}</div>
                    )}
                    {order.tax_components.map((c, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="text-[var(--text-muted)]">{c.label} ({c.rate}%)</span>
                        <span className="font-mono">{formatCurrency(c.amount)}</span>
                      </div>
                    ))}
                  </>
                ) : (order.tax || 0) > 0 ? (
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--text-muted)]">Tax</span>
                    <span className="font-mono">{formatCurrency(order.tax)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between font-display text-2xl tracking-tighter pt-2 border-t border-[var(--text)]">
                  <span>Total</span>
                  <span>{formatCurrency(order.total)}</span>
                </div>
                {order.type === "invoice" && (
                  <>
                    <div className="flex justify-between text-sm pt-2">
                      <span className="text-[var(--text-muted)]">Paid</span>
                      <span className="font-mono">{formatCurrency(order.amount_paid)}</span>
                    </div>
                    <div className="flex justify-between font-mono text-base font-semibold text-[var(--primary)]">
                      <span>Balance due</span>
                      <span>{formatCurrency(order.balance_due)}</span>
                    </div>
                    {stmt && stmt.total_outstanding > 0 && (
                      <>
                        <div className="flex justify-between text-sm pt-2 border-t border-[var(--border)]">
                          <span className="text-[var(--text-muted)]">Previous outstanding ({stmt.open_invoices.length})</span>
                          <span className="font-mono">{formatCurrency(stmt.total_outstanding)}</span>
                        </div>
                        <div className="flex justify-between font-mono text-lg font-semibold pt-1">
                          <span>Total amount due</span>
                          <span>{formatCurrency(stmt.total_outstanding + (order.balance_due || 0))}</span>
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>

            {order.notes && (
              <div className="mt-12 pt-6 border-t border-[var(--border)]">
                <p className="overline mb-2">Notes</p>
                <p className="text-sm text-[var(--text-muted)] whitespace-pre-line">{order.notes}</p>
              </div>
            )}

            <p className="overline text-center mt-12 text-[var(--text-muted)]">Thank you for your business.</p>
          </div>
        </div>
      </div>
    </>
  );
}
