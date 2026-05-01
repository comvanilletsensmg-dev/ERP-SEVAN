import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Phone, Mail, Users, MessageSquare, StickyNote, Plus, Activity } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

const API = "/api";
async function apiJson(path: string, opts?: RequestInit) {
  const r = await fetch(`${API}${path}`, { credentials: "include", headers: { "Content-Type": "application/json" }, ...opts });
  if (!r.ok) throw new Error((await r.json().catch(() => ({ error: r.statusText }))).error ?? r.statusText);
  return r.json();
}

interface Interaction {
  id: string; type: string; note: string;
  prospectId: string | null; clientId: string | null; dealId: string | null;
  createdBy: string; createdAt: string;
}

const TYPE_CONFIG: Record<string, { label: string; icon: any; color: string; bg: string }> = {
  call:     { label: "Appel",     icon: Phone,         color: "text-green-600",  bg: "bg-green-100"  },
  email:    { label: "Email",     icon: Mail,          color: "text-blue-600",   bg: "bg-blue-100"   },
  meeting:  { label: "Réunion",   icon: Users,         color: "text-purple-600", bg: "bg-purple-100" },
  whatsapp: { label: "WhatsApp",  icon: MessageSquare, color: "text-teal-600",   bg: "bg-teal-100"   },
  note:     { label: "Note",      icon: StickyNote,    color: "text-amber-600",  bg: "bg-amber-100"  },
};

const TYPES = Object.keys(TYPE_CONFIG);
const EMPTY = { type: "call", note: "", prospectId: "", clientId: "", dealId: "" };

export default function CrmInteractions() {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [err, setErr] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [search, setSearch] = useState("");

  const { data: interactions = [], isLoading } = useQuery<Interaction[]>({
    queryKey: ["interactions"], queryFn: () => apiJson("/crm/interactions"),
  });

  const create = useMutation({
    mutationFn: (d: any) => apiJson("/crm/interactions", { method: "POST", body: JSON.stringify(d) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["interactions"] }); setDialog(false); setForm(EMPTY); setErr(""); },
    onError: (e: any) => setErr(e.message),
  });

  const filtered = interactions
    .filter(i => filterType === "all" || i.type === filterType)
    .filter(i => !search || i.note.toLowerCase().includes(search.toLowerCase()));

  const counts = TYPES.reduce((acc, t) => ({ ...acc, [t]: interactions.filter(i => i.type === t).length }), {} as Record<string, number>);

  return (
    <div className="p-8 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-serif text-primary flex items-center gap-3">
            <Activity className="w-7 h-7" /> Journal d'activités
          </h2>
          <p className="text-muted-foreground mt-1">Toutes les interactions : appels, emails, réunions, notes</p>
        </div>
        <Button onClick={() => { setForm(EMPTY); setErr(""); setDialog(true); }} className="gap-2">
          <Plus className="w-4 h-4" />Nouvelle interaction
        </Button>
      </div>

      {/* Type chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setFilterType("all")}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${filterType === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
        >
          Tous ({interactions.length})
        </button>
        {TYPES.map(t => {
          const cfg = TYPE_CONFIG[t];
          const Icon = cfg.icon;
          return (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${filterType === t ? `${cfg.bg} ${cfg.color}` : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
            >
              <Icon className="w-3.5 h-3.5" />{cfg.label} ({counts[t] ?? 0})
            </button>
          );
        })}
        <Input
          placeholder="Rechercher…" value={search} onChange={e => setSearch(e.target.value)}
          className="w-40 h-8 text-sm ml-auto"
        />
      </div>

      {/* Timeline */}
      {isLoading ? (
        <div className="flex items-center gap-3 text-muted-foreground py-8">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />Chargement…
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-muted-foreground py-12 border-2 border-dashed rounded-xl">
          Aucune interaction — enregistrez la première avec le bouton ci-dessus
        </div>
      ) : (
        <div className="relative">
          <div className="absolute left-6 top-0 bottom-0 w-px bg-border" />
          <div className="space-y-4">
            {filtered.map((interaction, idx) => {
              const cfg = TYPE_CONFIG[interaction.type] ?? TYPE_CONFIG.note;
              const Icon = cfg.icon;
              const date = new Date(interaction.createdAt);
              return (
                <div key={interaction.id} className="flex gap-4 pl-0">
                  {/* Icon circle */}
                  <div className={`relative z-10 w-12 h-12 rounded-full ${cfg.bg} flex items-center justify-center shrink-0 border-2 border-background shadow-sm`}>
                    <Icon className={`w-5 h-5 ${cfg.color}`} />
                  </div>
                  {/* Content */}
                  <div className="flex-1 bg-background rounded-xl border p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                      <Badge className={`text-xs ${cfg.bg} ${cfg.color} border-0`}>{cfg.label}</Badge>
                      <div className="text-xs text-muted-foreground" title={format(date, "PPpp", { locale: fr })}>
                        {formatDistanceToNow(date, { addSuffix: true, locale: fr })}
                      </div>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{interaction.note}</p>
                    <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                      {interaction.prospectId && <span>Prospect: {interaction.prospectId.slice(0, 8)}…</span>}
                      {interaction.clientId && <span>Client: {interaction.clientId.slice(0, 8)}…</span>}
                      {interaction.dealId && <span>Deal: {interaction.dealId.slice(0, 8)}…</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nouvelle interaction</DialogTitle></DialogHeader>
          {err && <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">{err}</p>}
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Type *</label>
              <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPES.map(t => (
                    <SelectItem key={t} value={t}>
                      {TYPE_CONFIG[t].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Note *</label>
              <Textarea
                value={form.note}
                onChange={e => setForm(p => ({ ...p, note: e.target.value }))}
                placeholder="Résumé de l'échange, prochaines étapes, points clés…"
                rows={4}
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: "prospectId", label: "ID Prospect" },
                { key: "clientId", label: "ID Client" },
                { key: "dealId", label: "ID Deal" },
              ].map(f => (
                <div key={f.key} className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">{f.label}</label>
                  <Input
                    className="text-xs" placeholder="(optionnel)"
                    value={(form as any)[f.key]}
                    onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)}>Annuler</Button>
            <Button onClick={() => create.mutate(form)} disabled={create.isPending || !form.note.trim()}>
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
