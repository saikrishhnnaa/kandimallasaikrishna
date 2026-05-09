import React, { useEffect, useState } from "react";
import { api, formatApiError } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "../../components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../../components/ui/select";
import { Switch } from "../../components/ui/switch";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";

const empty = { name: "", email: "", password: "", role: "employee", commission_rate: 0 };

export default function Users() {
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);

  const load = () => api.get("/users").then((r) => setList(r.data));
  useEffect(() => { load(); }, []);

  const startCreate = () => { setEditing(null); setForm(empty); setOpen(true); };
  const startEdit = (u) => { setEditing(u); setForm({ ...u, password: "" }); setOpen(true); };

  const submit = async () => {
    try {
      const payload = { ...form, commission_rate: Number(form.commission_rate || 0) };
      if (editing) {
        const upd = { name: payload.name, role: payload.role, commission_rate: payload.commission_rate };
        if (payload.password) upd.password = payload.password;
        await api.patch(`/users/${editing.id}`, upd);
      } else {
        await api.post("/users", payload);
      }
      toast.success(editing ? "User updated" : "User created");
      setOpen(false); load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const toggle = async (u) => {
    try { await api.patch(`/users/${u.id}`, { active: !u.active }); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  const del = async (u) => {
    if (!window.confirm(`Delete ${u.name}?`)) return;
    try { await api.delete(`/users/${u.id}`); toast.success("Deleted"); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div className="p-8 max-w-[1200px] mx-auto" data-testid="users-page">
      <div className="flex items-end justify-between mb-6">
        <div>
          <p className="overline">Access</p>
          <h1 className="font-display text-4xl tracking-tighter mt-1">Team & Roles</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">Manage admins, employees, and on-site sales agents.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={startCreate} className="bg-[var(--primary)] hover:bg-[var(--primary-hover)]" data-testid="new-user-button">
              <Plus size={16} className="mr-1.5"/>New User
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle className="font-display tracking-tight">{editing ? "Edit user" : "New user"}</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-2">
              <div><Label className="overline">Full name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-2" data-testid="user-name-input"/>
              </div>
              <div><Label className="overline">Email</Label>
                <Input type="email" disabled={!!editing} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-2" data-testid="user-email-input"/>
              </div>
              <div><Label className="overline">Role</Label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                  <SelectTrigger className="mt-2" data-testid="user-role-select"><SelectValue/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="employee">Employee</SelectItem>
                    <SelectItem value="sales_agent">Sales Agent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.role === "sales_agent" && (
                <div><Label className="overline">Commission rate (%)</Label>
                  <Input type="number" step="0.1" value={form.commission_rate} onChange={(e) => setForm({ ...form, commission_rate: e.target.value })} className="mt-2"/>
                </div>
              )}
              <div><Label className="overline">{editing ? "New password (optional)" : "Password"}</Label>
                <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="mt-2" data-testid="user-password-input"/>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={submit} className="bg-[var(--primary)] hover:bg-[var(--primary-hover)]" data-testid="save-user-button">Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="surface-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-black/[0.02]">
            <tr className="text-left border-b border-[var(--border)]">
              {["Name", "Email", "Role", "Commission", "Active", ""].map((h) => (
                <th key={h} className="px-4 py-3 overline text-[var(--text-muted)] font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.map((u) => (
              <tr key={u.id} className="border-b border-[var(--border)] last:border-0 hover:bg-black/[0.015]">
                <td className="px-4 py-3 font-medium">{u.name}</td>
                <td className="px-4 py-3 font-mono text-xs">{u.email}</td>
                <td className="px-4 py-3"><RoleBadge r={u.role}/></td>
                <td className="px-4 py-3 font-mono">{u.role === "sales_agent" ? `${u.commission_rate}%` : "—"}</td>
                <td className="px-4 py-3"><Switch checked={u.active} onCheckedChange={() => toggle(u)}/></td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" onClick={() => startEdit(u)}><Pencil size={14}/></Button>
                    <Button size="icon" variant="ghost" onClick={() => del(u)}><Trash2 size={14}/></Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RoleBadge({ r }) {
  const map = {
    admin: "bg-black text-white",
    employee: "bg-black/5 text-[var(--text)]",
    sales_agent: "bg-[var(--primary-soft)] text-[var(--primary)]",
  };
  return <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded ${map[r]}`}>{r.replace("_", " ")}</span>;
}
