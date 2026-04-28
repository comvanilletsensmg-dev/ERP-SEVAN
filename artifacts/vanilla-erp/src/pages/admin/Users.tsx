import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { UserPlus, Trash2, Edit2, Users } from "lucide-react";
import { ROLE_LABELS, ROLE_COLORS } from "@/lib/permissions";

const API = "/api";

async function apiJson(path: string, opts?: RequestInit) {
  const r = await fetch(`${API}${path}`, { credentials: "include", headers: { "Content-Type": "application/json" }, ...opts });
  if (!r.ok) throw new Error((await r.json()).error ?? r.statusText);
  return r.json();
}

const ROLES = ["SUPER_ADMIN", "ACCOUNTANT", "LOGISTICS_MANAGER", "HR_MANAGER"];

interface UserRecord { id: string; email: string; name: string | null; role: string; createdAt: string }

export default function UsersPage() {
  const qc = useQueryClient();
  const { data: users = [], isLoading } = useQuery<UserRecord[]>({ queryKey: ["users"], queryFn: () => apiJson("/users") });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<UserRecord | null>(null);
  const [form, setForm] = useState({ email: "", password: "", name: "", role: "ACCOUNTANT" });
  const [error, setError] = useState("");

  const saveMutation = useMutation({
    mutationFn: (data: any) => editing
      ? apiJson(`/users/${editing.id}`, { method: "PUT", body: JSON.stringify(data) })
      : apiJson("/users", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); setOpen(false); setEditing(null); setError(""); },
    onError: (e: any) => setError(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiJson(`/users/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });

  function openCreate() {
    setEditing(null);
    setForm({ email: "", password: "", name: "", role: "ACCOUNTANT" });
    setError("");
    setOpen(true);
  }

  function openEdit(u: UserRecord) {
    setEditing(u);
    setForm({ email: u.email, password: "", name: u.name ?? "", role: u.role });
    setError("");
    setOpen(true);
  }

  function handleSave() {
    const payload: any = { email: form.email, name: form.name, role: form.role };
    if (form.password) payload.password = form.password;
    if (!editing) payload.password = form.password;
    saveMutation.mutate(payload);
  }

  return (
    <div className="p-8 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-serif text-primary tracking-tight">Gestion des Utilisateurs</h2>
          <p className="text-muted-foreground mt-1">Créez et gérez les accès par rôle</p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <UserPlus className="w-4 h-4" /> Nouvel utilisateur
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Users className="w-4 h-4" /> {users.length} utilisateur{users.length !== 1 ? "s" : ""}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? <p className="text-muted-foreground">Chargement…</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-3 pr-4 font-medium">Nom</th>
                    <th className="pb-3 pr-4 font-medium">Email</th>
                    <th className="pb-3 pr-4 font-medium">Rôle</th>
                    <th className="pb-3 font-medium">Depuis</th>
                    <th className="pb-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {users.map(u => (
                    <tr key={u.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3 pr-4 font-medium">{u.name ?? "—"}</td>
                      <td className="py-3 pr-4 text-muted-foreground">{u.email}</td>
                      <td className="py-3 pr-4">
                        <Badge className={`text-xs ${ROLE_COLORS[u.role] ?? "bg-gray-100 text-gray-700"}`}>{ROLE_LABELS[u.role] ?? u.role}</Badge>
                      </td>
                      <td className="py-3 text-muted-foreground">{new Date(u.createdAt).toLocaleDateString("fr-MG")}</td>
                      <td className="py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(u)}><Edit2 className="w-4 h-4" /></Button>
                          <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(u.id)} className="text-destructive hover:text-destructive"><Trash2 className="w-4 h-4" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Modifier l'utilisateur" : "Nouvel utilisateur"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {error && <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">{error}</p>}
            <div className="space-y-1">
              <label className="text-sm font-medium">Nom complet</label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Marie Rakoto" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Email *</label>
              <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="utilisateur@vanillamadagascar.mg" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">{editing ? "Nouveau mot de passe (laisser vide pour ne pas changer)" : "Mot de passe *"}</label>
              <Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••••" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Rôle *</label>
              <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map(r => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending}>{saveMutation.isPending ? "Enregistrement…" : editing ? "Modifier" : "Créer"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
