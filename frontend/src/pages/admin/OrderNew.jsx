import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { api, formatApiError, formatCurrency } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../../components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, ChevronLeft, ScanLine } from "lucide-react";
import BarcodeScanner from "../../components/BarcodeScanner";
import { useUsbScanner } from "../../hooks/useUsbScanner";

export default function OrderNew() {
  const nav = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [customerId, setCustomerId] = useState("");
  const [items, setItems] = useState([]);
  const [type, setType] = useState("order");
  const [notes, setNotes] = useState("");
  const [preview, setPreview] = useState(null);
  const [scanOpen, setScanOpen] = useState(false);

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
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  // USB hardware scanner (HID keyboard) — captures global keystrokes
  useUsbScanner(handleScan, true);

  useEffect(() => {
    api.get("/customers").then((r) => setCustomers(r.data));
    api.get("/products").then((r) => setProducts(r.data));
  }, []);

  // Preview pricing whenever customer or items change
  useEffect(() => {
    if (!customerId || !items.length) { setPreview(null); return; }
    const valid = items.filter((i) => i.product_id && Number(i.quantity) > 0);
    if (!valid.length) { setPreview(null); return; }
    api.post("/pricing/preview", {
      customer_id: customerId,
      items: valid.map((i) => ({ product_id: i.product_id, quantity: Number(i.quantity) })),
    }).then((r) => setPreview(r.data)).catch(() => setPreview(null));
  }, [customerId, items]);

  const customer = useMemo(() => customers.find((c) => c.id === customerId), [customers, customerId]);

  const addLine = () => setItems([...items, { product_id: "", quantity: 1 }]);
  const removeLine = (idx) => setItems(items.filter((_, i) => i !== idx));
  const updateLine = (idx, patch) => {
    const arr = [...items]; arr[idx] = { ...arr[idx], ...patch }; setItems(arr);
  };

  const submit = async () => {
    if (!customerId) return toast.error("Select a customer");
    const valid = items.filter((i) => i.product_id && Number(i.quantity) > 0);
    if (!valid.length) return toast.error("Add at least one product");
    try {
      const { data } = await api.post("/orders", {
        customer_id: customerId, type, notes,
        items: valid.map((i) => ({ product_id: i.product_id, quantity: Number(i.quantity) })),
      });
      toast.success(`${data.number} created`);
      nav(`/admin/orders/${data.id}`);
    } catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div className="p-8 max-w-[1200px] mx-auto" data-testid="order-new-page">
      <button onClick={() => nav(-1)} className="overline flex items-center gap-1 mb-3 hover:text-[var(--primary)]">
        <ChevronLeft size={14}/>Back
      </button>
      <h1 className="font-display text-4xl tracking-tighter">New Sales Document</h1>
      <p className="text-sm text-[var(--text-muted)] mt-1 mb-6">Create a quote, order, or invoice with auto-applied pricing.</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="surface-card p-6">
            <p className="overline mb-4">Header</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="overline">Customer</Label>
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger className="mt-2" data-testid="order-customer-select"><SelectValue placeholder="Choose customer"/></SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.company || c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {customer && (
                  <div className="text-xs text-[var(--text-muted)] mt-2 font-mono">
                    Net-{customer.payment_terms_days} · Credit {formatCurrency(customer.credit_limit)}
                  </div>
                )}
              </div>
              <div>
                <Label className="overline">Document type</Label>
                <Select value={type} onValueChange={setType}>
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
                <Button variant="outline" size="sm" onClick={() => setScanOpen(true)} data-testid="order-scan-button">
                  <ScanLine size={14} className="mr-1"/>Scan
                </Button>
                <Button variant="ghost" size="sm" onClick={addLine} data-testid="add-line-button">
                  <Plus size={14} className="mr-1"/>Add line
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              {items.map((it, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-7">
                    <Select value={it.product_id} onValueChange={(v) => updateLine(idx, { product_id: v })}>
                      <SelectTrigger data-testid={`line-product-${idx}`}><SelectValue placeholder="Choose product"/></SelectTrigger>
                      <SelectContent>
                        {products.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            <span className="font-mono text-xs mr-2">{p.sku}</span>{p.name}
                          </SelectItem>
                        ))}
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
              {!items.length && (
                <div className="text-center py-8 text-sm text-[var(--text-muted)]">
                  No lines yet. Click "Add line".
                </div>
              )}
            </div>
          </div>

          <div className="surface-card p-6">
            <Label className="overline">Notes</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-2"/>
          </div>
        </div>

        {/* Summary */}
        <aside className="surface-card p-6 h-fit sticky top-4">
          <p className="overline mb-4">Summary</p>
          <div className="space-y-3">
            {(preview?.items || []).map((p) => (
              <div key={p.product_id} className="flex justify-between text-sm gap-2">
                <div className="min-w-0">
                  <div className="font-medium truncate">{p.name}</div>
                  <div className="text-xs text-[var(--text-muted)] font-mono">{p.quantity} × {formatCurrency(p.unit_price)}</div>
                </div>
                <div className="font-mono">{formatCurrency(p.line_total)}</div>
              </div>
            ))}
            {!preview && <div className="text-sm text-[var(--text-muted)]">Choose customer and add lines to preview pricing.</div>}
          </div>
          <div className="border-t border-[var(--border)] mt-5 pt-4 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-muted)]">Subtotal</span>
              <span className="font-mono">{formatCurrency(preview?.subtotal || 0)}</span>
            </div>
            <div className="flex justify-between font-display text-2xl tracking-tight pt-2">
              <span>Total</span>
              <span>{formatCurrency(preview?.total || 0)}</span>
            </div>
          </div>
          <Button onClick={submit} disabled={!preview}
            className="w-full mt-5 h-11 bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white"
            data-testid="submit-order-button">
            Create {type}
          </Button>
        </aside>
      </div>
    </div>
  );
}
