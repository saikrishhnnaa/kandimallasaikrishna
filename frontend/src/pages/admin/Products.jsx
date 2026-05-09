import React, { useEffect, useState } from "react";
import { api, formatApiError, formatCurrency } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "../../components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, X, ScanLine } from "lucide-react";
import BarcodeScanner from "../../components/BarcodeScanner";

const empty = {
  sku: "", barcode: "", name: "", description: "", category: "General", unit: "pcs",
  base_price: 0, stock: 0, low_stock_threshold: 10, tiers: [],
};

export default function Products() {
  const [list, setList] = useState([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [scanOpen, setScanOpen] = useState(false);

  const load = () => api.get("/products").then((r) => setList(r.data));
  useEffect(() => { load(); }, []);

  const filtered = list.filter((p) =>
    [p.name, p.sku, p.category].join(" ").toLowerCase().includes(search.toLowerCase())
  );

  const startCreate = () => { setEditing(null); setForm(empty); setOpen(true); };
  const startEdit = (p) => { setEditing(p); setForm({ ...p, tiers: p.tiers || [] }); setOpen(true); };

  const submit = async () => {
    try {
      const payload = {
        ...form,
        base_price: Number(form.base_price),
        stock: Number(form.stock),
        low_stock_threshold: Number(form.low_stock_threshold),
        tiers: (form.tiers || [])
          .filter((t) => t.min_qty && t.price)
          .map((t) => ({ min_qty: Number(t.min_qty), price: Number(t.price) })),
      };
      if (editing) await api.patch(`/products/${editing.id}`, payload);
      else await api.post("/products", payload);
      toast.success(editing ? "Product updated" : "Product created");
      setOpen(false); load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const del = async (p) => {
    if (!window.confirm(`Delete ${p.name}?`)) return;
    try { await api.delete(`/products/${p.id}`); toast.success("Deleted"); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div className="p-8 max-w-[1400px] mx-auto" data-testid="products-page">
      <div className="flex items-end justify-between mb-6">
        <div>
          <p className="overline">Catalog</p>
          <h1 className="font-display text-4xl tracking-tighter mt-1">Products</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">{list.length} items</p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Search SKU, name, category…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-72 h-10"
            data-testid="products-search"
          />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={startCreate} data-testid="new-product-button" className="h-10 bg-[var(--primary)] hover:bg-[var(--primary-hover)]">
                <Plus size={16} className="mr-1.5" />New Product
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-display text-2xl tracking-tight">
                  {editing ? "Edit product" : "New product"}
                </DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-4 mt-3">
                <Field label="SKU"><Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} data-testid="product-sku-input"/></Field>
                <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="product-name-input"/></Field>
                <div className="col-span-2">
                  <Label className="overline">Barcode (UPC / EAN / Code128)</Label>
                  <div className="mt-2 flex gap-2">
                    <Input
                      value={form.barcode}
                      onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                      placeholder="Scan or type — leave blank to use SKU"
                      className="flex-1 font-mono"
                      data-testid="product-barcode-input"
                    />
                    <Button type="button" variant="outline" onClick={() => setScanOpen(true)} data-testid="product-scan-button">
                      <ScanLine size={14} className="mr-1.5"/>Scan
                    </Button>
                  </div>
                </div>
                <Field label="Category"><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}/></Field>
                <Field label="Unit"><Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}/></Field>
                <Field label="Base price"><Input type="number" step="0.01" value={form.base_price} onChange={(e) => setForm({ ...form, base_price: e.target.value })} data-testid="product-price-input"/></Field>
                <Field label="Stock"><Input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} data-testid="product-stock-input"/></Field>
                <Field label="Low-stock threshold"><Input type="number" value={form.low_stock_threshold} onChange={(e) => setForm({ ...form, low_stock_threshold: e.target.value })}/></Field>
                <div className="col-span-2">
                  <Label className="overline">Description</Label>
                  <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-2"/>
                </div>
                <div className="col-span-2">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="overline">Bulk price tiers</Label>
                    <Button type="button" variant="ghost" size="sm"
                      onClick={() => setForm({ ...form, tiers: [...(form.tiers || []), { min_qty: "", price: "" }] })}>
                      + Add tier
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {(form.tiers || []).map((t, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <Input placeholder="Min qty" type="number" value={t.min_qty}
                          onChange={(e) => {
                            const tiers = [...form.tiers]; tiers[idx] = { ...tiers[idx], min_qty: e.target.value };
                            setForm({ ...form, tiers });
                          }} className="w-32"/>
                        <Input placeholder="Unit price" type="number" step="0.01" value={t.price}
                          onChange={(e) => {
                            const tiers = [...form.tiers]; tiers[idx] = { ...tiers[idx], price: e.target.value };
                            setForm({ ...form, tiers });
                          }} className="w-40"/>
                        <Button type="button" variant="ghost" size="icon"
                          onClick={() => setForm({ ...form, tiers: form.tiers.filter((_, i) => i !== idx) })}>
                          <X size={16}/>
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter className="mt-4">
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={submit} className="bg-[var(--primary)] hover:bg-[var(--primary-hover)]" data-testid="save-product-button">Save</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <BarcodeScanner
        open={scanOpen}
        onOpenChange={setScanOpen}
        onDetected={(code) => { setForm((f) => ({ ...f, barcode: code })); toast.success(`Captured: ${code}`); }}
        title="Capture product barcode"
      />

      <div className="surface-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-black/[0.02]">
            <tr className="text-left border-b border-[var(--border)]">
              {["SKU", "Barcode", "Name", "Category", "Stock", "Base price", "Tiers", ""].map((h) => (
                <th key={h} className="px-4 py-3 overline text-[var(--text-muted)] font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className="border-b border-[var(--border)] last:border-0 hover:bg-black/[0.015]">
                <td className="px-4 py-3 font-mono text-xs">{p.sku}</td>
                <td className="px-4 py-3 font-mono text-xs text-[var(--text-muted)]">{p.barcode || "—"}</td>
                <td className="px-4 py-3 font-medium">{p.name}</td>
                <td className="px-4 py-3 text-[var(--text-muted)]">{p.category}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-mono px-2 py-0.5 rounded ${p.stock <= p.low_stock_threshold ? "bg-[var(--danger)]/10 text-[var(--danger)]" : "bg-black/5"}`}>
                    {p.stock} {p.unit}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono">{formatCurrency(p.base_price)}</td>
                <td className="px-4 py-3 text-xs text-[var(--text-muted)]">{p.tiers?.length || 0}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" onClick={() => startEdit(p)} data-testid={`edit-product-${p.sku}`}><Pencil size={14}/></Button>
                    <Button size="icon" variant="ghost" onClick={() => del(p)}><Trash2 size={14}/></Button>
                  </div>
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-[var(--text-muted)]">No products yet. Click "New Product" to add one.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const Field = ({ label, children }) => (
  <div>
    <Label className="overline">{label}</Label>
    <div className="mt-2">{children}</div>
  </div>
);
