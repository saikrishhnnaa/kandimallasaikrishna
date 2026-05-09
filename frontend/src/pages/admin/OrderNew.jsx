import React, { useEffect, useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, formatApiError, formatCurrency } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Switch } from "../../components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../../components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, ChevronLeft, ScanLine, Repeat, Wallet } from "lucide-react";
import BarcodeScanner from "../../components/BarcodeScanner";
import { useUsbScanner } from "../../hooks/useUsbScanner";
import { useAuth } from "../../contexts/AuthContext";

export default function OrderForm() {
  const nav = useNavigate();
  const { id } = useParams();
  const { user } = useAuth();
  const isEdit = Boolean(id);
  const isAgent = user?.role === "sales_agent";

  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [customerId, setCustomerId] = useState("");
  const [items, setItems] = useState([]);
  const [tradeIns, setTradeIns] = useState([]);
  const [creditApplied, setCreditApplied] = useState(0);
  const [type, setType] = useState("order");
  const [notes, setNotes] = useState("");
  const [preview, setPreview] = useState(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [originalOrder, setOriginalOrder] = useState(null);

  // Load existing order if editing
  useEffect(() => {
    api.get("/customers").then((r) => setCustomers(r.data));
    api.get("/products").then((r) => setProducts(r.data));
    if (isEdit) {
      api.get(`/orders/${id}`).then((r) => {
        const o = r.data;
        setOriginalOrder(o);
        setCustomerId(o.customer_id);
        setItems(o.items.map((it) => ({ product_id: it.product_id, quantity: it.quantity })));
        setTradeIns(o.trade_ins || []);
        setCreditApplied(o.credit_applied || 0);
        setType(o.type);
        setNotes(o.notes || "");
      }).catch((e) => toast.error(formatApiError(e)));
    }
  }, [id, isEdit]);

  const handleScan = async (code) => {
    try {
      const { data } = await api.get(`/products/by-barcode/${encodeURIComponent(code)}`);
      setItems((prev) => {
        const idx = prev.findIndex((it) => it.product_id === data.id);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = { ...copy[idx], quantity: Number(copy[idx].quantity || 0) + 1 };
          return copy;
        }
        return [...prev, { product_id: data.id, quantity: 1 }];
      });
      toast.success(`Added: ${data.name}`);
    } catch (e) { toast.error(formatApiError(e)); }
  };
  useUsbScanner(handleScan, true);

  // Live pricing preview
  useEffect(() => {
    if (!customerId) { setPreview(null); return; }
    const valid = items.filter((i) => i.product_id && Number(i.quantity) > 0);
    api.post("/pricing/preview", {
      customer_id: customerId,
      items: valid.map((i) => ({ product_id: i.product_id, quantity: Number(i.quantity) })),
      trade_ins: tradeIns,
      credit_applied: Number(creditApplied) || 0,
    }).then((r) => setPreview(r.data)).catch(() => setPreview(null));
  }, [customerId, items, tradeIns, creditApplied]);

  const customer = useMemo(() => customers.find((c) => c.id === customerId), [customers, customerId]);

  const addLine = () => setItems([...items, { product_id: "", quantity: 1 }]);
  const removeLine = (idx) => setItems(items.filter((_, i) => i !== idx));
  const updateLine = (idx, patch) => {
    const arr = [...items]; arr[idx] = { ...arr[idx], ...patch }; setItems(arr);
  };

  const addTradeIn = () => setTradeIns([...tradeIns, { description: "", quantity: 1, unit_value: "", restock: false, product_id: null, sku: "", note: "" }]);
  const removeTradeIn = (idx) => setTradeIns(tradeIns.filter((_, i) => i !== idx));
  const updateTradeIn = (idx, patch) => { const arr = [...tradeIns]; arr[idx] = { ...arr[idx], ...patch }; setTradeIns(arr); };

  const submit = async () => {
    if (!customerId) return toast.error("Select a customer");
    const valid = items.filter((i) => i.product_id && Number(i.quantity) > 0);
    if (!valid.length) return toast.error("Add at least one product");
    const tiPayload = (tradeIns || []).filter((ti) => ti.description && Number(ti.unit_value) >= 0)
      .map((ti) => ({
        description: ti.description, quantity: Number(ti.quantity || 1), unit_value: Number(ti.unit_value || 0),
        restock: !!ti.restock, product_id: ti.product_id || null, sku: ti.sku || "", note: ti.note || "",
      }));
    try {
      const itemsPayload = valid.map((i) => ({ product_id: i.product_id, quantity: Number(i.quantity) }));
      if (isEdit) {
        const { data } = await api.patch(`/orders/${id}`, {
          customer_id: customerId,
          items: itemsPayload,
          trade_ins: tiPayload,
          credit_applied: Number(creditApplied) || 0,
          notes,
        });
        toast.success(`${data.number} updated`);
        nav(isAgent ? "/agent/sales" : `/admin/orders/${data.id}`);
      } else {
        const { data } = await api.post("/orders", {
          customer_id: customerId, type, notes,
          items: itemsPayload,
          trade_ins: tiPayload,
          credit_applied: Number(creditApplied) || 0,
        });
        toast.success(`${data.number} created`);
        nav(isAgent ? "/agent/sales" : `/admin/orders/${data.id}`);
      }
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const availableCredit = preview?.available_credit ?? customer?.credit_balance ?? 0;

  return (
    <div className="p-8 max-w-[1200px] mx-auto" data-testid="order-form-page">
      <button onClick={() => nav(-1)} className="overline flex items-center gap-1 mb-3 hover:text-[var(--primary)]">
        <ChevronLeft size={14}/>Back
      </button>
      <h1 className="font-display text-4xl tracking-tighter">
        {isEdit ? `Edit ${originalOrder?.number || "…"}` : "New Sales Document"}
      </h1>
      <p className="text-sm text-[var(--text-muted)] mt-1 mb-6">
        {isEdit ? "Edits adjust stock and customer credit automatically." : "Create a quote, order, or invoice with auto-applied pricing."}
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="surface-card p-6">
            <p className="overline mb-4">Header</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="overline">Customer</Label>
                <Select value={customerId} onValueChange={setCustomerId} disabled={isEdit}>
                  <SelectTrigger className="mt-2" data-testid="order-customer-select"><SelectValue placeholder="Choose customer"/></SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.company || c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {customer && (
                  <div className="text-xs text-[var(--text-muted)] mt-2 font-mono">
                    Net-{customer.payment_terms_days} · Credit avail: {formatCurrency(customer.credit_balance || 0)}
                  </div>
                )}
              </div>
              <div>
                <Label className="overline">Document type</Label>
                <Select value={type} onValueChange={setType} disabled={isEdit}>
                  <SelectTrigger className="mt-2" data-testid="order-type-select"><SelectValue/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="quote">Quote</SelectItem>
                    <SelectItem value="order">Sales Order</SelectItem>
                    <SelectItem value="invoice">Invoice</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="surface-card p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="overline">Line items</p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setScanOpen(true)} data-testid="order-scan-button"><ScanLine size={14} className="mr-1"/>Scan</Button>
                <Button variant="ghost" size="sm" onClick={addLine} data-testid="add-line-button"><Plus size={14} className="mr-1"/>Add line</Button>
              </div>
            </div>
            <div className="space-y-2">
              {items.map((it, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-7">
                    <Select value={it.product_id} onValueChange={(v) => updateLine(idx, { product_id: v })}>
                      <SelectTrigger data-testid={`line-product-${idx}`}><SelectValue placeholder="Choose product"/></SelectTrigger>
                      <SelectContent>
                        {products.map((p) => <SelectItem key={p.id} value={p.id}><span className="font-mono text-xs mr-2">{p.sku}</span>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-3">
                    <Input type="number" min="1" placeholder="Qty" value={it.quantity}
                      onChange={(e) => updateLine(idx, { quantity: e.target.value })}
                      data-testid={`line-qty-${idx}`}/>
                  </div>
                  <div className="col-span-2 flex justify-end">
                    <Button variant="ghost" size="icon" onClick={() => removeLine(idx)}><Trash2 size={14}/></Button>
                  </div>
                </div>
              ))}
              {!items.length && <div className="text-center py-8 text-sm text-[var(--text-muted)]">No lines yet. Click "Add line".</div>}
            </div>
          </div>

          {/* Trade-ins */}
          <div className="surface-card p-6" data-testid="trade-ins-section">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Repeat size={14} className="text-[var(--primary)]"/>
                <p className="overline">Trade-in</p>
              </div>
              <Button variant="ghost" size="sm" onClick={addTradeIn} data-testid="add-tradein-button"><Plus size={14} className="mr-1"/>Add trade-in</Button>
            </div>
            <p className="text-xs text-[var(--text-muted)] mb-3">Items the customer is trading in. Their value is deducted from this order's total.</p>
            <div className="space-y-3">
              {tradeIns.map((ti, idx) => (
                <div key={idx} className="border border-[var(--border)] rounded-md p-3 space-y-2">
                  <div className="grid grid-cols-12 gap-2">
                    <Input className="col-span-6" placeholder="Description (e.g. Old returnable boxes)" value={ti.description}
                      onChange={(e) => updateTradeIn(idx, { description: e.target.value })} data-testid={`tradein-desc-${idx}`}/>
                    <Input className="col-span-2" type="number" min="1" placeholder="Qty" value={ti.quantity}
                      onChange={(e) => updateTradeIn(idx, { quantity: e.target.value })}/>
                    <Input className="col-span-3" type="number" step="0.01" placeholder="Unit value" value={ti.unit_value}
                      onChange={(e) => updateTradeIn(idx, { unit_value: e.target.value })} data-testid={`tradein-value-${idx}`}/>
                    <div className="col-span-1 flex justify-end">
                      <Button variant="ghost" size="icon" onClick={() => removeTradeIn(idx)}><Trash2 size={14}/></Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Switch checked={!!ti.restock} onCheckedChange={(v) => updateTradeIn(idx, { restock: v })} data-testid={`tradein-restock-${idx}`}/>
                      <span className="text-xs">Restock to inventory</span>
                    </div>
                    {ti.restock && (
                      <Select value={ti.product_id || ""} onValueChange={(v) => updateTradeIn(idx, { product_id: v })}>
                        <SelectTrigger className="w-64 h-9"><SelectValue placeholder="Map to product"/></SelectTrigger>
                        <SelectContent>
                          {products.map((p) => <SelectItem key={p.id} value={p.id}><span className="font-mono text-xs mr-2">{p.sku}</span>{p.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
              ))}
              {!tradeIns.length && <div className="text-xs text-[var(--text-muted)] italic">No trade-ins on this order.</div>}
            </div>
          </div>

          {/* Customer credit */}
          {customer && availableCredit > 0 && (
            <div className="surface-card p-6" data-testid="credit-section">
              <div className="flex items-center gap-2 mb-3">
                <Wallet size={14} className="text-[var(--primary)]"/>
                <p className="overline">Apply customer credit</p>
              </div>
              <div className="flex items-center gap-3">
                <Input type="number" step="0.01" min="0" max={availableCredit}
                  value={creditApplied} onChange={(e) => setCreditApplied(e.target.value)}
                  className="w-40 font-mono" data-testid="credit-applied-input"/>
                <span className="text-xs text-[var(--text-muted)] font-mono">
                  / {formatCurrency(availableCredit)} available
                </span>
                <Button variant="ghost" size="sm" onClick={() => setCreditApplied(availableCredit)}>Use all</Button>
              </div>
            </div>
          )}

          <div className="surface-card p-6">
            <Label className="overline">Notes</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-2"/>
          </div>
        </div>

        {/* Summary */}
        <aside className="surface-card p-6 h-fit sticky top-4">
          <p className="overline mb-4">Summary</p>
          <div className="space-y-2">
            {(preview?.items || []).map((p) => (
              <div key={p.product_id} className="flex justify-between text-sm gap-2">
                <div className="min-w-0">
                  <div className="font-medium truncate">{p.name}</div>
                  <div className="text-xs text-[var(--text-muted)] font-mono">{p.quantity} × {formatCurrency(p.unit_price)}</div>
                </div>
                <div className="font-mono">{formatCurrency(p.line_total)}</div>
              </div>
            ))}
            {!preview?.items?.length && <div className="text-sm text-[var(--text-muted)]">Choose customer and add lines.</div>}
          </div>
          <div className="border-t border-[var(--border)] mt-5 pt-4 space-y-1 text-sm">
            <Row label="Subtotal" value={formatCurrency(preview?.subtotal || 0)} />
            {(preview?.trade_in_total || 0) > 0 && (
              <Row label="Trade-in" value={`− ${formatCurrency(preview.trade_in_total)}`} accent />
            )}
            {(preview?.credit_applied || 0) > 0 && (
              <Row label="Credit applied" value={`− ${formatCurrency(preview.credit_applied)}`} accent />
            )}
            <div className="flex justify-between font-display text-2xl tracking-tight pt-2 border-t border-[var(--border)] mt-2">
              <span>Total</span>
              <span>{formatCurrency(preview?.total || 0)}</span>
            </div>
          </div>
          <Button onClick={submit} disabled={!preview}
            className="w-full mt-5 h-11 bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white"
            data-testid="submit-order-button">
            {isEdit ? "Save changes" : `Create ${type}`}
          </Button>
        </aside>
      </div>

      <BarcodeScanner open={scanOpen} onOpenChange={setScanOpen} onDetected={handleScan} title="Scan product to add"/>
    </div>
  );
}

const Row = ({ label, value, accent }) => (
  <div className="flex justify-between">
    <span className={accent ? "text-[var(--primary)]" : "text-[var(--text-muted)]"}>{label}</span>
    <span className={`font-mono ${accent ? "text-[var(--primary)]" : ""}`}>{value}</span>
  </div>
);
