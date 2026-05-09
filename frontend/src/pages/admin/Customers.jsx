import React, { useEffect, useState } from "react";
import { api, formatApiError, formatCurrency } from "../../lib/api";
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
import { toast } from "sonner";
import { Plus, Pencil, Trash2, X, Wallet, FileText } from "lucide-react";

const empty = {
  name: "", company: "", email: "", phone: "", address: "", tax_id: "",
  credit_limit: 0, payment_terms_days: 30, custom_prices: [], notes: "",
};

export default function Customers() {
  const [list, setList] = useState([]);
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [creditOpen, setCreditOpen] = useState(false);
  const [creditTarget, setCreditTarget] = useState(null);
  const [creditDelta, setCreditDelta] = useState("");
  const [creditNote, setCreditNote] = useState("");

  const load = () => api.get("/customers").then((r) => setList(r.data));
  useEffect(() => {
    load();
    api.get("/products").then((r) => setProducts(r.data));
  }, []);

  const filtered = list.filter((c) =>
    [c.name, c.company, c.email, c.phone].join(" ").toLowerCase().includes(search.toLowerCase())
  );

  const startCreate = () => { setEditing(null); setForm(empty); setOpen(true); };
  const startEdit = (c) => { setEditing(c); setForm({ ...c, custom_prices: c.custom_prices || [] }); setOpen(true); };

  const submit = async () => {
    try {
      const payload = {
        ...form,
        credit_limit: Number(form.credit_limit),
        payment_terms_days: Number(form.payment_terms_days),
        custom_prices: (form.custom_prices || [])
          .filter((cp) => cp.product_id && cp.price)
          .map((cp) => ({ product_id: cp.product_id, price: Number(cp.price) })),
      };
      if (editing) await api.patch(`/customers/${editing.id}`, payload);
      else await api.post("/customers", payload);
      toast.success(editing ? "Customer updated" : "Customer created");
      setOpen(false); load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const del = async (c) => {
    if (!window.confirm(`Delete ${c.name}?`)) return;
    try { await api.delete(`/customers/${c.id}`); toast.success("Deleted"); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  const openCredit = (c) => { setCreditTarget(c); setCreditDelta(""); setCreditNote(""); setCreditOpen(true); };
  const submitCredit = async () => {
    try {
      await api.post(`/customers/${creditTarget.id}/credit`, {
        delta: Number(creditDelta), reason: "manual_adjustment", note: creditNote,
      });
      toast.success("Credit adjusted");
      setCreditOpen(false); load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div className="p-8 max-w-[1400px] mx-auto" data-testid="customers-page">
      <div className="flex items-end justify-between mb-6">
        <div>
          <p className="overline">Accounts</p>
          <h1 className="font-display text-4xl tracking-tighter mt-1">Customers</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">{list.length} B2B accounts</p>
        </div>
        <div className="flex items-center gap-2">
          <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-64 h-10" data-testid="customers-search"/>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={startCreate} data-testid="new-customer-button" className="h-10 bg-[var(--primary)] hover:bg-[var(--primary-hover)]">
                <Plus size={16} className="mr-1.5"/>New Customer
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-display text-2xl tracking-tight">{editing ? "Edit customer" : "New customer"}</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-4 mt-3">
                <F label="Contact name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="customer-name-input"/></F>
                <F label="Company"><Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })}/></F>
                <F label="Email"><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}/></F>
                <F label="Phone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}/></F>
                <F label="Tax ID"><Input value={form.tax_id} onChange={(e) => setForm({ ...form, tax_id: e.target.value })}/></F>
                <F label="Credit limit"><Input type="number" value={form.credit_limit} onChange={(e) => setForm({ ...form, credit_limit: e.target.value })}/></F>
                <F label="Payment terms (days)"><Input type="number" value={form.payment_terms_days} onChange={(e) => setForm({ ...form, payment_terms_days: e.target.value })}/></F>
                <div className="col-span-2">
                  <Label className="overline">Address</Label>
                  <Textarea rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="mt-2"/>
                </div>
                <div className="col-span-2">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="overline">Customer-specific prices</Label>
                    <Button type="button" variant="ghost" size="sm"
                      onClick={() => setForm({ ...form, custom_prices: [...(form.custom_prices || []), { product_id: "", price: "" }] })}>
                      + Add price
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {(form.custom_prices || []).map((cp, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <Select value={cp.product_id} onValueChange={(v) => {
                          const arr = [...form.custom_prices]; arr[idx] = { ...arr[idx], product_id: v };
                          setForm({ ...form, custom_prices: arr });
                        }}>
                          <SelectTrigger className="flex-1"><SelectValue placeholder="Choose product"/></SelectTrigger>
                          <SelectContent>
                            {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.sku} — {p.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Input placeholder="Price" type="number" step="0.01" value={cp.price} className="w-36"
                          onChange={(e) => {
                            const arr = [...form.custom_prices]; arr[idx] = { ...arr[idx], price: e.target.value };
                            setForm({ ...form, custom_prices: arr });
                          }}/>
                        <Button type="button" variant="ghost" size="icon" onClick={() => setForm({ ...form, custom_prices: form.custom_prices.filter((_, i) => i !== idx) })}>
                          <X size={16}/>
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="col-span-2">
                  <Label className="overline">Notes</Label>
                  <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-2"/>
                </div>
              </div>
              <DialogFooter className="mt-4">
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={submit} className="bg-[var(--primary)] hover:bg-[var(--primary-hover)]" data-testid="save-customer-button">Save</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="surface-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-black/[0.02]">
            <tr className="text-left border-b border-[var(--border)]">
              {["Company / Name", "Contact", "Terms", "Credit limit", "Credit balance", "Custom prices", ""].map((h) => (
                <th key={h} className="px-4 py-3 overline text-[var(--text-muted)] font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-b border-[var(--border)] last:border-0 hover:bg-black/[0.015]">
                <td className="px-4 py-3">
                  <div className="font-medium">{c.company || c.name}</div>
                  {c.company && <div className="text-xs text-[var(--text-muted)]">{c.name}</div>}
                </td>
                <td className="px-4 py-3 text-xs">
                  {c.email && <div>{c.email}</div>}
                  {c.phone && <div className="text-[var(--text-muted)]">{c.phone}</div>}
                </td>
                <td className="px-4 py-3 text-xs font-mono">Net-{c.payment_terms_days}</td>
                <td className="px-4 py-3 font-mono">{formatCurrency(c.credit_limit)}</td>
                <td className="px-4 py-3 font-mono">
                  <span className={c.credit_balance > 0 ? "text-[var(--success)]" : "text-[var(--text-muted)]"}>
                    {formatCurrency(c.credit_balance || 0)}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-[var(--text-muted)]">{c.custom_prices?.length || 0}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <Button asChild size="icon" variant="ghost" title="Statement" data-testid={`statement-${c.id}`}>
                      <a href={`/admin/customers/${c.id}/statement`} target="_blank" rel="noreferrer"><FileText size={14}/></a>
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => openCredit(c)} title="Adjust credit" data-testid={`credit-${c.id}`}><Wallet size={14}/></Button>
                    <Button size="icon" variant="ghost" onClick={() => startEdit(c)}><Pencil size={14}/></Button>
                    <Button size="icon" variant="ghost" onClick={() => del(c)}><Trash2 size={14}/></Button>
                  </div>
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-[var(--text-muted)]">No customers yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <Dialog open={creditOpen} onOpenChange={setCreditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-display tracking-tight">Adjust credit · {creditTarget?.company || creditTarget?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label className="overline">Current balance</Label>
              <div className="font-display text-2xl mt-1">{formatCurrency(creditTarget?.credit_balance || 0)}</div>
            </div>
            <div>
              <Label className="overline">Delta (positive adds, negative removes)</Label>
              <Input type="number" step="0.01" value={creditDelta} onChange={(e) => setCreditDelta(e.target.value)} className="mt-2 font-mono" data-testid="credit-delta-input"/>
            </div>
            <div>
              <Label className="overline">Note</Label>
              <Input value={creditNote} onChange={(e) => setCreditNote(e.target.value)} className="mt-2"/>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreditOpen(false)}>Cancel</Button>
            <Button onClick={submitCredit} className="bg-[var(--primary)] hover:bg-[var(--primary-hover)]" data-testid="save-credit-button">Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const F = ({ label, children }) => (<div><Label className="overline">{label}</Label><div className="mt-2">{children}</div></div>);
