import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BellRing, Send, XCircle, Plus, RefreshCw, Clock, CheckCircle } from "lucide-react";
import { format, isPast } from "date-fns";
import { fr } from "date-fns/locale";

const API = "/api";
async function apiJson(path: string, opts?: RequestInit) {
  const r = await fetch(`${API}${path}`, { credentials: "include", headers: { "Content-Type": "application/json" }, ...opts });
  if (!r.ok) throw new Error((await r.json().catch(() => ({ error: r.statusText }))).error);
  return r.json();
}

interface Reminder {
  id: string; clientEmail: string; clientName: string | null; invoiceRef: string | null;
  type: string; dueDate: string; status: string; sentAt: string | null; notes: string | null; createdAt: string;
}

const STATUS_LABELS: Record<string, string> = { pending: "En attente", sent: "Envoyée", cancelled: "Annulée" };
const STATUS_COLORS: Record<string, string> = { pending: "bg-amber-100 text-amber-700", sent: "bg-green-100 text-green-700", cancelled: "bg-gray-100 text-gray-500" };
const TYPE_LABELS: Record<string, string> = { payment: "Paiement", followup: "Suivi", proposal: "Devis" };
const EMPTY = { clientEmail: "", clientName: "", invoiceRef: "", type: "payment", dueDate: new Date().toISOString().slice(0, 10), notes: "" };

export default function CrmReminders() {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [err, setErr] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: reminders = [], isLoading } = useQuery<Reminder[]>({ queryKey: ["crm-reminders"], queryFn: () => apiJson("/crm/reminders") });

  const create = useMutation({
    mutationFn: (d: any) => apiJson("/crm/reminders", { method: "POST", body: JSON.stringify(d) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["crm-reminders"] }); setDialog(false); setForm(EMPTY); setErr(""); },
    onError: (e: any) => setErr(e.message),
  });

  const send = useMutation({
    mutationFn: (id: string) => apiJson(`/crm/reminders/${id}/send`, { method: "PATCH" }),
    onSuccess: (data) => { qc.invalidateQueries({ queryKey: ["crm-reminders"] }); alert(`Relance ${data.emailResult?.status === "simulated" ? "simulée (pas de SMTP)" : "envoyée"} !`); },
    onError: (e: any) => alert(e.message),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => apiJson(`/crm/reminders/${id}/cancel`, { method: "PATCH" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-reminders"] }),
  });

  const checkOverdue = useMutation({
    mutationFn: () => apiJson("/crm/reminders/check-overdue", { method: "POST" }),
    onSuccess: (data) => { qc.invalidateQueries({ queryKey: ["crm-reminders"] }); alert(`${data.created} nouvelle(s) relance(s) créée(s) sur ${data.checked} facture(s) vérifiée(s)`); },
    onError: (e: any) => alert(e.message),
  });

  const filtered = reminders.filter(r => statusFilter === "all" || r.status === statusFilter);

  const stats = {
    pending: reminders.filter(r => r.status === "pending").length,
    overdue: reminders.filter(r => r.status === "pending" && isPast(new Date(r.dueDate))).length,
    sent: reminders.filter(r => r.status === "sent").length,
  };

  return (
    <div className="p-8 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-serif text-primary tracking-tight flex items-center gap-3">
            <BellRing className="w-7 h-7" /> Relances Clients
          </h2>
          <p className="text-muted-foreground mt-1">Suivi des relances paiements et commerciales</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => checkOverdue.mutate()} disabled={checkOverdue.isPending} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${checkOverdue.isPending ? "animate-spin" : ""}`} />
            Détecter factures en retard
          </Button>
          <Button onClick={() => { setForm(EMPTY); setErr(""); setDialog(true); }} className="gap-2">
            <Plus className="w-4 h-4" />Nouvelle relance
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "En attente", value: stats.pending, icon: Clock, color: "text-amber-500" },
          { label: "En retard", value: stats.overdue, icon: BellRing, color: "text-red-500" },
          { label: "Envoyées", value: stats.sent, icon: CheckCircle, color: "text-green-600" },
        ].map(k => (
          <Card key={k.label} className="shadow-sm">
            <CardContent className="pt-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg bg-muted/50 ${k.color}`}><k.icon className="w-5 h-5" /></div>
              <div><div className="text-2xl font-bold font-serif">{k.value}</div><div className="text-xs text-muted-foreground">{k.label}</div></div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{filtered.length} relance(s)</span>
      </div>

      {/* List */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 flex items-center gap-3 text-muted-foreground"><div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />Chargement…</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">Aucune relance — utilisez "Détecter factures en retard" ou créez-en une manuellement</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30">
                <tr className="text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Client</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Facture</th>
                  <th className="px-4 py-3 font-medium">Échéance</th>
                  <th className="px-4 py-3 font-medium">Statut</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map(r => {
                  const isOverdue = r.status === "pending" && isPast(new Date(r.dueDate));
                  return (
                    <tr key={r.id} className={`hover:bg-muted/20 ${isOverdue ? "bg-red-50/50" : ""}`}>
                      <td className="px-4 py-3">
                        <div className="font-medium">{r.clientName ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{r.clientEmail}</div>
                      </td>
                      <td className="px-4 py-3"><Badge variant="outline" className="text-xs">{TYPE_LABELS[r.type] ?? r.type}</Badge></td>
                      <td className="px-4 py-3 font-mono text-xs">{r.invoiceRef ?? "—"}</td>
                      <td className="px-4 py-3">
                        <div className={isOverdue ? "text-red-600 font-medium" : ""}>{format(new Date(r.dueDate), "dd MMM yyyy", { locale: fr })}</div>
                        {isOverdue && <div className="text-xs text-red-500">En retard</div>}
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={`text-xs ${STATUS_COLORS[r.status]}`}>{STATUS_LABELS[r.status]}</Badge>
                        {r.sentAt && <div className="text-xs text-muted-foreground mt-0.5">{format(new Date(r.sentAt), "dd MMM", { locale: fr })}</div>}
                      </td>
                      <td className="px-4 py-3">
                        {r.status === "pending" && (
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => send.mutate(r.id)} disabled={send.isPending}>
                              <Send className="w-3 h-3" />Envoyer
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground" onClick={() => cancel.mutate(r.id)}>
                              <XCircle className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={dialog} onOpenChange={() => setDialog(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nouvelle relance</DialogTitle></DialogHeader>
          {err && <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">{err}</p>}
          <div className="space-y-3">
            {[
              { key: "clientEmail", label: "Email client *", placeholder: "client@exemple.com" },
              { key: "clientName", label: "Nom client", placeholder: "Jean Dupont" },
              { key: "invoiceRef", label: "N° facture", placeholder: "FAC-2026-0001" },
            ].map(f => (
              <div key={f.key} className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">{f.label}</label>
                <Input value={(form as any)[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} />
              </div>
            ))}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Type</label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Échéance *</label>
                <Input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)}>Annuler</Button>
            <Button onClick={() => create.mutate(form)} disabled={create.isPending}>Créer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
