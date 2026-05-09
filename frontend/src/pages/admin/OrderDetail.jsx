import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api, formatApiError, formatCurrency, formatDate } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "../../components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../../components/ui/select";
import { useAuth } from "../../contexts/AuthContext";
import { toast } from "sonner";
import { ChevronLeft, Printer, Mail } from "lucide-react";

export default function OrderDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const [order, setOrder] = useState(null);
  const [payments, setPayments] = useState([]);
  const [payOpen, setPayOpen] = useState(false);
  const [pay, setPay] = useState({ amount: "", method: "cash", reference: "", notes: "" });

  const load = () => {
    api.get(`/orders/${id}`).then((r) => setOrder(r.data));
    api.get(`/payments`, { params: { order_id: id } }).then((r) => setPayments(r.data));
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

  if (!order) return <div className="p-8 overline">Loading…</div>;
  const canConvert = (order.type === "quote") || (order.type === "order");
  const isEmployee = user.role === "admin" || user.role === "employee";

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
          {(order.type === "invoice" || order.type === "quote") && (
            <Button variant="outline" onClick={() => window.open(`/admin/orders/${id}/print`, "_blank")} data-testid="open-print-button">
              <Printer size={14} className="mr-1.5"/>Print
            </Button>
          )}
          {order.type === "invoice" && isEmployee && (
            <Button variant="outline" onClick={emailInvoice} data-testid="email-invoice-button">
              <Mail size={14} className="mr-1.5"/>Email
            </Button>
          )}
          {canConvert && order.type === "quote" && isEmployee && (
            <>
              <Button variant="outline" onClick={() => convert("order")} data-testid="convert-order-button">→ Order</Button>
              <Button variant="outline" onClick={() => convert("invoice")} data-testid="convert-invoice-button">→ Invoice</Button>
            </>
          )}
          {order.type === "order" && isEmployee && (
            <Button variant="outline" onClick={() => convert("invoice")} data-testid="convert-invoice-button">→ Invoice</Button>
          )}
          {order.type === "invoice" && isEmployee && order.payment_status !== "paid" && (
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
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <Stat label="Total" value={formatCurrency(order.total)} />
        <Stat label="Paid" value={formatCurrency(order.amount_paid)} />
        <Stat label="Balance due" value={formatCurrency(order.balance_due)} accent={order.balance_due > 0}/>
      </div>

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
              <td colSpan={4} className="px-4 py-3 text-right overline">Total</td>
              <td className="px-4 py-3 text-right font-display text-xl">{formatCurrency(order.total)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {order.notes && (
        <div className="surface-card p-4 mb-4 text-sm">
          <p className="overline mb-2">Notes</p>
          {order.notes}
        </div>
      )}

      <div className="surface-card p-6">
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
    </div>
  );
}

const Stat = ({ label, value, accent }) => (
  <div className={`surface-card p-5 ${accent ? "border-[var(--primary)]" : ""}`}>
    <p className="overline">{label}</p>
    <div className={`font-display text-3xl tracking-tighter mt-2 ${accent ? "text-[var(--primary)]" : ""}`}>{value}</div>
  </div>
);
