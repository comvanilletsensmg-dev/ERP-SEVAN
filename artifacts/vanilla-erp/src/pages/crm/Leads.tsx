import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  UserPlus, Flame, Thermometer, Snowflake, Mail, Star,
  TrendingUp, Users, CheckCircle, ChevronRight, Zap, RefreshCw
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const API = "/api";
async function apiJson(path: string, opts?: RequestInit) {
  const r = await fetch(`${API}${path}`, { credentials: "include", headers: { "Content-Type": "application/json" }, ...opts });
  if (!r.ok) throw new Error((await r.json().catch(() => ({ error: r.statusText }))).error);
  return r.json();
}

const STAGES = ["new", "contacted", "qualified", "proposal", "won", "lost"];
const STAGE_LABELS: Record<string, string> = { new: "Nouveau", contacted: "Contacté", qualified: "Qualifié", proposal: "Devis", won: "Gagné", lost: "Perdu" };
const STAGE_COLORS: Record<string, string> = { new: "bg-slate-100 text-slate-700", contacted: "bg-blue-100 text-blue-700", qualified: "bg-amber-100 text-amber-700", proposal: "bg-purple-100 text-purple-700", won: "bg-green-100 text-green-700", lost: "bg-red-100 text-red-700" };
const SCORE_ICONS: Record<string, any> = { hot: Flame, warm: Thermometer, cold: Snowflake };
const SCORE_COLORS: Record<string, string> = { hot: "text-red-500", warm: "text-amber-500", cold: "text-blue-400" };

interface Lead {
  id: string; name: string; email: string | null; company: string | null;
  country: string | null; industry: string | null; companySize: number | null;
  website: string | null; stage: string; source: string | null; notes: string | null;
  createdAt: string; scoreLabel: string;
  enriched: { score: number; scoreDetails: string | null } | null;
}

const EMPTY: Partial<Lead> = { name: "", email: "", company: "", country: "", industry: "", website: "", stage: "new", source: "manual", notes: "" };

export default function CrmLeads() {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<"create" | "edit" | "email" | null>(null);
  const [selected, setSelected] = useState<Lead | null>(null);
  const [form, setForm] = useState<Partial<Lead>>(EMPTY);
  const [emailForm, setEmailForm] = useState({ subject: "", body: "", to: "" });
  const [err, setErr] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [scoreFilter, setScoreFilter] = useState("all");

  const { data: leads = [], isLoading } = useQuery<Lead[]>({ queryKey: ["leads"], queryFn: () => apiJson("/leads") });

  const createLead = useMutation({
    mutationFn: (d: any) => apiJson("/leads", { method: "POST", body: JSON.stringify(d) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leads"] }); setDialog(null); setForm(EMPTY); setErr(""); },
    onError: (e: any) => setErr(e.message),
  });

  const updateLead = useMutation({
    mutationFn: ({ id, ...d }: any) => apiJson(`/leads/${id}`, { method: "PATCH", body: JSON.stringify(d) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leads"] }); setDialog(null); setErr(""); },
    onError: (e: any) => setErr(e.message),
  });

  const deleteLead = useMutation({
    mutationFn: (id: string) => apiJson(`/leads/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leads"] }),
  });

  const rescoreLead = useMutation({
    mutationFn: (id: string) => apiJson(`/leads/${id}/score`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leads"] }),
  });

  const sendEmail = useMutation({
    mutationFn: ({ id, ...d }: any) => apiJson(`/leads/${id}/email`, { method: "POST", body: JSON.stringify(d) }),
    onSuccess: (data) => { alert(`Email ${data.status === "simulated" ? "simulé (pas de SMTP configuré)" : "envoyé"} avec succès`); setDialog(null); },
    onError: (e: any) => setErr(e.message),
  });

  const filtered = leads.filter(l => {
    if (stageFilter !== "all" && l.stage !== stageFilter) return false;
    if (scoreFilter !== "all" && l.scoreLabel !== scoreFilter) return false;
    return true;
  });

  const openCreate = () => { setForm(EMPTY); setErr(""); setDialog("create"); };
  const openEdit = (l: Lead) => { setSelected(l); setForm({ ...l, companySize: l.companySize ?? undefined }); setErr(""); setDialog("edit"); };
  const openEmail = (l: Lead) => { setSelected(l); setEmailForm({ subject: "Offre Vanille Madagascar", body: `Bonjour ${l.name},\n\nNous sommes un exportateur premium de vanille de Madagascar.\n\nCordialement,\nVanilla ERP`, to: l.email ?? "" }); setErr(""); setDialog("email"); };

  const stats = {
    total: leads.length,
    hot: leads.filter(l => l.scoreLabel === "hot").length,
    won: leads.filter(l => l.stage === "won").length,
    pipeline: leads.filter(l => !["won", "lost"].includes(l.stage)).length,
  };

  return (
    <div className="p-8 space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-serif text-primary tracking-tight flex items-center gap-3">
            <Users className="w-7 h-7" /> Pipeline Commercial — Leads
          </h2>
          <p className="text-muted-foreground mt-1">Gestion des prospects · Scoring IA · Automatisation email</p>
        </div>
        <Button onClick={openCreate} className="gap-2"><UserPlus className="w-4 h-4" />Nouveau lead</Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Total leads", value: stats.total, icon: Users, color: "text-primary" },
          { label: "Leads chauds", value: stats.hot, icon: Flame, color: "text-red-500" },
          { label: "Pipeline actif", value: stats.pipeline, icon: TrendingUp, color: "text-amber-500" },
          { label: "Gagnés", value: stats.won, icon: CheckCircle, color: "text-green-600" },
        ].map(k => (
          <Card key={k.label} className="shadow-sm">
            <CardContent className="pt-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg bg-muted/50 ${k.color}`}><k.icon className="w-5 h-5" /></div>
              <div><div className="text-2xl font-bold font-serif">{k.value}</div><div className="text-xs text-muted-foreground">{k.label}</div></div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Étape" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les étapes</SelectItem>
            {STAGES.map(s => <SelectItem key={s} value={s}>{STAGE_LABELS[s]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={scoreFilter} onValueChange={setScoreFilter}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Score" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les scores</SelectItem>
            <SelectItem value="hot">Chaud (&ge;70)</SelectItem>
            <SelectItem value="warm">Tiède (40-69)</SelectItem>
            <SelectItem value="cold">Froid (&lt;40)</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{filtered.length} lead(s)</span>
      </div>

      {/* Leads Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 flex items-center gap-3 text-muted-foreground"><div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />Chargement…</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">Aucun lead — créez-en un avec le bouton ci-dessus</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30">
                <tr className="text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Lead</th>
                  <th className="px-4 py-3 font-medium">Secteur</th>
                  <th className="px-4 py-3 font-medium">Pays</th>
                  <th className="px-4 py-3 font-medium">Score IA</th>
                  <th className="px-4 py-3 font-medium">Étape</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map(l => {
                  const ScoreIcon = SCORE_ICONS[l.scoreLabel] ?? Snowflake;
                  const score = l.enriched?.score ?? 0;
                  return (
                    <tr key={l.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium">{l.name}</div>
                        <div className="text-xs text-muted-foreground">{l.company ?? "—"} · {l.email ?? "pas d'email"}</div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{l.industry ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{l.country ?? "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <ScoreIcon className={`w-4 h-4 ${SCORE_COLORS[l.scoreLabel]}`} />
                          <span className="font-bold">{score}</span>
                          <span className="text-xs text-muted-foreground">/100</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={`text-xs ${STAGE_COLORS[l.stage]}`}>{STAGE_LABELS[l.stage] ?? l.stage}</Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{format(new Date(l.createdAt), "dd MMM", { locale: fr })}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => rescoreLead.mutate(l.id)} title="Recalculer score"><Star className="w-3.5 h-3.5" /></Button>
                          {l.email && <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEmail(l)} title="Envoyer email"><Mail className="w-3.5 h-3.5" /></Button>}
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(l)}><ChevronRight className="w-3.5 h-3.5" /></Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={dialog === "create" || dialog === "edit"} onOpenChange={() => setDialog(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>{dialog === "create" ? "Nouveau lead" : "Modifier le lead"}</DialogTitle></DialogHeader>
          {err && <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">{err}</p>}
          <div className="grid grid-cols-2 gap-3">
            {[
              { key: "name", label: "Nom *", placeholder: "Jean Dupont" },
              { key: "email", label: "Email", placeholder: "jean@exemple.com" },
              { key: "company", label: "Entreprise", placeholder: "Épices & Co" },
              { key: "country", label: "Pays", placeholder: "France" },
              { key: "industry", label: "Secteur", placeholder: "Import alimentaire" },
              { key: "website", label: "Site web", placeholder: "www.exemple.com" },
            ].map(f => (
              <div key={f.key} className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">{f.label}</label>
                <Input value={(form as any)[f.key] ?? ""} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} />
              </div>
            ))}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Taille entreprise</label>
              <Input type="number" value={form.companySize ?? ""} onChange={e => setForm(p => ({ ...p, companySize: Number(e.target.value) || undefined }))} placeholder="50" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Étape</label>
              <Select value={form.stage ?? "new"} onValueChange={v => setForm(p => ({ ...p, stage: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STAGES.map(s => <SelectItem key={s} value={s}>{STAGE_LABELS[s]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Notes</label>
            <Textarea value={form.notes ?? ""} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Informations complémentaires…" rows={2} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Annuler</Button>
            <Button onClick={() => dialog === "create" ? createLead.mutate(form) : updateLead.mutate({ id: selected!.id, ...form })} disabled={createLead.isPending || updateLead.isPending}>
              {dialog === "create" ? "Créer le lead" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email Dialog */}
      <Dialog open={dialog === "email"} onOpenChange={() => setDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Mail className="w-4 h-4" />Envoyer un email à {selected?.name}</DialogTitle></DialogHeader>
          {err && <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">{err}</p>}
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Destinataire</label>
              <Input value={emailForm.to} onChange={e => setEmailForm(f => ({ ...f, to: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Objet</label>
              <Input value={emailForm.subject} onChange={e => setEmailForm(f => ({ ...f, subject: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Corps — variables : &#123;&#123;name&#125;&#125;, &#123;&#123;company&#125;&#125;, &#123;&#123;product&#125;&#125;</label>
              <Textarea rows={6} value={emailForm.body} onChange={e => setEmailForm(f => ({ ...f, body: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Annuler</Button>
            <Button onClick={() => sendEmail.mutate({ id: selected!.id, subject: emailForm.subject, body: emailForm.body })} disabled={sendEmail.isPending} className="gap-2">
              <Mail className="w-4 h-4" />{sendEmail.isPending ? "Envoi…" : "Envoyer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
