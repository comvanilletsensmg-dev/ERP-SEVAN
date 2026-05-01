import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Mail, Plus, Pencil, Trash2, Eye } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const API = "/api";
async function apiJson(path: string, opts?: RequestInit) {
  const r = await fetch(`${API}${path}`, { credentials: "include", headers: { "Content-Type": "application/json" }, ...opts });
  if (!r.ok) throw new Error((await r.json().catch(() => ({ error: r.statusText }))).error);
  return r.json();
}

interface Template { id: string; name: string; subject: string; body: string; category: string; createdAt: string; }

const CATEGORIES = ["general", "welcome", "followup", "reminder", "proposal"];
const CAT_LABELS: Record<string, string> = { general: "Général", welcome: "Bienvenue", followup: "Suivi", reminder: "Relance", proposal: "Devis" };
const CAT_COLORS: Record<string, string> = { general: "bg-slate-100 text-slate-700", welcome: "bg-green-100 text-green-700", followup: "bg-blue-100 text-blue-700", reminder: "bg-amber-100 text-amber-700", proposal: "bg-purple-100 text-purple-700" };
const VARIABLES = ["{{name}}", "{{company}}", "{{product}}", "{{invoice}}", "{{amount}}"];

const EMPTY = { name: "", subject: "", body: "", category: "general" };

export default function CrmTemplates() {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<"create" | "edit" | "preview" | null>(null);
  const [selected, setSelected] = useState<Template | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [err, setErr] = useState("");

  const { data: templates = [], isLoading } = useQuery<Template[]>({ queryKey: ["crm-templates"], queryFn: () => apiJson("/crm/templates") });

  const create = useMutation({
    mutationFn: (d: any) => apiJson("/crm/templates", { method: "POST", body: JSON.stringify(d) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["crm-templates"] }); setDialog(null); setForm(EMPTY); setErr(""); },
    onError: (e: any) => setErr(e.message),
  });

  const update = useMutation({
    mutationFn: ({ id, ...d }: any) => apiJson(`/crm/templates/${id}`, { method: "PATCH", body: JSON.stringify(d) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["crm-templates"] }); setDialog(null); setErr(""); },
    onError: (e: any) => setErr(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiJson(`/crm/templates/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-templates"] }),
  });

  const openCreate = () => { setForm(EMPTY); setErr(""); setDialog("create"); };
  const openEdit = (t: Template) => { setSelected(t); setForm({ name: t.name, subject: t.subject, body: t.body, category: t.category }); setErr(""); setDialog("edit"); };
  const openPreview = (t: Template) => { setSelected(t); setDialog("preview"); };

  const insertVar = (v: string) => setForm(f => ({ ...f, body: f.body + v }));

  return (
    <div className="p-8 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-serif text-primary tracking-tight flex items-center gap-3">
            <Mail className="w-7 h-7" /> Templates Email
          </h2>
          <p className="text-muted-foreground mt-1">Gérez vos modèles d'emails avec variables dynamiques</p>
        </div>
        <Button onClick={openCreate} className="gap-2"><Plus className="w-4 h-4" />Nouveau template</Button>
      </div>

      {isLoading ? (
        <div className="p-8 flex items-center gap-3 text-muted-foreground"><div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />Chargement…</div>
      ) : templates.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">Aucun template — créez-en un</CardContent></Card>
      ) : (
        <div className="grid gap-4">
          {templates.map(t => (
            <Card key={t.id} className="shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold">{t.name}</span>
                      <Badge className={`text-xs ${CAT_COLORS[t.category] ?? CAT_COLORS.general}`}>{CAT_LABELS[t.category] ?? t.category}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground font-medium">Objet : {t.subject}</p>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2 whitespace-pre-wrap">{t.body}</p>
                    <p className="text-xs text-muted-foreground/60 mt-2">{format(new Date(t.createdAt), "dd MMM yyyy", { locale: fr })}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openPreview(t)}><Eye className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEdit(t)}><Pencil className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive hover:text-destructive" onClick={() => remove.mutate(t.id)}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialog === "create" || dialog === "edit"} onOpenChange={() => setDialog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{dialog === "create" ? "Nouveau template" : "Modifier le template"}</DialogTitle></DialogHeader>
          {err && <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">{err}</p>}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Nom *</label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Email de bienvenue" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Catégorie</label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{CAT_LABELS[c]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Objet *</label>
              <Input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} placeholder="Offre vanille Madagascar — &#123;&#123;company&#125;&#125;" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">Corps *</label>
                <div className="flex gap-1">
                  {VARIABLES.map(v => (
                    <button key={v} onClick={() => insertVar(v)} className="text-xs px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 font-mono text-primary">{v}</button>
                  ))}
                </div>
              </div>
              <Textarea rows={8} value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} placeholder={`Bonjour {{name}},\n\nNous proposons de la vanille gourmet de Madagascar...\n\nCordialement,\nVanilla ERP`} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Annuler</Button>
            <Button onClick={() => dialog === "create" ? create.mutate(form) : update.mutate({ id: selected!.id, ...form })} disabled={create.isPending || update.isPending}>
              {dialog === "create" ? "Créer" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={dialog === "preview"} onOpenChange={() => setDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Eye className="w-4 h-4" />Aperçu : {selected?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="p-3 bg-muted/30 rounded">
              <span className="text-xs text-muted-foreground font-medium">Objet : </span>
              <span className="text-sm">{selected?.subject}</span>
            </div>
            <div className="p-3 bg-muted/30 rounded min-h-[150px]">
              <pre className="text-sm whitespace-pre-wrap font-sans">{selected?.body}</pre>
            </div>
            <div className="flex flex-wrap gap-1">
              {VARIABLES.map(v => <Badge key={v} variant="outline" className="font-mono text-xs">{v}</Badge>)}
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setDialog(null)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
