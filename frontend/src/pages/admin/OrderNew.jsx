import React, { useEffect, useState, useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
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
import { Plus, Trash2, ChevronLeft, ScanLine, Repeat, Wallet, ShoppingBag, ShoppingCart, ArrowRight, Image as ImageIcon, ChevronDown, ChevronUp } from "lucide-react";
import BarcodeScanner from "../../components/BarcodeScanner";
import { useUsbScanner } from "../../hooks/useUsbScanner";
import { useAuth } from "../../contexts/AuthContext";

export default function OrderForm() {
  const nav = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const isEdit = Boolean(id);
  const isAgent = user?.role === "sales_agent";

  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [jurisdictions, setJurisdictions] = useState([]);
  const [customerId, setCustomerId] = useState("");
  const [items, setItems] = useState([]);
  const [tradeIns, setTradeIns] = useState([]);
  const [creditApplied, setCreditApplied] = useState(0);
  const [notes, setNotes] = useState("");
  const [taxJurisdictionId, setTaxJurisdictionId] = useState(undefined); // undefined = use customer default; "" = no tax; specific id = override
  const [preview, setPreview] = useState(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [originalOrder, setOriginalOrder] = useState(null);
  const type = "invoice"; // Wholesale POS only deals with invoices now

  // Load existing order if editing
  useEffect(() => {
    api.get("/customers").then((r) => setCustomers(r.data));
    api.get("/products").then((r) => setProducts(r.data));
    api.get("/tax-jurisdictions").then((r) => setJurisdictions(r.data));
    if (isEdit) {
      api.get(`/orders/${id}`).then((r) => {
        const o = r.data;
        setOriginalOrder(o);
        setCustomerId(o.customer_id);
        setItems(o.items.map((it) => ({
          product_id: it.product_id,
          variant_id: it.variant_id || null,
          quantity: it.quantity,
          unit_price_override: typeof it.unit_price === "number" ? it.unit_price : "",
        })));
        setTradeIns(o.trade_ins || []);
        setCreditApplied(o.credit_applied || 0);
        setNotes(o.notes || "");
        setTaxJurisdictionId(o.tax_jurisdiction_id ?? "");

        // If we returned from catalog with merge=<json items>, append them
        const mergeRaw = searchParams.get("merge");
        if (mergeRaw) {
          try {
            const incoming = JSON.parse(mergeRaw);
            if (Array.isArray(incoming) && incoming.length) {
              setItems((prev) => {
                const next = [...prev];
                for (const inc of incoming) {
                  const idx = next.findIndex((x) =>
                    x.product_id === inc.product_id &&
                    (x.variant_id || null) === (inc.variant_id || null)
                  );
                  if (idx >= 0) next[idx] = { ...next[idx], quantity: Number(next[idx].quantity) + Number(inc.quantity || 1) };
                  else next.push({ product_id: inc.product_id, variant_id: inc.variant_id || null, quantity: Number(inc.quantity || 1) });
                }
                return next;
              });
              toast.success(`${incoming.length} item${incoming.length > 1 ? "s" : ""} added from catalog`);
              // strip the param so refresh doesn't re-merge
              const url = new URL(window.location.href);
              url.searchParams.delete("merge");
              window.history.replaceState({}, "", url.toString());
            }
          } catch (_) { /* ignore */ }
        }
      }).catch((e) => toast.error(formatApiError(e)));
    } else {
      // Prefill from catalog query params
      const cidQ = searchParams.get("customer_id");
      const itemsQ = searchParams.get("items");
      if (cidQ) setCustomerId(cidQ);
      if (itemsQ) {
        try {
          const parsed = JSON.parse(itemsQ);
          if (Array.isArray(parsed)) {
            setItems(parsed.map((i) => ({
              product_id: i.product_id, variant_id: i.variant_id || null, quantity: Number(i.quantity || 1),
            })));
          }
        } catch (_) { /* ignore */ }
      }
    }
  }, [id, isEdit, searchParams]);

  const handleScan = async (code) => {
    try {
      const { data } = await api.get(`/products/by-barcode/${encodeURIComponent(code)}`);
      const product = data.product;
      const variant = data.variant;
      const matchKey = (it) => it.product_id === product.id && (it.variant_id || null) === (variant?.id || null);
      setItems((prev) => {
        const idx = prev.findIndex(matchKey);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = { ...copy[idx], quantity: Number(copy[idx].quantity || 0) + 1 };
          return copy;
        }
        return [...prev, { product_id: product.id, variant_id: variant?.id || null, quantity: 1 }];
      });
      toast.success(`Added: ${product.name}${variant ? " · " + variant.label : ""}`);
    } catch (e) { toast.error(formatApiError(e)); }
  };
  useUsbScanner(handleScan, true);

  // Live pricing preview
  useEffect(() => {
    if (!customerId) { setPreview(null); return; }
    const valid = items.filter((i) => i.product_id && Number(i.quantity) > 0);
    const payload = {
      customer_id: customerId,
      items: valid.map((i) => {
        const o = { product_id: i.product_id, variant_id: i.variant_id || null, quantity: Number(i.quantity) };
        if (i.unit_price_override !== undefined && i.unit_price_override !== "" && i.unit_price_override !== null) {
          o.unit_price_override = Number(i.unit_price_override);
        }
        return o;
      }),
      trade_ins: tradeIns,
      credit_applied: Number(creditApplied) || 0,
    };
    if (taxJurisdictionId !== undefined) payload.tax_jurisdiction_id = taxJurisdictionId;
    api.post("/pricing/preview", payload).then((r) => setPreview(r.data)).catch(() => setPreview(null));
  }, [customerId, items, tradeIns, creditApplied, taxJurisdictionId]);

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
      const itemsPayload = valid.map((i) => {
        const o = { product_id: i.product_id, variant_id: i.variant_id || null, quantity: Number(i.quantity) };
        if (i.unit_price_override !== undefined && i.unit_price_override !== "" && i.unit_price_override !== null) {
          o.unit_price_override = Number(i.unit_price_override);
        }
        return o;
      });
      if (isEdit) {
        const patchBody = {
          customer_id: customerId,
          items: itemsPayload,
          trade_ins: tiPayload,
          credit_applied: Number(creditApplied) || 0,
          notes,
        };
        if (taxJurisdictionId !== undefined) patchBody.tax_jurisdiction_id = taxJurisdictionId;
        const { data } = await api.patch(`/orders/${id}`, patchBody);
        toast.success(`${data.number} updated`);
        nav(isAgent ? "/agent/sales" : `/admin/orders/${data.id}`);
      } else {
        const createBody = {
          customer_id: customerId, type, notes,
          items: itemsPayload,
          trade_ins: tiPayload,
          credit_applied: Number(creditApplied) || 0,
        };
        if (taxJurisdictionId !== undefined) createBody.tax_jurisdiction_id = taxJurisdictionId;
        const { data } = await api.post("/orders", createBody);
        toast.success(`${data.number} created`);
        nav(isAgent ? "/agent/sales" : `/admin/orders/${data.id}`);
      }
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const availableCredit = preview?.available_credit ?? customer?.credit_balance ?? 0;
  const totalQty = (preview?.items || []).reduce((s, p) => s + Number(p.quantity || 0), 0);
  const lineCount = (preview?.items || []).length;
  const [headerOpen, setHeaderOpen] = useState(!isEdit);
  const [tradeOpen, setTradeOpen] = useState(false);

  const tierForLine = (it, prod) => {
    const override = it.unit_price_override;
    if (override === "" || override === null || override === undefined) return "Auto";
    const v = Number(override);
    if (!prod) return "Custom";
    if (prod.msrp != null && Math.abs(v - Number(prod.msrp)) < 0.001) return "MSRP";
    if (prod.distribution_price != null && Math.abs(v - Number(prod.distribution_price)) < 0.001) return "Distribution";
    if (prod.wholesale_price != null && Math.abs(v - Number(prod.wholesale_price)) < 0.001) return "Wholesale";
    if (Math.abs(v - Number(prod.base_price || 0)) < 0.001) return "Retail";
    return "Custom";
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto pb-28 lg:pb-8" data-testid="order-form-page">
      <button onClick={() => nav(-1)} className="overline flex items-center gap-1 mb-3 hover:text-[var(--primary)]">
        <ChevronLeft size={14}/>Back
      </button>

      {/* HERO: shopping-cart-style heading + big Total CTA */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4 items-end mb-6">
        <div>
          <p className="overline">{isEdit ? `Edit ${originalOrder?.number || "…"}` : "New invoice"}</p>
          <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl tracking-tighter mt-1 flex items-center gap-3">
            <ShoppingCart size={32} className="text-[var(--primary)]" strokeWidth={1.5}/>
            Your shopping cart
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Edit your items, add trade-ins, or save changes — stock and credit update automatically.
          </p>
        </div>

        <button
          onClick={submit}
          disabled={!preview}
          data-testid="submit-order-button"
          className="hidden lg:block group relative overflow-hidden rounded-xl px-6 lg:px-8 py-5 bg-[var(--text)] hover:bg-black text-white text-left disabled:opacity-50 disabled:cursor-not-allowed min-w-[280px]"
        >
          <div className="overline text-white/60 mb-1">Total</div>
          <div className="flex items-center justify-between gap-6">
            <span className="font-display text-3xl lg:text-4xl tracking-tighter">{formatCurrency(preview?.total || 0)}</span>
            <ArrowRight size={28} className="transition-transform group-hover:translate-x-1"/>
          </div>
          <div className="overline mt-2 text-white/60">{isEdit ? "Save changes" : "Create invoice"}</div>
        </button>
      </div>

      {/* HEADER: customer + tax (collapsible on edit) */}
      <div className="surface-card mb-4">
        <button
          onClick={() => setHeaderOpen((v) => !v)}
          className="w-full px-6 py-4 flex items-center justify-between hover:bg-black/[0.015]"
          data-testid="order-header-toggle"
        >
          <div className="flex items-center gap-4 text-left">
            <div>
              <div className="overline">Customer</div>
              <div className="text-sm font-medium">{customer ? (customer.company || customer.name) : <span className="text-[var(--text-muted)]">Choose customer…</span>}</div>
            </div>
            {customer && (
              <div className="hidden md:block text-xs text-[var(--text-muted)] border-l border-[var(--border)] pl-4 font-mono">
                Net-{customer.payment_terms_days} · Credit {formatCurrency(customer.credit_balance || 0)}
              </div>
            )}
            {(preview?.tax_jurisdiction_name) && (
              <div className="hidden md:block text-xs text-[var(--text-muted)] border-l border-[var(--border)] pl-4">
                Tax: {preview.tax_jurisdiction_name}
              </div>
            )}
          </div>
          {headerOpen ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
        </button>
        {headerOpen && (
          <div className="px-6 pb-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="overline">Customer</Label>
              <Select value={customerId} onValueChange={setCustomerId} disabled={isEdit}>
                <SelectTrigger className="mt-2" data-testid="order-customer-select"><SelectValue placeholder="Choose customer"/></SelectTrigger>
                <SelectContent>
                  {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.company || c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="overline">Tax jurisdiction</Label>
              <Select
                value={taxJurisdictionId === undefined ? "__default__" : (taxJurisdictionId === "" ? "__none__" : taxJurisdictionId)}
                onValueChange={(v) => {
                  if (v === "__default__") setTaxJurisdictionId(undefined);
                  else if (v === "__none__") setTaxJurisdictionId("");
                  else setTaxJurisdictionId(v);
                }}
              >
                <SelectTrigger className="mt-2" data-testid="order-tax-select"><SelectValue/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__default__">Use customer default ({customer?.default_tax_jurisdiction_id ? (jurisdictions.find((j) => j.id === customer.default_tax_jurisdiction_id)?.name || "—") : "no tax"})</SelectItem>
                  <SelectItem value="__none__">No tax (override)</SelectItem>
                  {jurisdictions.filter((j) => j.active).map((j) => (
                    <SelectItem key={j.id} value={j.id}>{j.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>

      {/* TRADE-IN STRIP */}
      <div className="surface-card mb-4">
        <button
          onClick={() => setTradeOpen((v) => !v)}
          className="w-full px-6 py-3 flex items-center justify-between hover:bg-black/[0.015]"
          data-testid="trade-ins-toggle"
        >
          <div className="flex items-center gap-2">
            <Repeat size={14} className="text-[var(--primary)]"/>
            <span className="font-medium">+ Trade-In</span>
            {tradeIns.length > 0 && (
              <span className="ml-2 text-xs font-mono px-2 py-0.5 rounded bg-[var(--accent-soft)] text-[var(--primary)]">
                {tradeIns.length} · −{formatCurrency(preview?.trade_in_total || 0)}
              </span>
            )}
          </div>
          {tradeOpen ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
        </button>
        {tradeOpen && (
          <div className="px-6 pb-5 space-y-3">
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" onClick={addTradeIn} data-testid="add-tradein-button"><Plus size={14} className="mr-1"/>Add trade-in</Button>
            </div>
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
        )}
      </div>

      {/* LINE ITEMS TABLE */}
      <div className="surface-card overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <p className="overline">Line items</p>
          <div className="flex items-center gap-2">
            {isEdit && (
              <Button
                variant="outline" size="sm"
                onClick={() => {
                  try {
                    sessionStorage.setItem("pos_addTo_invoice", id);
                    sessionStorage.setItem("pos_addTo_invoice_number", originalOrder?.number || "");
                    sessionStorage.setItem("pos_addTo_invoice_role", isAgent ? "agent" : "admin");
                  } catch (_) { /* ignore */ }
                  const path = isAgent ? "/agent/catalog" : "/admin/catalog";
                  nav(`${path}?addTo=${id}`);
                }}
                data-testid="order-add-from-catalog-button"
                className="border-[var(--primary)] text-[var(--primary)] hover:bg-[var(--accent-soft)]"
              >
                <ShoppingBag size={14} className="mr-1"/>+ Add from catalog
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setScanOpen(true)} data-testid="order-scan-button"><ScanLine size={14} className="mr-1"/>Scan</Button>
            <Button variant="ghost" size="sm" onClick={addLine} data-testid="add-line-button"><Plus size={14} className="mr-1"/>Add line</Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-black/[0.02]">
              <tr className="text-left border-b border-[var(--border)]">
                <th className="w-14"></th>
                <th className="px-3 py-3 overline text-[10px] font-medium text-[var(--text-muted)] hidden md:table-cell">Category</th>
                <th className="px-3 py-3 overline text-[10px] font-medium text-[var(--text-muted)] min-w-[200px]">Line item</th>
                <th className="px-3 py-3 overline text-[10px] font-medium text-[var(--text-muted)] hidden lg:table-cell">Pricing</th>
                <th className="px-3 py-3 overline text-[10px] font-medium text-[var(--text-muted)] w-20">Qty</th>
                <th className="px-3 py-3 overline text-[10px] font-medium text-[var(--text-muted)] w-32">Unit price</th>
                <th className="px-3 py-3 overline text-[10px] font-medium text-[var(--text-muted)] w-28 text-right hidden lg:table-cell">Suggested</th>
                <th className="px-3 py-3 overline text-[10px] font-medium text-[var(--text-muted)] w-28 text-right">Ext. price</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => {
                const prod = products.find((p) => p.id === it.product_id);
                const hasVariants = prod?.variants?.length > 0;
                const lineFromPreview = preview?.items?.find(
                  (p) => p.product_id === it.product_id && (p.variant_id || null) === (it.variant_id || null)
                );
                const img = (prod?.images || []).find((i) => i.is_primary)?.data_url || (prod?.images || [])[0]?.data_url;
                const tier = tierForLine(it, prod);
                const tierColor = {
                  MSRP: "bg-[var(--success)]/10 text-[var(--success)]",
                  Distribution: "bg-blue-100 text-blue-800",
                  Wholesale: "bg-[var(--primary-soft)] text-[var(--primary)]",
                  Auto: "bg-black/[0.04] text-[var(--text-muted)]",
                  Custom: "bg-[var(--warning)]/10 text-[var(--warning)]",
                  Retail: "bg-black/[0.04] text-[var(--text)]",
                }[tier] || "bg-black/[0.04]";

                return (
                  <tr key={idx} className="border-b border-[var(--border)] last:border-0 hover:bg-black/[0.01] align-top" data-testid={`order-line-${idx}`}>
                    <td className="px-3 py-3">
                      <div className="w-10 h-10 rounded-md bg-black/[0.04] border border-[var(--border)] overflow-hidden flex items-center justify-center">
                        {img ? <img src={img} alt="" className="w-full h-full object-cover"/> : <ImageIcon size={14} className="text-[var(--text-muted)]"/>}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs text-[var(--text-muted)] truncate max-w-[140px] hidden md:table-cell">{prod?.category || "—"}</td>
                    <td className="px-3 py-3">
                      <Select value={it.product_id} onValueChange={(v) => updateLine(idx, { product_id: v, variant_id: null })}>
                        <SelectTrigger data-testid={`line-product-${idx}`} className="h-9"><SelectValue placeholder="Choose product"/></SelectTrigger>
                        <SelectContent>
                          {products.map((p) => <SelectItem key={p.id} value={p.id}><span className="font-mono text-xs mr-2">{p.sku}</span>{p.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {hasVariants && (
                        <Select value={it.variant_id || ""} onValueChange={(v) => updateLine(idx, { variant_id: v })}>
                          <SelectTrigger data-testid={`line-variant-${idx}`} className="h-8 mt-1.5 text-xs"><SelectValue placeholder="Choose variant"/></SelectTrigger>
                          <SelectContent>
                            {prod.variants.map((v) => (
                              <SelectItem key={v.id} value={v.id}>{v.label} <span className="text-xs text-[var(--text-muted)] ml-1">· {v.stock} left</span></SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      {/* Mobile-only tier badges (hidden on lg) */}
                      {prod && (prod.msrp != null || prod.distribution_price != null || prod.wholesale_price != null) && (
                        <div className="flex flex-wrap gap-1 mt-2 lg:hidden">
                          <span className={`text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded ${tierColor}`}>
                            {tier}
                          </span>
                          {prod.msrp != null && (
                            <button type="button"
                              onClick={() => updateLine(idx, { unit_price_override: prod.msrp })}
                              className="text-[10px] font-mono px-1.5 py-0.5 rounded hover:bg-[var(--accent-soft)] hover:text-[var(--primary)] border border-[var(--border)]">
                              MSRP {formatCurrency(prod.msrp)}
                            </button>
                          )}
                          {prod.distribution_price != null && (
                            <button type="button"
                              onClick={() => updateLine(idx, { unit_price_override: prod.distribution_price })}
                              className="text-[10px] font-mono px-1.5 py-0.5 rounded hover:bg-[var(--accent-soft)] hover:text-[var(--primary)] border border-[var(--border)]">
                              Dist {formatCurrency(prod.distribution_price)}
                            </button>
                          )}
                          {prod.wholesale_price != null && (
                            <button type="button"
                              onClick={() => updateLine(idx, { unit_price_override: prod.wholesale_price })}
                              className="text-[10px] font-mono px-1.5 py-0.5 rounded hover:bg-[var(--accent-soft)] hover:text-[var(--primary)] border border-[var(--border)]">
                              W'sale {formatCurrency(prod.wholesale_price)}
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 hidden lg:table-cell">
                      <span className={`text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded ${tierColor}`} data-testid={`line-tier-${idx}`}>
                        {tier}
                      </span>
                      {prod && (prod.msrp != null || prod.distribution_price != null || prod.wholesale_price != null) && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {prod.msrp != null && (
                            <button type="button"
                              onClick={() => updateLine(idx, { unit_price_override: prod.msrp })}
                              data-testid={`line-pricetier-msrp-${idx}`}
                              className="text-[10px] font-mono px-1.5 py-0.5 rounded hover:bg-[var(--accent-soft)] hover:text-[var(--primary)] border border-[var(--border)]">
                              MSRP {formatCurrency(prod.msrp)}
                            </button>
                          )}
                          {prod.distribution_price != null && (
                            <button type="button"
                              onClick={() => updateLine(idx, { unit_price_override: prod.distribution_price })}
                              data-testid={`line-pricetier-dist-${idx}`}
                              className="text-[10px] font-mono px-1.5 py-0.5 rounded hover:bg-[var(--accent-soft)] hover:text-[var(--primary)] border border-[var(--border)]">
                              Dist {formatCurrency(prod.distribution_price)}
                            </button>
                          )}
                          {prod.wholesale_price != null && (
                            <button type="button"
                              onClick={() => updateLine(idx, { unit_price_override: prod.wholesale_price })}
                              data-testid={`line-pricetier-wholesale-${idx}`}
                              className="text-[10px] font-mono px-1.5 py-0.5 rounded hover:bg-[var(--accent-soft)] hover:text-[var(--primary)] border border-[var(--border)]">
                              W'sale {formatCurrency(prod.wholesale_price)}
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <Input type="number" min="1" value={it.quantity}
                        onChange={(e) => updateLine(idx, { quantity: e.target.value })}
                        className="h-9 font-mono text-center"
                        data-testid={`line-qty-${idx}`}/>
                    </td>
                    <td className="px-3 py-3">
                      <Input type="number" min="0" step="0.01"
                        placeholder={lineFromPreview ? formatCurrency(lineFromPreview.unit_price).replace(/[^0-9.]/g, "") : "auto"}
                        value={it.unit_price_override ?? ""}
                        onChange={(e) => updateLine(idx, { unit_price_override: e.target.value })}
                        className="h-9 font-mono"
                        data-testid={`line-price-${idx}`}/>
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-xs text-[var(--text-muted)] hidden lg:table-cell">
                      {prod?.msrp != null ? formatCurrency(prod.msrp) : "—"}
                    </td>
                    <td className="px-3 py-3 text-right font-mono">
                      {lineFromPreview ? formatCurrency(lineFromPreview.line_total) : "—"}
                    </td>
                    <td className="px-3 py-3">
                      <Button variant="ghost" size="icon" onClick={() => removeLine(idx)} data-testid={`line-remove-${idx}`}><Trash2 size={14}/></Button>
                    </td>
                  </tr>
                );
              })}
              {!items.length && (
                <tr><td colSpan={9} className="px-6 py-12 text-center text-sm text-[var(--text-muted)]">No lines yet. Click "+ Add from catalog" to start.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer summary */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-t border-[var(--border)] bg-black/[0.015]">
          <div className="flex items-center gap-6 text-xs font-mono text-[var(--text-muted)]">
            <span>Total quantity: <span className="text-[var(--text)] font-medium">{totalQty}</span></span>
            <span>Line items: <span className="text-[var(--text)] font-medium">{lineCount}</span></span>
          </div>
          <div className="text-right">
            <div className="overline text-[10px] text-[var(--text-muted)]">Subtotal</div>
            <div className="font-display text-2xl tracking-tight">{formatCurrency(preview?.subtotal || 0)}</div>
          </div>
        </div>
      </div>

      {/* Customer credit + summary breakdown + notes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        <div className="lg:col-span-2 space-y-4">
          {customer && availableCredit > 0 && (
            <div className="surface-card p-5" data-testid="credit-section">
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
          <div className="surface-card p-5">
            <Label className="overline">Notes</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-2"/>
          </div>
        </div>

        <aside className="surface-card p-5">
          <p className="overline mb-3">Summary</p>
          <div className="space-y-1 text-sm">
            <Row label="Subtotal" value={formatCurrency(preview?.subtotal || 0)} />
            {(preview?.trade_in_total || 0) > 0 && (
              <Row label="Trade-in" value={`− ${formatCurrency(preview.trade_in_total)}`} accent />
            )}
            {(preview?.credit_applied || 0) > 0 && (
              <Row label="Credit applied" value={`− ${formatCurrency(preview.credit_applied)}`} accent />
            )}
            {(preview?.tax_components || []).map((c, i) => (
              <Row key={i} label={`${c.label} (${c.rate}%)`} value={formatCurrency(c.amount)} />
            ))}
            <div className="flex justify-between font-display text-2xl tracking-tight pt-2 border-t border-[var(--border)] mt-2">
              <span>Total</span>
              <span>{formatCurrency(preview?.total || 0)}</span>
            </div>
          </div>
        </aside>
      </div>

      <BarcodeScanner open={scanOpen} onOpenChange={setScanOpen} onDetected={handleScan} title="Scan product to add"/>

      {/* Mobile sticky Total bar */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-[var(--text)] text-white shadow-2xl z-30">
        <button
          onClick={submit}
          disabled={!preview}
          data-testid="submit-order-button-mobile"
          className="w-full px-5 py-4 flex items-center justify-between disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <div>
            <div className="overline text-white/60 text-[10px]">Total · {totalQty} qty</div>
            <div className="font-display text-2xl tracking-tighter">{formatCurrency(preview?.total || 0)}</div>
          </div>
          <div className="flex items-center gap-2">
            <span className="overline text-[10px] text-white/80">{isEdit ? "Save" : "Create"}</span>
            <ArrowRight size={20}/>
          </div>
        </button>
      </div>
    </div>
  );
}

const Row = ({ label, value, accent }) => (
  <div className="flex justify-between">
    <span className={accent ? "text-[var(--primary)]" : "text-[var(--text-muted)]"}>{label}</span>
    <span className={`font-mono ${accent ? "text-[var(--primary)]" : ""}`}>{value}</span>
  </div>
);
