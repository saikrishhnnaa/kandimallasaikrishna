import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api, formatApiError, formatCurrency, formatDate } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Switch } from "../../components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "../../components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../../components/ui/select";
import { useAuth } from "../../contexts/AuthContext";
import { toast } from "sonner";
import { ChevronLeft, Printer, Mail, Pencil, Trash2, RotateCcw, History } from "lucide-react";

export default function OrderDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const [order, setOrder] = useState(null);
  const [payments, setPayments] = useState([]);
  const [audit, setAudit] = useState([]);
  const [stmt, setStmt] = useState(null);
  const [payOpen, setPayOpen] = useState(false);
  const [pay, setPay] = useState({ amount: "", method: "cash", reference: "", notes: "" });

  const load = () => {
    api.get(`/orders/${id}`).then((r) => {
      setOrder(r.data);
      if (r.data.type === "invoice" && (user.role === "admin" || user.role === "employee")) {
        api.get(`/customers/${r.data.customer_id}/statement`, { params: { exclude_invoice_id: id } })
          .then((s) => setStmt(s.data)).catch(() => {});
      }
    });
    api.get(`/payments`, { params: { order_id: id } }).then((r) => setPayments(r.data));
    if (user.role === "admin" || user.role === "employee") {
      api.get(`/orders/${id}/audit`).then((r) => setAudit(r.data)).catch(() => {});
    }
  };
  useEffect(() => { load(); }, [id]);

  const convert = async (target) => {
    try { const { data } = await api.post(`/orders/${id}/convert`, null, { params: { target } });
      toast.success(`Converted to ${data.number}`); nav(`/admin/orders/${data.id}`); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  const recordPayment = async () => {
    try { await api.post("/payments", { order_id: id, amount: Number(pay.amount), method: pay.method, reference: pay.reference, notes: pay.notes });
      toast.success("Payment recorded"); setPayOpen(false); setPay({ amount: "", method: "cash", reference: "", notes: "" }); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  const emailInvoice = async () => {
    try {
      const { data } = await api.post(`/orders/${id}/email`);
      toast.success(`Sent to ${data.to}`);
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const softDelete = async () => {
    if (!window.confirm("Delete this order? Stock and credits will be restored.")) return;
    try { await api.delete(`/orders/${id}`); toast.success("Deleted"); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  const restore = async () => {
    try { await api.post(`/orders/${id}/restore`); toast.success("Restored"); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  const toggleAgentEdit = async (enabled) => {
    try {
      const { data } = await api.post(`/orders/${id}/agent-edit`, null, { params: { enabled } });
      setOrder(data);
      toast.success(enabled ? "Agent can now edit" : "Locked from agent");
    } catch (e) { toast.error(formatApiError(e)); }
  };

  if (!order) return <div className="p-8 overline">Loading…</div>;
  const canConvert = (order.type === "quote") || (order.type === "order");
  const isEmployee = user.role === "admin" || user.role === "employee";
  const isDeleted = !!order.deleted_at;

  return (
    <div className="p-8 max-w-[1100px] mx-auto" data-testid="order-detail-page">
      <button onClick={() => nav(-1)} className="overline flex items-center gap-1 mb-3 hover:text-[var(--primary)]">
        <ChevronLeft size={14}/>Back
      </button>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <p className="overline">{order.type}</p>
          <h1 className="font-display text-4xl tracking-tighter mt-1">{order.number}</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            For <strong className="text-[var(--text)]">{order.customer_name}</strong> · created {formatDate(order.created_at)} by {order.created_by_name}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isDeleted && user.role === "admin" && (
            <Button variant="outline" onClick={restore} data-testid="restore-button"><RotateCcw size={14} className="mr-1.5"/>Restore</Button>
          )}
          {!isDeleted && isEmployee && (
            <Button variant="outline" onClick={() => nav(`/admin/orders/${id}/edit`)} data-testid="edit-order-button">
              <Pencil size={14} className="mr-1.5"/>Edit
            </Button>
          )}
          {(order.type === "invoice" || order.type === "quote") && (
            <Button variant="outline" onClick={() => window.open(`/admin/orders/${id}/print`, "_blank")} data-testid="open-print-button">
              <Printer size={14} className="mr-1.5"/>Print
            </Button>
          )}
          {!isDeleted && order.type === "invoice" && isEmployee && (
            <Button variant="outline" onClick={emailInvoice} data-testid="email-invoice-button">
              <Mail size={14} className="mr-1.5"/>Email
            </Button>
          )}
          {!isDeleted && canConvert && order.type === "quote" && isEmployee && (
            <>
              <Button variant="outline" onClick={() => convert("order")} data-testid="convert-order-button">→ Order</Button>
              <Button variant="outline" onClick={() => convert("invoice")} data-testid="convert-invoice-button">→ Invoice</Button>
            </>
          )}
          {!isDeleted && order.type === "order" && isEmployee && (
            <Button variant="outline" onClick={() => convert("invoice")} data-testid="convert-invoice-button">→ Invoice</Button>
          )}
          {!isDeleted && order.type === "invoice" && isEmployee && order.payment_status !== "paid" && (
            <Dialog open={payOpen} onOpenChange={setPayOpen}>
              <DialogTrigger asChild>
                <Button className="bg-[var(--primary)] hover:bg-[var(--primary-hover)]" data-testid="record-payment-button">Record payment</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle className="font-display tracking-tight">Record payment</DialogTitle></DialogHeader>
                <div className="space-y-4 mt-2">
                  <div><Label className="overline">Amount</Label>
                    <Input type="number" step="0.01" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} className="mt-2" data-testid="payment-amount-input"/>
                    <p className="text-xs text-[var(--text-muted)] mt-1 font-mono">Balance due: {formatCurrency(order.balance_due)}</p>
                  </div>
                  <div><Label className="overline">Method</Label>
                    <Select value={pay.method} onValueChange={(v) => setPay({ ...pay, method: v })}>
                      <SelectTrigger className="mt-2"><SelectValue/></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                        <SelectItem value="cheque">Cheque</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label className="overline">Reference</Label>
                    <Input value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} className="mt-2"/>
                  </div>
                  <div><Label className="overline">Notes</Label>
                    <Textarea rows={2} value={pay.notes} onChange={(e) => setPay({ ...pay, notes: e.target.value })} className="mt-2"/>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setPayOpen(false)}>Cancel</Button>
                  <Button onClick={recordPayment} className="bg-[var(--primary)] hover:bg-[var(--primary-hover)]" data-testid="save-payment-button">Save</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          {!isDeleted && user.role === "admin" && (
            <Button variant="outline" onClick={softDelete} data-testid="delete-order-button" className="text-[var(--danger)] hover:bg-[var(--danger)]/10">
              <Trash2 size={14} className="mr-1.5"/>Delete
            </Button>
          )}
        </div>
      </div>

      {isDeleted && (
        <div className="surface-card p-4 mb-4 border-[var(--danger)]/30 bg-[var(--danger)]/[0.04]" data-testid="deleted-banner">
          <p className="overline text-[var(--danger)]">Deleted</p>
          <p className="text-sm mt-1">This {order.type} was deleted on {formatDate(order.deleted_at)}. Stock and credits were restored.</p>
        </div>
      )}

      {!isDeleted && isEmployee && (
        <div className="surface-card p-4 mb-4 flex items-center justify-between gap-4" data-testid="agent-edit-toggle">
          <div>
            <p className="overline">Agent edits</p>
            <p className="text-xs text-[var(--text-muted)] mt-1">When ON, the sales agent who created this order can edit it.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono">{order.agent_can_edit ? "Unlocked" : "Locked"}</span>
            <Switch checked={!!order.agent_can_edit} onCheckedChange={toggleAgentEdit} data-testid="agent-edit-switch"/>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <Stat label="Total" value={formatCurrency(order.total)} />
        <Stat label="Paid" value={formatCurrency(order.amount_paid)} />
        <Stat label="Balance due" value={formatCurrency(order.balance_due)} accent={order.balance_due > 0}/>
      </div>

      {order.type === "invoice" && stmt && stmt.total_outstanding > 0 && (
        <div className="surface-card p-5 mb-4 border-l-4 border-l-[var(--primary)]" data-testid="previous-dues">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="overline text-[var(--primary)]">Previous outstanding</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">{stmt.open_invoices.length} other open invoice(s) for this customer</p>
            </div>
            <div className="text-right">
              <div className="font-display text-2xl tracking-tight">{formatCurrency(stmt.total_outstanding)}</div>
              <div className="text-xs text-[var(--text-muted)] font-mono mt-0.5">
                Grand total owed: <span className="text-[var(--text)] font-medium">{formatCurrency(stmt.total_outstanding + (order.balance_due || 0))}</span>
              </div>
            </div>
          </div>
          {stmt.open_invoices.length > 0 && (
            <ul className="mt-3 space-y-1">
              {stmt.open_invoices.slice(0, 4).map((i) => (
                <li key={i.id} className="flex justify-between text-xs">
                  <span className="font-mono text-[var(--text-muted)]">{i.number} · due {formatDate(i.due_date)}</span>
                  <span className="font-mono">{formatCurrency(i.balance_due)}</span>
                </li>
              ))}
              <li className="mt-2"><Link to={`/admin/customers/${order.customer_id}/statement`} target="_blank" className="text-xs text-[var(--primary)] hover:underline">View full statement →</Link></li>
            </ul>
          )}
        </div>
      )}

      <div className="surface-card overflow-hidden mb-4">
        <table className="w-full text-sm">
          <thead className="bg-black/[0.02]">
            <tr className="text-left border-b border-[var(--border)]">
              {["SKU", "Description", "Qty", "Unit", "Line total"].map((h) => (
                <th key={h} className="px-4 py-3 overline text-[var(--text-muted)] font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {order.items.map((it, i) => (
              <tr key={i} className="border-b border-[var(--border)] last:border-0">
                <td className="px-4 py-3 font-mono text-xs">{it.sku}</td>
                <td className="px-4 py-3">{it.name}</td>
                <td className="px-4 py-3 font-mono">{it.quantity}</td>
                <td className="px-4 py-3 font-mono">{formatCurrency(it.unit_price)}</td>
                <td className="px-4 py-3 font-mono text-right">{formatCurrency(it.line_total)}</td>
              </tr>
            ))}
            <tr className="bg-black/[0.02]">
              <td colSpan={4} className="px-4 py-3 text-right overline">Subtotal</td>
              <td className="px-4 py-3 text-right font-mono">{formatCurrency(order.subtotal)}</td>
            </tr>
            {order.trade_in_total > 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-2 text-right text-sm text-[var(--primary)]">Trade-in</td>
                <td className="px-4 py-2 text-right font-mono text-[var(--primary)]">− {formatCurrency(order.trade_in_total)}</td>
              </tr>
            )}
            {order.credit_applied > 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-2 text-right text-sm text-[var(--primary)]">Credit applied</td>
                <td className="px-4 py-2 text-right font-mono text-[var(--primary)]">− {formatCurrency(order.credit_applied)}</td>
              </tr>
            )}
            <tr className="bg-black/[0.04]">
              <td colSpan={4} className="px-4 py-3 text-right overline">Total</td>
              <td className="px-4 py-3 text-right font-display text-xl">{formatCurrency(order.total)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {(order.trade_ins?.length || 0) > 0 && (
        <div className="surface-card overflow-hidden mb-4" data-testid="trade-ins-display">
          <div className="px-4 py-3 border-b border-[var(--border)] bg-black/[0.02]">
            <p className="overline">Trade-in items</p>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {order.trade_ins.map((ti, i) => (
                <tr key={i} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-4 py-2.5">{ti.description}</td>
                  <td className="px-4 py-2.5 text-xs text-[var(--text-muted)]">{ti.restock ? "↻ Restocked" : "—"}</td>
                  <td className="px-4 py-2.5 font-mono text-right">{ti.quantity} × {formatCurrency(ti.unit_value)}</td>
                  <td className="px-4 py-2.5 font-mono text-right text-[var(--primary)]">− {formatCurrency(ti.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {order.notes && (
        <div className="surface-card p-4 mb-4 text-sm">
          <p className="overline mb-2">Notes</p>
          {order.notes}
        </div>
      )}

      <div className="surface-card p-6 mb-4">
        <p className="overline mb-3">Payments</p>
        {payments.length === 0 ? (
          <div className="text-sm text-[var(--text-muted)]">No payments recorded.</div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[var(--text-muted)]">
              {["Date", "Method", "Reference", "Amount"].map((h) => <th key={h} className="py-2 overline font-medium">{h}</th>)}
            </tr></thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-t border-[var(--border)]">
                  <td className="py-2.5 text-[var(--text-muted)]">{formatDate(p.created_at)}</td>
                  <td className="py-2.5 capitalize">{p.method.replace("_", " ")}</td>
                  <td className="py-2.5 font-mono text-xs">{p.reference || "—"}</td>
                  <td className="py-2.5 font-mono text-right">{formatCurrency(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {audit.length > 0 && (
        <div className="surface-card p-6" data-testid="audit-section">
          <div className="flex items-center gap-2 mb-3">
            <History size={14} className="text-[var(--text-muted)]"/>
            <p className="overline">Activity</p>
          </div>
          <ul className="space-y-2">
            {audit.map((a) => (
              <li key={a.id} className="flex items-center gap-3 text-sm border-l-2 border-[var(--border)] pl-3 py-1">
                <span className="text-xs font-mono text-[var(--text-muted)] w-44 shrink-0">{new Date(a.at).toLocaleString()}</span>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-black/5">{a.action.replace(/_/g, " ")}</span>
                <span className="text-xs text-[var(--text-muted)] truncate">{a.by_name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const Stat = ({ label, value, accent }) => (
  <div className={`surface-card p-5 ${accent ? "border-[var(--primary)]" : ""}`}>
    <p className="overline">{label}</p>
    <div className={`font-display text-3xl tracking-tighter mt-2 ${accent ? "text-[var(--primary)]" : ""}`}>{value}</div>
  </div>
);
