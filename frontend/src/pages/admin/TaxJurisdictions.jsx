import React, { useEffect, useState } from "react";
import { api, formatApiError } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "../../components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, X, Percent } from "lucide-react";

const empty = { name: "", components: [{ label: "", rate: "" }] };

export default function TaxJurisdictions() {
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);

  const load = () => api.get("/tax-jurisdictions").then((r) => setList(r.data));
  useEffect(() => { load(); }, []);

  const startCreate = () => { setEditing(null); setForm(empty); setOpen(true); };
  const startEdit = (j) => {
    setEditing(j);
    setForm({ name: j.name, components: j.components?.length ? j.components : [{ label: "", rate: "" }] });
    setOpen(true);
  };

  const submit = async () => {
    try {
      const payload = {
        name: form.name,
        components: (form.components || [])
          .filter((c) => c.label && c.rate !== "" && c.rate !== null)
          .map((c) => ({ label: c.label, rate: Number(c.rate) })),
      };
      if (!payload.name) { toast.error("Name is required"); return; }
      if (!payload.components.length) { toast.error("Add at least one tax component"); return; }
      if (editing) await api.patch(`/tax-jurisdictions/${editing.id}`, payload);
      else await api.post("/tax-jurisdictions", payload);
      toast.success(editing ? "Jurisdiction updated" : "Jurisdiction created");
      setOpen(false); load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const del = async (j) => {
    if (!window.confirm(`Archive ${j.name}?`)) return;
    try { await api.delete(`/tax-jurisdictions/${j.id}`); toast.success("Archived"); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  const totalRate = (j) => (j.components || []).reduce((s, c) => s + Number(c.rate || 0), 0);

  return (
    <div className="p-8 max-w-[1100px] mx-auto" data-testid="tax-page">
      <div className="flex items-end justify-between mb-6">
        <div>
          <p className="overline">Settings</p>
          <h1 className="font-display text-4xl tracking-tighter mt-1">Tax jurisdictions</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Composite rates (e.g., CGST 9 % + SGST 9 %) applied tax-exclusive on the order net.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={startCreate} data-testid="new-jurisdiction-button" className="h-10 bg-[var(--primary)] hover:bg-[var(--primary-hover)]">
              <Plus size={16} className="mr-1.5"/>New jurisdiction
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle className="font-display text-2xl tracking-tight">
                {editing ? "Edit jurisdiction" : "New jurisdiction"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div>
                <Label className="overline">Name</Label>
                <Input className="mt-2" placeholder="e.g. Karnataka GST"
                  value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  data-testid="jurisdiction-name-input"/>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="overline">Components</Label>
                  <Button type="button" variant="ghost" size="sm"
                    onClick={() => setForm({ ...form, components: [...form.components, { label: "", rate: "" }] })}
                    data-testid="add-component-button">+ Add component</Button>
                </div>
                <div className="space-y-2">
                  {form.components.map((c, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input className="flex-1" placeholder="Label (e.g. CGST)" value={c.label}
                        onChange={(e) => { const arr = [...form.components]; arr[idx] = { ...arr[idx], label: e.target.value }; setForm({ ...form, components: arr }); }}
                        data-testid={`component-label-${idx}`}/>
                      <div className="relative">
                        <Input className="w-32 pr-8 font-mono" type="number" step="0.01" placeholder="Rate" value={c.rate}
                          onChange={(e) => { const arr = [...form.components]; arr[idx] = { ...arr[idx], rate: e.target.value }; setForm({ ...form, components: arr }); }}
                          data-testid={`component-rate-${idx}`}/>
                        <Percent size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"/>
                      </div>
                      <Button type="button" variant="ghost" size="icon"
                        onClick={() => setForm({ ...form, components: form.components.filter((_, i) => i !== idx) })}>
                        <X size={16}/>
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter className="mt-4">
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={submit} className="bg-[var(--primary)] hover:bg-[var(--primary-hover)]" data-testid="save-jurisdiction-button">Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="surface-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-black/[0.02]">
            <tr className="text-left border-b border-[var(--border)]">
              {["Name", "Components", "Total rate", "Status", ""].map((h) => (
                <th key={h} className="px-4 py-3 overline text-[var(--text-muted)] font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.map((j) => (
              <tr key={j.id} className="border-b border-[var(--border)] last:border-0 hover:bg-black/[0.015]">
                <td className="px-4 py-3 font-medium">{j.name}</td>
                <td className="px-4 py-3 text-[var(--text-muted)] text-xs">
                  {(j.components || []).map((c, i) => (
                    <span key={i} className="mr-2">
                      <span className="font-medium">{c.label}</span> {c.rate}%
                    </span>
                  ))}
                </td>
                <td className="px-4 py-3 font-mono">{totalRate(j).toFixed(2)}%</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded ${j.active ? "bg-[var(--accent-soft)] text-[var(--primary)]" : "bg-black/5 text-[var(--text-muted)]"}`}>
                    {j.active ? "Active" : "Archived"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" onClick={() => startEdit(j)} data-testid={`edit-jurisdiction-${j.name}`}><Pencil size={14}/></Button>
                    {j.active && <Button size="icon" variant="ghost" onClick={() => del(j)}><Trash2 size={14}/></Button>}
                  </div>
                </td>
              </tr>
            ))}
            {!list.length && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-[var(--text-muted)]">No jurisdictions yet. Click "New jurisdiction" to add one.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
