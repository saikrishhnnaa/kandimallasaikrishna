import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, formatApiError, formatCurrency } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "../components/ui/sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "../components/ui/dialog";
import { toast } from "sonner";
import {
  Search, ShoppingCart, Plus, Minus, X, SlidersHorizontal, Package, ImageIcon, Trash2,
  Save, FolderOpen,
} from "lucide-react";

const SORTS = [
  { value: "name_asc", label: "Name A→Z" },
  { value: "name_desc", label: "Name Z→A" },
  { value: "price_asc", label: "Price low→high" },
  { value: "price_desc", label: "Price high→low" },
  { value: "newest", label: "Newest first" },
];

function productMinPrice(p) {
  if (p.variants?.length) return Math.min(...p.variants.map((v) => Number(v.price || 0)));
  return Number(p.base_price || 0);
}
function productStock(p) {
  if (p.variants?.length) return p.variants.reduce((s, v) => s + Number(v.stock || 0), 0);
  return Number(p.stock || 0);
}
function primaryImage(p) {
  const imgs = p.images || [];
  return (imgs.find((i) => i.is_primary) || imgs[0])?.data_url || null;
}

export default function Catalog() {
  const nav = useNavigate();
  const { user } = useAuth();
  const isAgent = user?.role === "sales_agent";

  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [jurisdictions, setJurisdictions] = useState([]);

  const [q, setQ] = useState("");
  const [category, setCategory] = useState("__all__");
  const [inStockOnly, setInStockOnly] = useState(false);
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [sort, setSort] = useState("name_asc");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [variantPick, setVariantPick] = useState({}); // product_id -> variant_id
  const [qtyPick, setQtyPick] = useState({}); // product_id -> qty

  const cartStorageKey = `pos_cart_${user?.id || "anon"}`;
  const [cart, setCart] = useState(() => {
    try {
      const raw = localStorage.getItem(cartStorageKey);
      return raw ? JSON.parse(raw) : [];
    } catch (_) { return []; }
  });
  const [cartOpen, setCartOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const [customerId, setCustomerId] = useState(() => {
    try { return localStorage.getItem(`${cartStorageKey}_customer`) || ""; } catch (_) { return ""; }
  });
  const [preview, setPreview] = useState(null);
  const type = "invoice";

  // Drafts
  const [drafts, setDrafts] = useState([]);
  const [saveDraftOpen, setSaveDraftOpen] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [loadDraftOpen, setLoadDraftOpen] = useState(false);
  const [activeDraftId, setActiveDraftId] = useState(null);

  const loadDrafts = () => api.get("/cart-drafts").then((r) => setDrafts(r.data)).catch(() => {});

  // Persist cart and customer to localStorage whenever they change
  useEffect(() => {
    if (!hydrated) { setHydrated(true); return; }
    try { localStorage.setItem(cartStorageKey, JSON.stringify(cart)); } catch (_) { /* ignore */ }
  }, [cart, cartStorageKey, hydrated]);
  useEffect(() => {
    try { localStorage.setItem(`${cartStorageKey}_customer`, customerId); } catch (_) { /* ignore */ }
  }, [customerId, cartStorageKey]);

  useEffect(() => {
    api.get("/products").then((r) => setProducts(r.data));
    api.get("/customers").then((r) => setCustomers(r.data));
    api.get("/tax-jurisdictions").then((r) => setJurisdictions(r.data)).catch(() => {});
    loadDrafts();
  }, []);

  const categories = useMemo(() => {
    const set = new Set();
    products.forEach((p) => p.category && set.add(p.category));
    return Array.from(set).sort();
  }, [products]);

  const filtered = useMemo(() => {
    let arr = products.filter((p) => p.active !== false);
    const term = q.trim().toLowerCase();
    if (term) {
      arr = arr.filter((p) =>
        [p.name, p.sku, p.barcode, p.description, p.category].join(" ").toLowerCase().includes(term)
      );
    }
    if (category !== "__all__") arr = arr.filter((p) => p.category === category);
    if (inStockOnly) arr = arr.filter((p) => productStock(p) > 0);
    if (minPrice !== "") arr = arr.filter((p) => productMinPrice(p) >= Number(minPrice));
    if (maxPrice !== "") arr = arr.filter((p) => productMinPrice(p) <= Number(maxPrice));
    arr = [...arr];
    switch (sort) {
      case "name_desc": arr.sort((a, b) => b.name.localeCompare(a.name)); break;
      case "price_asc": arr.sort((a, b) => productMinPrice(a) - productMinPrice(b)); break;
      case "price_desc": arr.sort((a, b) => productMinPrice(b) - productMinPrice(a)); break;
      case "newest": arr.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || "")); break;
      default: arr.sort((a, b) => a.name.localeCompare(b.name));
    }
    return arr;
  }, [products, q, category, inStockOnly, minPrice, maxPrice, sort]);

  const cartCount = cart.reduce((s, l) => s + Number(l.quantity || 0), 0);

  const addToCart = (product) => {
    const variant_id = product.variants?.length ? variantPick[product.id] : null;
    if (product.variants?.length && !variant_id) {
      toast.error("Choose a variant first");
      return;
    }
    const quantity = Math.max(1, Number(qtyPick[product.id] || 1));
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.product_id === product.id && (l.variant_id || null) === (variant_id || null));
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], quantity: Number(copy[idx].quantity) + quantity };
        return copy;
      }
      return [...prev, { product_id: product.id, variant_id: variant_id || null, quantity }];
    });
    toast.success(`${product.name}${variant_id ? " · " + product.variants.find((v) => v.id === variant_id)?.label : ""} added`);
  };

  const updateCartQty = (idx, delta) => {
    setCart((prev) => {
      const copy = [...prev];
      const next = Number(copy[idx].quantity) + delta;
      if (next <= 0) return copy.filter((_, i) => i !== idx);
      copy[idx] = { ...copy[idx], quantity: next };
      return copy;
    });
  };
  const removeCart = (idx) => setCart((prev) => prev.filter((_, i) => i !== idx));

  // Live preview when cart open + customer chosen
  useEffect(() => {
    if (!cartOpen || !customerId || !cart.length) { setPreview(null); return; }
    api.post("/pricing/preview", {
      customer_id: customerId,
      items: cart.map((c) => ({ product_id: c.product_id, variant_id: c.variant_id || null, quantity: Number(c.quantity) })),
    }).then((r) => setPreview(r.data)).catch(() => setPreview(null));
  }, [cartOpen, customerId, cart]);

  const checkout = async (sendToForm = false) => {
    if (!customerId) return toast.error("Pick a customer");
    if (!cart.length) return toast.error("Cart is empty");
    if (sendToForm) {
      const params = new URLSearchParams({
        customer_id: customerId,
        items: JSON.stringify(cart),
      });
      const path = isAgent ? "/agent/new-order" : "/admin/orders/new";
      nav(`${path}?${params.toString()}`);
      return;
    }
    try {
      const itemsPayload = cart.map((c) => ({ product_id: c.product_id, variant_id: c.variant_id || null, quantity: Number(c.quantity) }));
      const { data } = await api.post("/orders", {
        customer_id: customerId, type, notes: "",
        items: itemsPayload,
      });
      toast.success(`${data.number} created`);
      setCart([]);
      setCustomerId("");
      setActiveDraftId(null);
      try {
        localStorage.removeItem(cartStorageKey);
        localStorage.removeItem(`${cartStorageKey}_customer`);
      } catch (_) { /* ignore */ }
      setCartOpen(false);
      if (isAgent) nav("/agent/sales");
      else nav(`/admin/orders/${data.id}`);
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const openSaveDraft = () => {
    if (!cart.length) { toast.error("Cart is empty"); return; }
    // If we're editing an existing draft, prefill its name; else suggest one
    const existing = drafts.find((d) => d.id === activeDraftId);
    setDraftName(existing?.name || `Draft · ${new Date().toLocaleString()}`);
    setSaveDraftOpen(true);
  };

  const saveDraft = async () => {
    const name = (draftName || "").trim();
    if (!name) { toast.error("Name your draft"); return; }
    const payload = {
      name,
      customer_id: customerId || null,
      items: cart.map((c) => ({ product_id: c.product_id, variant_id: c.variant_id || null, quantity: Number(c.quantity) })),
      notes: "",
    };
    try {
      if (activeDraftId) {
        await api.patch(`/cart-drafts/${activeDraftId}`, payload);
        toast.success("Draft updated");
      } else {
        const { data } = await api.post("/cart-drafts", payload);
        setActiveDraftId(data.id);
        toast.success("Draft saved");
      }
      setSaveDraftOpen(false);
      loadDrafts();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const loadDraft = (d) => {
    setCart((d.items || []).map((i) => ({ product_id: i.product_id, variant_id: i.variant_id || null, quantity: Number(i.quantity) })));
    setCustomerId(d.customer_id || "");
    setActiveDraftId(d.id);
    setLoadDraftOpen(false);
    toast.success(`Loaded "${d.name}"`);
  };

  const deleteDraft = async (id) => {
    if (!window.confirm("Delete this draft?")) return;
    try { await api.delete(`/cart-drafts/${id}`); toast.success("Draft deleted"); loadDrafts(); if (activeDraftId === id) setActiveDraftId(null); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  const customer = customers.find((c) => c.id === customerId);

  return (
    <div className={isAgent ? "p-4 pb-24" : "p-6 lg:p-8 max-w-[1500px] mx-auto"} data-testid="catalog-page">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <p className="overline">Browse</p>
          <h1 className={`font-display tracking-tighter mt-1 ${isAgent ? "text-3xl" : "text-4xl"}`}>Catalog</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">{filtered.length} of {products.length} products</p>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <Button variant="outline" onClick={() => setFiltersOpen((v) => !v)} data-testid="catalog-filters-toggle" className="h-10">
            <SlidersHorizontal size={14} className="mr-1.5"/>Filters
          </Button>
          <Button variant="outline" onClick={() => { loadDrafts(); setLoadDraftOpen(true); }} className="h-10 relative" data-testid="catalog-drafts-button">
            <FolderOpen size={14} className="mr-1.5"/>Drafts
            {drafts.length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center min-w-[1.2rem] h-5 text-[10px] px-1 rounded-full bg-black/[0.06] text-[var(--text-muted)] font-mono">
                {drafts.length}
              </span>
            )}
          </Button>
          <Sheet open={cartOpen} onOpenChange={setCartOpen}>
            <SheetTrigger asChild>
              <Button className="h-10 bg-[var(--primary)] hover:bg-[var(--primary-hover)] relative" data-testid="catalog-cart-button">
                <ShoppingCart size={14} className="mr-1.5"/>
                Cart
                {cartCount > 0 && (
                  <span className="ml-2 inline-flex items-center justify-center min-w-[1.4rem] h-5 text-xs px-1.5 rounded-full bg-white text-[var(--primary)] font-mono">
                    {cartCount}
                  </span>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
              <SheetHeader>
                <SheetTitle className="font-display tracking-tight">Your cart</SheetTitle>
                {cart.length > 0 && (
                  <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Auto-saved · resumes after refresh / navigation</p>
                )}
              </SheetHeader>
              <div className="space-y-3 mt-4">
                {cart.length === 0 && (
                  <p className="text-sm text-[var(--text-muted)] py-8 text-center">Cart is empty.</p>
                )}
                {cart.map((line, idx) => {
                  const p = products.find((pp) => pp.id === line.product_id);
                  const v = p?.variants?.find((vv) => vv.id === line.variant_id);
                  const img = primaryImage(p || {});
                  return (
                    <div key={`${line.product_id}-${line.variant_id || "_"}-${idx}`} className="flex items-start gap-3 border-b border-[var(--border)] pb-3 last:border-0">
                      <div className="w-12 h-12 rounded-md bg-black/[0.04] border border-[var(--border)] overflow-hidden shrink-0 flex items-center justify-center">
                        {img ? <img src={img} alt="" className="w-full h-full object-cover"/> : <ImageIcon size={16} className="text-[var(--text-muted)]"/>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{p?.name || "—"}</div>
                        {v && <div className="text-xs text-[var(--text-muted)]">{v.label}</div>}
                        <div className="flex items-center gap-1 mt-2">
                          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateCartQty(idx, -1)} data-testid={`cart-line-dec-${idx}`}><Minus size={12}/></Button>
                          <span className="w-8 text-center font-mono text-sm" data-testid={`cart-line-qty-${idx}`}>{line.quantity}</span>
                          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateCartQty(idx, 1)} data-testid={`cart-line-inc-${idx}`}><Plus size={12}/></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 ml-auto text-[var(--danger)]" onClick={() => removeCart(idx)} data-testid={`cart-line-remove-${idx}`}><Trash2 size={12}/></Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {cart.length > 0 && (
                <div className="border-t border-[var(--border)] mt-5 pt-4 space-y-3">
                  <div>
                    <Label className="overline">Customer</Label>
                    <Select value={customerId} onValueChange={setCustomerId}>
                      <SelectTrigger className="mt-2 h-10" data-testid="catalog-customer-select"><SelectValue placeholder="Pick customer"/></SelectTrigger>
                      <SelectContent>
                        {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.company || c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {customer && customer.default_tax_jurisdiction_id && (
                      <p className="text-[10px] text-[var(--text-muted)] mt-1 font-mono">
                        Tax: {jurisdictions.find((j) => j.id === customer.default_tax_jurisdiction_id)?.name || "—"}
                      </p>
                    )}
                  </div>
                  {preview && (
                    <div className="text-sm space-y-1 bg-black/[0.02] rounded-md p-3 border border-[var(--border)]">
                      <div className="flex justify-between text-[var(--text-muted)]">
                        <span>Subtotal</span>
                        <span className="font-mono">{formatCurrency(preview.subtotal)}</span>
                      </div>
                      {(preview.tax_components || []).map((c, i) => (
                        <div key={i} className="flex justify-between text-[var(--text-muted)]">
                          <span>{c.label} ({c.rate}%)</span>
                          <span className="font-mono">{formatCurrency(c.amount)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between font-display text-lg pt-1 border-t border-[var(--border)] mt-1">
                        <span>Total</span>
                        <span>{formatCurrency(preview.total)}</span>
                      </div>
                    </div>
                  )}
                  <Button onClick={() => checkout(false)} className="w-full h-11 bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white" data-testid="catalog-checkout-button">
                    Create invoice
                  </Button>
                  <Button onClick={() => checkout(true)} variant="outline" className="w-full h-10" data-testid="catalog-checkout-edit-button">
                    Edit in form first
                  </Button>
                  <Button onClick={openSaveDraft} variant="outline" className="w-full h-10" data-testid="catalog-save-draft-button">
                    <Save size={14} className="mr-1.5"/>{activeDraftId ? "Update draft" : "Save as draft"}
                  </Button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!window.confirm("Clear all items from cart?")) return;
                      setCart([]);
                      try { localStorage.removeItem(cartStorageKey); } catch (_) { /* ignore */ }
                      toast.success("Cart cleared");
                    }}
                    className="w-full text-xs text-[var(--text-muted)] hover:text-[var(--danger)] py-2"
                    data-testid="catalog-clear-cart-button"
                  >
                    Clear cart
                  </button>
                </div>
              )}
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"/>
          <Input
            placeholder="Search name, SKU, barcode…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-8 h-10"
            data-testid="catalog-search"
          />
        </div>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="h-10 w-44" data-testid="catalog-sort"><SelectValue/></SelectTrigger>
          <SelectContent>
            {SORTS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {filtersOpen && (
        <div className="surface-card p-4 mb-5 grid grid-cols-1 md:grid-cols-4 gap-4" data-testid="catalog-filters">
          <div>
            <Label className="overline">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="mt-2 h-10" data-testid="catalog-category"><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All categories</SelectItem>
                {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="overline">Min price</Label>
            <Input type="number" min="0" step="0.01" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} className="mt-2 h-10 font-mono" data-testid="catalog-min-price" placeholder="0"/>
          </div>
          <div>
            <Label className="overline">Max price</Label>
            <Input type="number" min="0" step="0.01" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} className="mt-2 h-10 font-mono" data-testid="catalog-max-price" placeholder="∞"/>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => setInStockOnly((v) => !v)}
              data-testid="catalog-in-stock-toggle"
              className={`w-full h-10 rounded-md border transition-colors ${inStockOnly ? "bg-[var(--primary)] text-white border-[var(--primary)]" : "border-[var(--border)] text-[var(--text)] hover:bg-black/5"}`}
            >
              {inStockOnly ? "In stock only ✓" : "In stock only"}
            </button>
          </div>
        </div>
      )}

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="surface-card p-16 text-center text-[var(--text-muted)]">
          <Package size={28} className="mx-auto mb-3 opacity-50"/>
          <p className="text-sm">No products match these filters.</p>
        </div>
      ) : (
        <div className={`grid gap-4 ${isAgent ? "grid-cols-2" : "grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"}`}>
          {filtered.map((p) => {
            const img = primaryImage(p);
            const stock = productStock(p);
            const minP = productMinPrice(p);
            const out = stock <= 0;
            return (
              <article key={p.id} className="surface-card overflow-hidden flex flex-col" data-testid={`catalog-card-${p.sku}`}>
                <div className="aspect-square bg-black/[0.03] relative overflow-hidden">
                  {img ? (
                    <img src={img} alt={p.name} loading="lazy" className="w-full h-full object-cover"/>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[var(--text-muted)]">
                      <ImageIcon size={32} className="opacity-40"/>
                    </div>
                  )}
                  {out && (
                    <span className="absolute top-2 left-2 text-[10px] uppercase tracking-wider px-2 py-0.5 bg-[var(--danger)] text-white rounded">Out of stock</span>
                  )}
                </div>
                <div className="p-3 flex flex-col gap-2 flex-1">
                  <div className="min-h-[2.5rem]">
                    <div className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wider">{p.category}</div>
                    <div className="font-medium text-sm leading-tight line-clamp-2">{p.name}</div>
                  </div>
                  <div className="font-display text-lg tracking-tight">
                    {p.variants?.length ? <>from {formatCurrency(minP)}</> : formatCurrency(p.base_price)}
                  </div>
                  {p.variants?.length > 0 && (
                    <Select value={variantPick[p.id] || ""} onValueChange={(v) => setVariantPick({ ...variantPick, [p.id]: v })}>
                      <SelectTrigger className="h-9" data-testid={`catalog-variant-${p.sku}`}><SelectValue placeholder="Choose variant"/></SelectTrigger>
                      <SelectContent>
                        {p.variants.map((vv) => (
                          <SelectItem key={vv.id} value={vv.id} disabled={Number(vv.stock) <= 0}>
                            {vv.label} · {formatCurrency(vv.price)} {Number(vv.stock) <= 0 ? "(out)" : `· ${vv.stock} left`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <div className="flex items-center gap-2 mt-auto">
                    <Input
                      type="number" min="1"
                      value={qtyPick[p.id] ?? "1"}
                      onChange={(e) => setQtyPick({ ...qtyPick, [p.id]: e.target.value })}
                      className="h-9 w-16 font-mono text-center"
                      data-testid={`catalog-qty-${p.sku}`}
                    />
                    <Button
                      onClick={() => addToCart(p)}
                      disabled={out}
                      className="flex-1 h-9 bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white"
                      data-testid={`catalog-add-${p.sku}`}
                    >
                      <Plus size={14} className="mr-1"/>Add
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Save draft dialog */}
      <Dialog open={saveDraftOpen} onOpenChange={setSaveDraftOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display tracking-tight">
              {activeDraftId ? "Update draft" : "Save as draft"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <Label className="overline">Name</Label>
              <Input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="e.g. Mr Khan tentative order"
                className="mt-2"
                data-testid="draft-name-input"
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") saveDraft(); }}
              />
              <p className="text-[10px] text-[var(--text-muted)] mt-1.5">
                {cart.length} item{cart.length !== 1 ? "s" : ""} · {customer ? (customer.company || customer.name) : "no customer"}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSaveDraftOpen(false)}>Cancel</Button>
            <Button onClick={saveDraft} className="bg-[var(--primary)] hover:bg-[var(--primary-hover)]" data-testid="save-draft-confirm-button">
              {activeDraftId ? "Update" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Load draft dialog */}
      <Dialog open={loadDraftOpen} onOpenChange={setLoadDraftOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display tracking-tight">Saved drafts</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 mt-2 max-h-[60vh] overflow-y-auto">
            {drafts.length === 0 && (
              <p className="text-sm text-[var(--text-muted)] py-8 text-center">
                No drafts yet. Save your current cart as a draft to come back to it later.
              </p>
            )}
            {drafts.map((d) => {
              const cust = customers.find((c) => c.id === d.customer_id);
              const totalItems = (d.items || []).reduce((s, i) => s + Number(i.quantity || 0), 0);
              return (
                <div key={d.id} className="border border-[var(--border)] rounded-md p-3 flex items-center gap-3" data-testid={`draft-row-${d.id}`}>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{d.name}</div>
                    <div className="text-xs text-[var(--text-muted)] mt-0.5">
                      {totalItems} item{totalItems !== 1 ? "s" : ""}
                      {cust ? <> · {cust.company || cust.name}</> : <> · no customer</>}
                      <span className="ml-2 font-mono">{new Date(d.updated_at).toLocaleString()}</span>
                    </div>
                  </div>
                  <Button size="sm" onClick={() => loadDraft(d)} className="bg-[var(--primary)] hover:bg-[var(--primary-hover)]" data-testid={`load-draft-${d.id}`}>
                    Load
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => deleteDraft(d.id)} data-testid={`delete-draft-${d.id}`}>
                    <Trash2 size={14}/>
                  </Button>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
