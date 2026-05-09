import React, { useEffect, useState } from "react";
import { api, formatApiError, formatDate } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "../../components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../../components/ui/select";
import { toast } from "sonner";
import { Plus } from "lucide-react";

const REASONS = [
  { value: "manual_adjustment", label: "Manual adjustment" },
  { value: "stock_in", label: "Stock-in / Receiving" },
  { value: "damaged", label: "Damaged / Loss" },
  { value: "return", label: "Customer return" },
  { value: "recount", label: "Recount correction" },
];

export default function StockMovements() {
  const [list, setList] = useState([]);
  const [products, setProducts] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ product_id: "", qty_delta: "", reason: "stock_in", note: "" });

  const load = () => api.get("/stock-movements").then((r) => setList(r.data));
  useEffect(() => {
    load();
    api.get("/products").then((r) => setProducts(r.data));
  }, []);

  const submit = async () => {
    try {
      await api.post("/stock-movements", { ...form, qty_delta: Number(form.qty_delta) });
      toast.success("Stock adjusted");
      setOpen(false);
      setForm({ product_id: "", qty_delta: "", reason: "stock_in", note: "" });
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div className="p-8 max-w-[1400px] mx-auto" data-testid="stock-movements-page">
      <div className="flex items-end justify-between mb-6">
        <div>
          <p className="overline">Inventory</p>
          <h1 className="font-display text-4xl tracking-tighter mt-1">Stock Movements</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">Audit trail of every stock change.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[var(--primary)] hover:bg-[var(--primary-hover)]" data-testid="new-adjustment-button">
              <Plus size={16} className="mr-1.5"/>Adjust stock
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle className="font-display tracking-tight">Manual stock adjustment</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-2">
              <div><Label className="overline">Product</Label>
                <Select value={form.product_id} onValueChange={(v) => setForm({ ...form, product_id: v })}>
                  <SelectTrigger className="mt-2" data-testid="adjust-product-select"><SelectValue placeholder="Choose product"/></SelectTrigger>
                  <SelectContent>
                    {products.map((p) => <SelectItem key={p.id} value={p.id}><span className="font-mono text-xs mr-2">{p.sku}</span>{p.name} <span className="text-xs text-[var(--text-muted)] ml-2">· {p.stock} in stock</span></SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label className="overline">Quantity delta (use negative to remove)</Label>
                <Input type="number" value={form.qty_delta} onChange={(e) => setForm({ ...form, qty_delta: e.target.value })} className="mt-2 font-mono" data-testid="adjust-qty-input"/>
              </div>
              <div><Label className="overline">Reason</Label>
                <Select value={form.reason} onValueChange={(v) => setForm({ ...form, reason: v })}>
                  <SelectTrigger className="mt-2"><SelectValue/></SelectTrigger>
                  <SelectContent>
                    {REASONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label className="overline">Note</Label>
                <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="mt-2"/>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={submit} className="bg-[var(--primary)] hover:bg-[var(--primary-hover)]" data-testid="save-adjustment-button">Apply</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="surface-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-black/[0.02]">
            <tr className="text-left border-b border-[var(--border)]">
              {["Date", "Product", "Reason", "Reference", "Δ Qty", "Stock after", "By"].map((h) => (
                <th key={h} className="px-4 py-3 overline text-[var(--text-muted)] font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.map((m) => (
              <tr key={m.id} className="border-b border-[var(--border)] last:border-0 hover:bg-black/[0.015]">
                <td className="px-4 py-3 text-xs text-[var(--text-muted)]">{formatDate(m.created_at)}</td>
                <td className="px-4 py-3"><div className="font-medium">{m.name}</div><div className="text-xs font-mono text-[var(--text-muted)]">{m.sku}</div></td>
                <td className="px-4 py-3 text-xs">{m.reason.replace(/_/g, " ")}</td>
                <td className="px-4 py-3 font-mono text-xs text-[var(--text-muted)]">{m.reference || "—"}</td>
                <td className="px-4 py-3 font-mono">
                  <span className={m.qty_delta < 0 ? "text-[var(--danger)]" : "text-[var(--success)]"}>
                    {m.qty_delta > 0 ? "+" : ""}{m.qty_delta}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono">{m.stock_after}</td>
                <td className="px-4 py-3 text-xs text-[var(--text-muted)]">{m.created_by_name}</td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan={7} className="px-4 py-10 text-center text-[var(--text-muted)]">No movements yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
