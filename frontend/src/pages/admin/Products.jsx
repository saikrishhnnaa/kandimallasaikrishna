import React, { useEffect, useState } from "react";
import { api, formatApiError, formatCurrency } from "../../lib/api";
import { compressToDataUrl } from "../../lib/imageUtils";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "../../components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, X, ScanLine, Upload, Star, FileDown, FileUp } from "lucide-react";
import BarcodeScanner from "../../components/BarcodeScanner";

const empty = {
  sku: "", barcode: "", name: "", description: "", category: "General", unit: "pcs",
  base_price: 0, stock: 0, low_stock_threshold: 10, tiers: [], images: [],
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
  const startEdit = (p) => { setEditing(p); setForm({ ...p, tiers: p.tiers || [], variants: p.variants || [], images: p.images || [] }); setOpen(true); };

  const addImages = async (files) => {
    const arr = Array.from(files || []);
    if (!arr.length) return;
    try {
      const out = [];
      for (const f of arr) {
        if (!f.type.startsWith("image/")) continue;
        const dataUrl = await compressToDataUrl(f);
        out.push({
          id: crypto.randomUUID(),
          data_url: dataUrl,
          filename: f.name,
          is_primary: false,
        });
      }
      setForm((f) => {
        const existing = f.images || [];
        const merged = [...existing, ...out];
        if (!merged.some((i) => i.is_primary) && merged.length) merged[0].is_primary = true;
        return { ...f, images: merged };
      });
    } catch (e) { toast.error("Image upload failed: " + (e?.message || e)); }
  };

  const setPrimary = (id) => {
    setForm((f) => ({ ...f, images: (f.images || []).map((i) => ({ ...i, is_primary: i.id === id })) }));
  };
  const removeImage = (id) => {
    setForm((f) => {
      const next = (f.images || []).filter((i) => i.id !== id);
      if (next.length && !next.some((i) => i.is_primary)) next[0].is_primary = true;
      return { ...f, images: next };
    });
  };

  const submit = async () => {
    try {
      const payload = {
        ...form,
        base_price: Number(form.base_price),
        msrp: form.msrp === "" || form.msrp == null ? null : Number(form.msrp),
        distribution_price: form.distribution_price === "" || form.distribution_price == null ? null : Number(form.distribution_price),
        wholesale_price: form.wholesale_price === "" || form.wholesale_price == null ? null : Number(form.wholesale_price),
        stock: Number(form.stock),
        low_stock_threshold: Number(form.low_stock_threshold),
        tiers: (form.tiers || [])
          .filter((t) => t.min_qty && t.price)
          .map((t) => ({ min_qty: Number(t.min_qty), price: Number(t.price) })),
        variants: (form.variants || [])
          .filter((v) => v.label && v.sku)
          .map((v) => ({
            id: v.id || crypto.randomUUID(),
            label: v.label,
            sku: v.sku,
            barcode: v.barcode || "",
            price: Number(v.price || 0),
            stock: Number(v.stock || 0),
            low_stock_threshold: Number(v.low_stock_threshold || 10),
            active: v.active !== false,
          })),
        images: (form.images || []).map((i) => ({
          id: i.id || crypto.randomUUID(),
          data_url: i.data_url,
          filename: i.filename || "",
          is_primary: !!i.is_primary,
        })),
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

  const exportCsv = async () => {
    try {
      const r = await api.get("/products/export", { responseType: "blob" });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `products-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const importCsv = async (file) => {
    if (!file) return;
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/products/import", fd, { headers: { "Content-Type": "multipart/form-data" } });
      const summary = `Created ${data.created} · Updated ${data.updated}` + (data.errors?.length ? ` · ${data.errors.length} error(s)` : "");
      if (data.errors?.length) {
        toast.error(`${summary}\nFirst: row ${data.errors[0].row} — ${data.errors[0].error}`, { duration: 8000 });
      } else {
        toast.success(summary);
      }
      load();
    } catch (e) { toast.error(formatApiError(e)); }
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
          <Button variant="outline" onClick={exportCsv} className="h-10" data-testid="products-export-button">
            <FileDown size={14} className="mr-1.5"/>Export
          </Button>
          <label>
            <input type="file" accept=".csv" className="hidden"
              onChange={(e) => { importCsv(e.target.files?.[0]); e.target.value = ""; }}
              data-testid="products-import-input"/>
            <span className="cursor-pointer inline-flex items-center text-sm h-10 px-3 rounded-md border border-[var(--border)] hover:bg-black/5">
              <FileUp size={14} className="mr-1.5"/>Import
            </span>
          </label>
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
                <div className="col-span-2 border-t border-[var(--border)] pt-4 mt-2">
                  <p className="overline mb-1">Pricing tiers (named)</p>
                  <p className="text-xs text-[var(--text-muted)] mb-3">One-click pricing options shown next to each line on the invoice. Leave blank to hide a tier.</p>
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="MSRP">
                      <Input type="number" step="0.01" value={form.msrp ?? ""} onChange={(e) => setForm({ ...form, msrp: e.target.value })} data-testid="product-msrp-input" placeholder="—"/>
                    </Field>
                    <Field label="Distribution">
                      <Input type="number" step="0.01" value={form.distribution_price ?? ""} onChange={(e) => setForm({ ...form, distribution_price: e.target.value })} data-testid="product-distribution-input" placeholder="—"/>
                    </Field>
                    <Field label="Wholesale">
                      <Input type="number" step="0.01" value={form.wholesale_price ?? ""} onChange={(e) => setForm({ ...form, wholesale_price: e.target.value })} data-testid="product-wholesale-input" placeholder="—"/>
                    </Field>
                  </div>
                </div>
                <div className="col-span-2">
                  <Label className="overline">Description</Label>
                  <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-2"/>
                </div>
                <div className="col-span-2 border-t border-[var(--border)] pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <Label className="overline">Photos</Label>
                      <p className="text-xs text-[var(--text-muted)] mt-1">Click the star to set the primary image. Auto-resized to 800px.</p>
                    </div>
                    <label className="cursor-pointer">
                      <input type="file" accept="image/*" multiple className="hidden"
                        onChange={(e) => { addImages(e.target.files); e.target.value = ""; }}
                        data-testid="product-image-input"/>
                      <span className="inline-flex items-center text-sm h-9 px-3 rounded-md hover:bg-black/5 border border-[var(--border)]">
                        <Upload size={14} className="mr-1.5"/>Upload
                      </span>
                    </label>
                  </div>
                  <div className="grid grid-cols-6 gap-2">
                    {(form.images || []).map((img) => (
                      <div key={img.id} className="relative group aspect-square rounded-md overflow-hidden border border-[var(--border)] bg-black/[0.02]">
                        <img src={img.data_url} alt={img.filename} className="w-full h-full object-cover"/>
                        <button type="button" onClick={() => setPrimary(img.id)}
                          className={`absolute top-1 left-1 w-6 h-6 rounded-full flex items-center justify-center ${img.is_primary ? "bg-[var(--primary)] text-white" : "bg-white/90 text-[var(--text-muted)] hover:text-[var(--primary)]"}`}
                          data-testid={`product-image-primary-${img.id}`}
                          title={img.is_primary ? "Primary image" : "Set as primary"}>
                          <Star size={12} fill={img.is_primary ? "currentColor" : "none"}/>
                        </button>
                        <button type="button" onClick={() => removeImage(img.id)}
                          className="absolute top-1 right-1 w-6 h-6 rounded-full bg-white/90 text-[var(--danger)] hover:bg-[var(--danger)] hover:text-white flex items-center justify-center"
                          data-testid={`product-image-remove-${img.id}`}>
                          <X size={12}/>
                        </button>
                      </div>
                    ))}
                    {!form.images?.length && (
                      <div className="col-span-6 text-xs text-[var(--text-muted)] italic py-3">No photos yet.</div>
                    )}
                  </div>
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

                <div className="col-span-2 border-t border-[var(--border)] pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <Label className="overline">Variants (sizes / flavours)</Label>
                      <p className="text-xs text-[var(--text-muted)] mt-1">Each variant has its own SKU, price and stock.</p>
                    </div>
                    <Button type="button" variant="ghost" size="sm" data-testid="add-variant-button"
                      onClick={() => setForm({ ...form, variants: [...(form.variants || []), { id: crypto.randomUUID(), label: "", sku: "", barcode: "", price: form.base_price, stock: 0, low_stock_threshold: 10, active: true }] })}>
                      + Add variant
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {(form.variants || []).map((v, idx) => (
                      <div key={v.id || idx} className="grid grid-cols-12 gap-2">
                        <Input className="col-span-3" placeholder="Label (e.g. 500ml)" value={v.label}
                          data-testid={`variant-label-${idx}`}
                          onChange={(e) => { const arr = [...form.variants]; arr[idx] = { ...arr[idx], label: e.target.value }; setForm({ ...form, variants: arr }); }}/>
                        <Input className="col-span-2 font-mono" placeholder="SKU" value={v.sku}
                          onChange={(e) => { const arr = [...form.variants]; arr[idx] = { ...arr[idx], sku: e.target.value }; setForm({ ...form, variants: arr }); }}/>
                        <Input className="col-span-3 font-mono text-xs" placeholder="Barcode (optional)" value={v.barcode || ""}
                          onChange={(e) => { const arr = [...form.variants]; arr[idx] = { ...arr[idx], barcode: e.target.value }; setForm({ ...form, variants: arr }); }}/>
                        <Input className="col-span-1 font-mono" placeholder="Price" type="number" step="0.01" value={v.price}
                          onChange={(e) => { const arr = [...form.variants]; arr[idx] = { ...arr[idx], price: e.target.value }; setForm({ ...form, variants: arr }); }}/>
                        <Input className="col-span-2 font-mono" placeholder="Stock" type="number" value={v.stock}
                          onChange={(e) => { const arr = [...form.variants]; arr[idx] = { ...arr[idx], stock: e.target.value }; setForm({ ...form, variants: arr }); }}/>
                        <Button type="button" variant="ghost" size="icon" className="col-span-1"
                          onClick={() => setForm({ ...form, variants: form.variants.filter((_, i) => i !== idx) })}>
                          <X size={16}/>
                        </Button>
                      </div>
                    ))}
                    {!form.variants?.length && (
                      <p className="text-xs text-[var(--text-muted)] italic">No variants. The product will be sold as a single SKU.</p>
                    )}
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
              {["", "SKU", "Barcode", "Name", "Category", "Stock", "Base price", "Variants", ""].map((h, i) => (
                <th key={i} className="px-4 py-3 overline text-[var(--text-muted)] font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => {
              const primary = (p.images || []).find((i) => i.is_primary) || (p.images || [])[0];
              return (
              <tr key={p.id} className="border-b border-[var(--border)] last:border-0 hover:bg-black/[0.015]">
                <td className="px-4 py-3">
                  {primary ? (
                    <img src={primary.data_url} alt="" className="w-10 h-10 rounded object-cover border border-[var(--border)]" data-testid={`product-thumb-${p.sku}`}/>
                  ) : (
                    <div className="w-10 h-10 rounded bg-black/[0.04] border border-[var(--border)]"/>
                  )}
                </td>
                <td className="px-4 py-3 font-mono text-xs">{p.sku}</td>
                <td className="px-4 py-3 font-mono text-xs text-[var(--text-muted)]">{p.barcode || "—"}</td>
                <td className="px-4 py-3 font-medium">{p.name}</td>
                <td className="px-4 py-3 text-[var(--text-muted)]">{p.category}</td>
                <td className="px-4 py-3">
                  {p.variants?.length > 0 ? (
                    <div>
                      <div className="text-[10px] font-mono text-[var(--text-muted)]">Sum: {p.variants.reduce((s, v) => s + (v.stock || 0), 0)} {p.unit}</div>
                      <div className="text-[10px] font-mono text-[var(--text-muted)] mt-0.5">Variants ↓</div>
                    </div>
                  ) : (
                    <span className={`text-xs font-mono px-2 py-0.5 rounded ${p.stock <= p.low_stock_threshold ? "bg-[var(--danger)]/10 text-[var(--danger)]" : "bg-black/5"}`}>
                      {p.stock} {p.unit}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 font-mono">{p.variants?.length > 0 ? <span className="text-[var(--text-muted)]">from {formatCurrency(Math.min(...p.variants.map((v) => v.price)))}</span> : formatCurrency(p.base_price)}</td>
                <td className="px-4 py-3 text-xs text-[var(--text-muted)]">{p.variants?.length > 0 ? `${p.variants.length} variants · ${p.tiers?.length || 0} tiers` : `${p.tiers?.length || 0} tiers`}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" onClick={() => startEdit(p)} data-testid={`edit-product-${p.sku}`}><Pencil size={14}/></Button>
                    <Button size="icon" variant="ghost" onClick={() => del(p)}><Trash2 size={14}/></Button>
                  </div>
                </td>
              </tr>
              );
            })}
            {!filtered.length && (
              <tr><td colSpan={9} className="px-4 py-10 text-center text-[var(--text-muted)]">No products yet. Click "New Product" to add one.</td></tr>
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
