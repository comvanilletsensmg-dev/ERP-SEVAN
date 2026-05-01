import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Building2, Phone, Mail, UserCheck, Plus, Flame, Thermometer,
  Snowflake, ChevronRight, Globe, Users, TrendingUp, Star
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const API = "/api";
async function apiJson(path: string, opts?: RequestInit) {
  const r = await fetch(`${API}${path}`, { credentials: "include", headers: { "Content-Type": "application/json" }, ...opts });
  if (!r.ok) throw new Error((await r.json().catch(() => ({ error: r.statusText }))).error ?? r.statusText);
  return r.json();
}

interface Prospect {
  id: string; company: string; contact: string | null; email: string | null;
  phone: string | null; country: string; source: string; status: string;
  score: number; notes: string | null; createdAt: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; next?: string; nextLabel?: string }> = {
  to_contact: { label: "À contacter",  color: "bg-amber-100 text-amber-700",  next: "contact",  nextLabel: "Marquer contacté" },
  contacted:  { label: "Contacté",     color: "bg-blue-100 text-blue-700",    next: "qualify",  nextLabel: "Qualifier" },
  qualified:  { label: "Qualifié",     color: "bg-purple-100 text-purple-700", next: "convert", nextLabel: "Convertir en client" },
  converted:  { label: "Converti",     color: "bg-green-100 text-green-700" },
};

const SCORE_ICON = (s: number) => s >= 70 ? Flame : s >= 40 ? Thermometer : Snowflake;
const SCORE_COLOR = (s: number) => s >= 70 ? "text-red-500" : s >= 40 ? "text-amber-500" : "text-blue-400";

const SOURCES = ["manuel", "Kompass", "web", "referral", "salon"];
const EMPTY = { company: "", contact: "", email: "", phone: "", country: "", source: "manuel", notes: "" };

export default function CrmProspects() {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<"create" | "edit" | null>(null);
  const [selected, setSelected] = useState<Prospect | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [err, setErr] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: prospects = [], isLoading } = useQuery<Prospect[]>({
    queryKey: ["prospects"],
    queryFn: () => apiJson("/sales/prospects"),
  });

  const create = useMutation({
    mutationFn: (d: any) => apiJson("/sales/prospects", { method: "POST", body: JSON.stringify(d) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["prospects"] }); setDialog(null); setForm(EMPTY); setErr(""); },
    onError: (e: any) => setErr(e.message),
  });

  const update = useMutation({
    mutationFn: ({ id, ...d }: any) => apiJson(`/sales/prospects/${id}`, { method: "PUT", body: JSON.stringify(d) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["prospects"] }); setDialog(null); setErr(""); },
    onError: (e: any) => setErr(e.message),
  });

  const advance = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) => apiJson(`/sales/prospects/${id}/${action}`, { method: "PATCH" }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["prospects"] });
      if (data.clientTemplate) {
        alert(`✅ Prospect converti ! Créez maintenant le client : ${data.clientTemplate.name} (${data.clientTemplate.country})`);
      }
    },
    onError: (e: any) => alert(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiJson(`/sales/prospects/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prospects"] }),
  });

  const filtered = prospects.filter(p => statusFilter === "all" || p.status === statusFilter);

  const stats = {
    total: prospects.length,
    toContact: prospects.filter(p => p.status === "to_contact").length,
    qualified: prospects.filter(p => p.status === "qualified").length,
    converted: prospects.filter(p => p.status === "converted").length,
    conversionRate: prospects.length > 0 ? Math.round((prospects.filter(p => p.status === "converted").length / prospects.length) * 100) : 0,
  };

  const openCreate = () => { setForm(EMPTY); setErr(""); setDialog("create"); };
  const openEdit = (p: Prospect) => {
    setSelected(p);
    setForm({ company: p.company, contact: p.contact ?? "", email: p.email ?? "", phone: p.phone ?? "", country: p.country, source: p.source, notes: p.notes ?? "" });
    setErr(""); setDialog("edit");
  };

  return (
    <div className="p-8 space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-serif text-primary tracking-tight flex items-center gap-3">
            <Globe className="w-7 h-7" /> Prospects
          </h2>
          <p className="text-muted-foreground mt-1">Gestion des prospects — pipeline to_contact → contacté → qualifié → client</p>
        </div>
        <Button onClick={openCreate} className="gap-2"><Plus className="w-4 h-4" />Nouveau prospect</Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total",          value: stats.total,          icon: Users,      color: "text-primary" },
          { label: "À contacter",    value: stats.toContact,      icon: Phone,      color: "text-amber-500" },
          { label: "Qualifiés",      value: stats.qualified,      icon: Star,       color: "text-purple-500" },
          { label: "Taux conversion",value: `${stats.conversionRate}%`, icon: TrendingUp, color: "text-green-600" },
        ].map(k => (
          <Card key={k.label} className="shadow-sm">
            <CardContent className="pt-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg bg-muted/50 ${k.color}`}><k.icon className="w-5 h-5" /></div>
              <div>
                <div className="text-2xl font-bold font-serif">{k.value}</div>
                <div className="text-xs text-muted-foreground">{k.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{filtered.length} prospect(s)</span>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 flex items-center gap-3 text-muted-foreground">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />Chargement…
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">Aucun prospect — créez-en un avec le bouton ci-dessus</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30">
                <tr className="text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Entreprise</th>
                  <th className="px-4 py-3 font-medium">Contact</th>
                  <th className="px-4 py-3 font-medium">Pays</th>
                  <th className="px-4 py-3 font-medium">Source</th>
                  <th className="px-4 py-3 font-medium">Score</th>
                  <th className="px-4 py-3 font-medium">Statut</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map(p => {
                  const cfg = STATUS_CONFIG[p.status] ?? { label: p.status, color: "bg-gray-100 text-gray-600" };
                  const ScoreIcon = SCORE_ICON(p.score);
                  return (
                    <tr key={p.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <div className="font-medium flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                          {p.company}
                        </div>
                        {p.email && <div className="text-xs text-muted-foreground mt-0.5">{p.email}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <div>{p.contact ?? "—"}</div>
                        {p.phone && <div className="text-xs text-muted-foreground">{p.phone}</div>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{p.country}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-xs">{p.source}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <ScoreIcon className={`w-4 h-4 ${SCORE_COLOR(p.score)}`} />
                          <span className="font-bold">{p.score}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={`text-xs ${cfg.color}`}>{cfg.label}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 flex-wrap">
                          {/* Quick action buttons */}
                          {p.phone && (
                            <a href={`tel:${p.phone}`}>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Appeler"><Phone className="w-3.5 h-3.5" /></Button>
                            </a>
                          )}
                          {p.email && (
                            <a href={`mailto:${p.email}`}>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Email"><Mail className="w-3.5 h-3.5" /></Button>
                            </a>
                          )}
                          {/* Status advancement */}
                          {cfg.next && (
                            <Button
                              size="sm"
                              variant={cfg.next === "convert" ? "default" : "outline"}
                              className={`h-7 text-xs gap-1 ${cfg.next === "convert" ? "bg-green-600 hover:bg-green-700" : ""}`}
                              onClick={() => advance.mutate({ id: p.id, action: cfg.next! })}
                              disabled={advance.isPending}
                            >
                              {cfg.next === "convert" ? <UserCheck className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                              {cfg.nextLabel}
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(p)}><ChevronRight className="w-3.5 h-3.5" /></Button>
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
      <Dialog open={dialog !== null} onOpenChange={() => setDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{dialog === "create" ? "Nouveau prospect" : "Modifier le prospect"}</DialogTitle></DialogHeader>
          {err && <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">{err}</p>}
          <div className="grid grid-cols-2 gap-3">
            {[
              { key: "company",  label: "Entreprise *", placeholder: "Épices du Monde" },
              { key: "country",  label: "Pays *",        placeholder: "France" },
              { key: "contact",  label: "Contact",       placeholder: "Jean Martin" },
              { key: "phone",    label: "Téléphone",     placeholder: "+33 6 00 00 00 00" },
              { key: "email",    label: "Email",         placeholder: "jean@exemple.com" },
            ].map(f => (
              <div key={f.key} className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">{f.label}</label>
                <Input value={(form as any)[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} />
              </div>
            ))}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Source</label>
              <Select value={form.source} onValueChange={v => setForm(p => ({ ...p, source: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Notes</label>
            <Textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Intéressé par la vanille Bourbon, préfère la livraison trimestrielle…" rows={2} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Annuler</Button>
            <Button
              onClick={() => dialog === "create" ? create.mutate(form) : update.mutate({ id: selected!.id, ...form })}
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
