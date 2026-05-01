import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Plus, DollarSign, TrendingUp, Target, Trophy, X, Edit3 } from "lucide-react";

const API = "/api";
async function apiJson(path: string, opts?: RequestInit) {
  const r = await fetch(`${API}${path}`, { credentials: "include", headers: { "Content-Type": "application/json" }, ...opts });
  if (!r.ok) throw new Error((await r.json().catch(() => ({ error: r.statusText }))).error ?? r.statusText);
  return r.json();
}

interface Deal {
  id: string; title: string; prospectId: string | null; clientId: string | null;
  stage: string; value: number; currency: string; probability: number;
  expectedClose: string | null; notes: string | null; assignedTo: string | null;
  createdAt: string;
}

const STAGES = [
  { key: "prospect",    label: "Prospect",    color: "bg-slate-100 border-slate-300",   badge: "bg-slate-100 text-slate-700",    dot: "bg-slate-400"   },
  { key: "contact",     label: "Contact",     color: "bg-blue-50 border-blue-200",      badge: "bg-blue-100 text-blue-700",      dot: "bg-blue-500"    },
  { key: "negotiation", label: "Négociation", color: "bg-amber-50 border-amber-200",    badge: "bg-amber-100 text-amber-700",    dot: "bg-amber-500"   },
  { key: "proposal",   label: "Proposition",  color: "bg-purple-50 border-purple-200",  badge: "bg-purple-100 text-purple-700",  dot: "bg-purple-500"  },
  { key: "won",        label: "Gagné ✓",      color: "bg-green-50 border-green-200",    badge: "bg-green-100 text-green-700",    dot: "bg-green-500"   },
  { key: "lost",       label: "Perdu",        color: "bg-red-50 border-red-200",        badge: "bg-red-100 text-red-700",        dot: "bg-red-400"     },
];

const CURRENCIES = ["USD", "EUR", "MGA"];
const EMPTY_FORM = { title: "", value: "", currency: "USD", stage: "prospect", probability: "20", expectedClose: "", notes: "" };

function fmtMoney(v: number, cur: string) {
  if (cur === "MGA") return `${v.toLocaleString()} MGA`;
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(v);
}

export default function CrmDeals() {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<"create" | "edit" | null>(null);
  const [selected, setSelected] = useState<Deal | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [err, setErr] = useState("");
  const [dragDeal, setDragDeal] = useState<Deal | null>(null);

  const { data: deals = [], isLoading } = useQuery<Deal[]>({
    queryKey: ["deals"], queryFn: () => apiJson("/crm/deals"),
  });

  const create = useMutation({
    mutationFn: (d: any) => apiJson("/crm/deals", { method: "POST", body: JSON.stringify(d) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["deals"] }); setDialog(null); setForm(EMPTY_FORM); setErr(""); },
    onError: (e: any) => setErr(e.message),
  });

  const update = useMutation({
    mutationFn: ({ id, ...d }: any) => apiJson(`/crm/deals/${id}`, { method: "PUT", body: JSON.stringify(d) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["deals"] }); setDialog(null); setErr(""); },
    onError: (e: any) => setErr(e.message),
  });

  const moveStage = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) =>
      apiJson(`/crm/deals/${id}/stage`, { method: "PATCH", body: JSON.stringify({ stage }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deals"] }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiJson(`/crm/deals/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deals"] }),
  });

  const openCreate = () => { setForm(EMPTY_FORM); setErr(""); setDialog("create"); };
  const openEdit = (d: Deal) => {
    setSelected(d);
    setForm({
      title: d.title, value: String(d.value), currency: d.currency,
      stage: d.stage, probability: String(d.probability),
      expectedClose: d.expectedClose ? d.expectedClose.substring(0, 10) : "",
      notes: d.notes ?? "",
    });
    setErr(""); setDialog("edit");
  };

  const handleDrop = (stage: string) => {
    if (dragDeal && dragDeal.stage !== stage) {
      moveStage.mutate({ id: dragDeal.id, stage });
    }
    setDragDeal(null);
  };

  // KPIs
  const pipeline = deals.filter(d => !["won", "lost"].includes(d.stage));
  const pipelineValue = pipeline.reduce((s, d) => s + d.value, 0);
  const wonDeals = deals.filter(d => d.stage === "won");
  const wonValue = wonDeals.reduce((s, d) => s + d.value, 0);
  const convRate = deals.length > 0 ? Math.round(wonDeals.length / deals.length * 100) : 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-6 border-b bg-background flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-2xl font-serif text-primary flex items-center gap-2">
            <Target className="w-6 h-6" /> Pipeline des deals
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">Glissez les cartes pour changer de stage</p>
        </div>
        <Button onClick={openCreate} className="gap-2"><Plus className="w-4 h-4" />Nouveau deal</Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4 px-6 py-3 border-b bg-muted/20 shrink-0">
        {[
          { label: "Pipeline actif", value: fmtMoney(pipelineValue, "USD"), icon: TrendingUp, color: "text-blue-600" },
          { label: "Gagné (total)", value: fmtMoney(wonValue, "USD"), icon: Trophy, color: "text-green-600" },
          { label: "Taux conversion", value: `${convRate}%`, icon: Target, color: "text-purple-600" },
        ].map(k => (
          <div key={k.label} className="flex items-center gap-3 bg-background rounded-lg px-4 py-2.5 border">
            <k.icon className={`w-5 h-5 ${k.color}`} />
            <div>
              <div className="font-bold text-lg leading-tight">{k.value}</div>
              <div className="text-xs text-muted-foreground">{k.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Kanban Board */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground gap-3">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />Chargement…
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto">
          <div className="flex gap-3 p-4 h-full min-w-max">
            {STAGES.map(stage => {
              const stageDeal = deals.filter(d => d.stage === stage.key);
              const stageValue = stageDeal.reduce((s, d) => s + d.value, 0);
              return (
                <div
                  key={stage.key}
                  className={`w-64 flex flex-col rounded-xl border-2 ${stage.color} transition-all`}
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => handleDrop(stage.key)}
                >
                  {/* Column header */}
                  <div className="p-3 border-b border-current/10">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-2.5 h-2.5 rounded-full ${stage.dot}`} />
                        <span className="font-semibold text-sm">{stage.label}</span>
                      </div>
                      <Badge variant="outline" className="text-xs">{stageDeal.length}</Badge>
                    </div>
                    {stageValue > 0 && (
                      <div className="text-xs text-muted-foreground mt-1">{fmtMoney(stageValue, "USD")}</div>
                    )}
                  </div>

                  {/* Cards */}
                  <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {stageDeal.map(deal => (
                      <div
                        key={deal.id}
                        draggable
                        onDragStart={() => setDragDeal(deal)}
                        onDragEnd={() => setDragDeal(null)}
                        className={`bg-white rounded-lg p-3 border shadow-sm cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow ${dragDeal?.id === deal.id ? "opacity-50" : ""}`}
                      >
                        <div className="flex items-start justify-between gap-1 mb-2">
                          <span className="font-medium text-sm leading-snug">{deal.title}</span>
                          <button onClick={() => openEdit(deal)} className="text-muted-foreground hover:text-foreground shrink-0 mt-0.5">
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-primary">{fmtMoney(deal.value, deal.currency)}</span>
                          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{deal.probability}%</span>
                        </div>
                        {deal.expectedClose && (
                          <div className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                            <span>📅</span> {new Date(deal.expectedClose).toLocaleDateString("fr-FR")}
                          </div>
                        )}
                      </div>
                    ))}
                    {stageDeal.length === 0 && (
                      <div className="text-center text-xs text-muted-foreground py-6 border-2 border-dashed rounded-lg">
                        Déposez ici
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialog !== null} onOpenChange={() => setDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{dialog === "create" ? "Nouveau deal" : "Modifier le deal"}</DialogTitle></DialogHeader>
          {err && <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">{err}</p>}
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Titre *</label>
              <Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Contrat vanille Bourbon — Épices du Monde" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Valeur *</label>
                <Input type="number" value={form.value} onChange={e => setForm(p => ({ ...p, value: e.target.value }))} placeholder="15000" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Devise</label>
                <Select value={form.currency} onValueChange={v => setForm(p => ({ ...p, currency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Stage</label>
                <Select value={form.stage} onValueChange={v => setForm(p => ({ ...p, stage: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STAGES.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Probabilité (%)</label>
                <Input type="number" min="0" max="100" value={form.probability} onChange={e => setForm(p => ({ ...p, probability: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Clôture prévue</label>
              <Input type="date" value={form.expectedClose} onChange={e => setForm(p => ({ ...p, expectedClose: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Notes</label>
              <Textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Annuler</Button>
            {dialog === "edit" && selected && (
              <Button variant="destructive" onClick={() => { remove.mutate(selected.id); setDialog(null); }} className="mr-auto">
                Supprimer
              </Button>
            )}
            <Button
              onClick={() => {
                const payload = { ...form, value: Number(form.value), probability: Number(form.probability) };
                dialog === "create" ? create.mutate(payload) : update.mutate({ id: selected!.id, ...payload });
              }}
              disabled={create.isPending || update.isPending}
            >
              {dialog === "create" ? "Créer" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
