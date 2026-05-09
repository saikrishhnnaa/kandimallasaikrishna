import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, formatApiError, formatCurrency } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../../components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "../../components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, UserPlus, ScanLine } from "lucide-react";
import BarcodeScanner from "../../components/BarcodeScanner";
import { useUsbScanner } from "../../hooks/useUsbScanner";

export default function AgentNewOrder() {
  const nav = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [customerId, setCustomerId] = useState("");
  const [items, setItems] = useState([]);
  const [preview, setPreview] = useState(null);
  const [newCust, setNewCust] = useState({ name: "", company: "", phone: "", email: "" });
  const [custOpen, setCustOpen] = useState(false);
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
    } catch (e) { toast.error(formatApiError(e)); }
  };

  useUsbScanner(handleScan, true);

  const load = async () => {
    const [c, p] = await Promise.all([api.get("/customers"), api.get("/products")]);
    setCustomers(c.data); setProducts(p.data);
  };
  useEffect(() => { load(); }, []);

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

  const createCustomer = async () => {
    try {
      const { data } = await api.post("/customers", { ...newCust, payment_terms_days: 30, credit_limit: 0 });
      toast.success("Customer created");
      await load();
      setCustomerId(data.id); setCustOpen(false); setNewCust({ name: "", company: "", phone: "", email: "" });
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const submit = async () => {
    if (!customerId) return toast.error("Select a customer");
    const valid = items.filter((i) => i.product_id && Number(i.quantity) > 0);
    if (!valid.length) return toast.error("Add a product");
    try {
      const { data } = await api.post("/orders", {
        customer_id: customerId, type: "order", notes: "",
        items: valid.map((i) => ({ product_id: i.product_id, quantity: Number(i.quantity) })),
      });
      toast.success(`${data.number} created`);
      nav("/agent/sales");
    } catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div className="p-4 pb-32" data-testid="agent-new-order">
      <p className="overline">Onsite</p>
      <h1 className="font-display text-3xl tracking-tighter mt-1 mb-4">New Order</h1>

      {/* Customer */}
      <div className="surface-card p-4 mb-3">
        <div className="flex items-center justify-between mb-2">
          <Label className="overline">Customer</Label>
          <Dialog open={custOpen} onOpenChange={setCustOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" data-testid="agent-add-customer-button"><UserPlus size={14} className="mr-1"/>Add</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle className="font-display tracking-tight">Quick add customer</DialogTitle></DialogHeader>
              <div className="space-y-3 mt-2">
                <div><Label className="overline">Company</Label><Input value={newCust.company} onChange={(e) => setNewCust({ ...newCust, company: e.target.value })} className="mt-2"/></div>
                <div><Label className="overline">Contact name</Label><Input value={newCust.name} onChange={(e) => setNewCust({ ...newCust, name: e.target.value })} className="mt-2"/></div>
                <div><Label className="overline">Phone</Label><Input value={newCust.phone} onChange={(e) => setNewCust({ ...newCust, phone: e.target.value })} className="mt-2"/></div>
                <div><Label className="overline">Email</Label><Input value={newCust.email} onChange={(e) => setNewCust({ ...newCust, email: e.target.value })} className="mt-2"/></div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setCustOpen(false)}>Cancel</Button>
                <Button onClick={createCustomer} className="bg-[var(--primary)] hover:bg-[var(--primary-hover)]">Save</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        <Select value={customerId} onValueChange={setCustomerId}>
          <SelectTrigger className="h-11" data-testid="agent-customer-select"><SelectValue placeholder="Choose customer"/></SelectTrigger>
          <SelectContent>
            {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.company || c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {customer && <div className="text-xs text-[var(--text-muted)] mt-2 font-mono">Net-{customer.payment_terms_days}</div>}
      </div>

      {/* Lines */}
      <div className="surface-card p-4 mb-3">
        <div className="flex items-center justify-between mb-3">
          <Label className="overline">Items</Label>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setScanOpen(true)} data-testid="agent-scan-button">
              <ScanLine size={14} className="mr-1"/>Scan
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setItems([...items, { product_id: "", quantity: 1 }])} data-testid="agent-add-line">
              <Plus size={14} className="mr-1"/>Add
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          {items.map((it, idx) => (
            <div key={idx} className="space-y-2 pb-2 border-b border-[var(--border)] last:border-0 last:pb-0">
              <Select value={it.product_id} onValueChange={(v) => {
                const arr = [...items]; arr[idx] = { ...arr[idx], product_id: v }; setItems(arr);
              }}>
                <SelectTrigger className="h-11"><SelectValue placeholder="Choose product"/></SelectTrigger>
                <SelectContent>
                  {products.map((p) => <SelectItem key={p.id} value={p.id}><span className="font-mono text-xs mr-2">{p.sku}</span>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <Input type="number" min="1" placeholder="Qty" value={it.quantity}
                  onChange={(e) => { const arr = [...items]; arr[idx] = { ...arr[idx], quantity: e.target.value }; setItems(arr); }}/>
                <Button variant="ghost" size="icon" onClick={() => setItems(items.filter((_, i) => i !== idx))}><Trash2 size={14}/></Button>
              </div>
            </div>
          ))}
          {!items.length && <div className="text-center py-6 text-sm text-[var(--text-muted)]">Tap "Add" to start.</div>}
        </div>
      </div>

      {/* Preview */}
      {preview && (
        <div className="surface-card p-4 mb-3">
          <p className="overline mb-2">Preview</p>
          {preview.items.map((p) => (
            <div key={p.product_id} className="flex justify-between text-sm py-1">
              <span className="truncate">{p.name} × {p.quantity}</span>
              <span className="font-mono ml-2">{formatCurrency(p.line_total)}</span>
            </div>
          ))}
          <div className="border-t border-[var(--border)] mt-3 pt-3 flex justify-between font-display text-2xl tracking-tight">
            <span>Total</span>
            <span>{formatCurrency(preview.total)}</span>
          </div>
        </div>
      )}

      <div className="fixed bottom-20 left-0 right-0 max-w-[480px] mx-auto px-4">
        <Button onClick={submit} className="w-full h-12 bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-base font-medium" data-testid="agent-submit-order">
          Place Order {preview ? `· ${formatCurrency(preview.total)}` : ""}
        </Button>
      </div>

      <BarcodeScanner
        open={scanOpen}
        onOpenChange={setScanOpen}
        onDetected={handleScan}
        title="Scan product"
      />
    </div>
  );
}
