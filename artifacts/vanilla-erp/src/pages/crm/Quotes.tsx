import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, FileText, Send, CheckCircle, XCircle, Clock, DollarSign } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const API = "/api";
async function apiJson(path: string, opts?: RequestInit) {
  const r = await fetch(`${API}${path}`, { credentials: "include", headers: { "Content-Type": "application/json" }, ...opts });
  if (!r.ok) throw new Error((await r.json().catch(() => ({ error: r.statusText }))).error ?? r.statusText);
  return r.json();
}

interface QuoteItem { id: string; description: string; quantity: number; unitPrice: number; total: number; lotId: string | null; }
interface Quote {
  id: string; number: string; clientId: string; dealId: string | null;
  totalHT: number; tva: number; totalTTC: number; currency: string;
  status: string; validUntil: string | null; notes: string | null;
  createdAt: string; items: QuoteItem[];
}
interface Client { id: string; name: string; country: string; currency: string; }

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  draft:    { label: "Brouillon",  color: "bg-slate-100 text-slate-700",  icon: FileText    },
  sent:     { label: "Envoyé",     color: "bg-blue-100 text-blue-700",    icon: Send        },
  accepted: { label: "Accepté",    color: "bg-green-100 text-green-700",  icon: CheckCircle },
  rejected: { label: "Refusé",     color: "bg-red-100 text-red-700",      icon: XCircle     },
  expired:  { label: "Expiré",     color: "bg-amber-100 text-amber-700",  icon: Clock       },
};

const CURRENCIES = ["USD", "EUR", "MGA"];

function fmtMoney(v: number, cur: string) {
  if (cur === "MGA") return `${v.toLocaleString("fr-FR")} MGA`;
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(v);
}

interface FormItem { description: string; quantity: string; unitPrice: string; lotId: string; }

export default function CrmQuotes() {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<"create" | "detail" | null>(null);
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [err, setErr] = useState("");

  // Form state for creating quotes
  const [clientId, setClientId] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<FormItem[]>([{ description: "", quantity: "1", unitPrice: "", lotId: "" }]);

  const { data: quotes = [], isLoading } = useQuery<Quote[]>({
    queryKey: ["quotes"], queryFn: () => apiJson("/crm/quotes"),
  });

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ["clients"], queryFn: () => apiJson("/clients"),
  });

  const create = useMutation({
    mutationFn: (d: any) => apiJson("/crm/quotes", { method: "POST", body: JSON.stringify(d) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quotes"] }); setDialog(null);
      setClientId(""); setNotes(""); setItems([{ description: "", quantity: "1", unitPrice: "", lotId: "" }]); setErr("");
    },
    onError: (e: any) => setErr(e.message),
  });

  const changeStatus = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) =>
      apiJson(`/crm/quotes/${id}/${action}`, { method: "PATCH" }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["quotes"] });
      setSelectedQuote(q => q ? { ...q, status: data.status } : q);
    },
    onError: (e: any) => alert(e.message),
  });

  const addItem = () => setItems(p => [...p, { description: "", quantity: "1", unitPrice: "", lotId: "" }]);
  const removeItem = (i: number) => setItems(p => p.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: keyof FormItem, value: string) =>
    setItems(p => p.map((it, idx) => idx === i ? { ...it, [field]: value } : it));

  const totalHT = items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0), 0);

  const handleCreate = () => {
    if (!clientId) { setErr("Sélectionnez un client"); return; }
    const validItems = items.filter(i => i.description && Number(i.unitPrice) > 0);
    if (!validItems.length) { setErr("Au moins un article valide requis"); return; }
    create.mutate({
      clientId, currency, notes: notes || null,
      items: validItems.map(i => ({
        description: i.description, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice),
        lotId: i.lotId || null,
      })),
    });
  };

  // Stats
  const stats = {
    draft: quotes.filter(q => q.status === "draft").length,
    sent: quotes.filter(q => q.status === "sent").length,
    accepted: quotes.filter(q => q.status === "accepted").length,
    totalValue: quotes.filter(q => q.status === "accepted").reduce((s, q) => s + q.totalTTC, 0),
  };

  return (
    <div className="p-8 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-serif text-primary flex items-center gap-3">
            <FileText className="w-7 h-7" /> Devis
          </h2>
          <p className="text-muted-foreground mt-1">Créez et suivez vos devis clients — numérotation DEV-{new Date().getFullYear()}-XXXX</p>
        </div>
        <Button onClick={() => { setErr(""); setDialog("create"); }} className="gap-2">
          <Plus className="w-4 h-4" />Nouveau devis
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Brouillons",    value: stats.draft,    color: "text-slate-600"  },
          { label: "Envoyés",       value: stats.sent,     color: "text-blue-600"   },
          { label: "Acceptés",      value: stats.accepted, color: "text-green-600"  },
          { label: "CA accepté",    value: fmtMoney(stats.totalValue, "USD"), color: "text-primary" },
        ].map(k => (
          <Card key={k.label} className="shadow-sm">
            <CardContent className="pt-4">
              <div className={`text-2xl font-bold font-serif ${k.color}`}>{k.value}</div>
              <div className="text-xs text-muted-foreground">{k.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quotes List */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Tous les devis</CardTitle></CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 flex items-center gap-3 text-muted-foreground">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />Chargement…
            </div>
          ) : quotes.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">Aucun devis — créez le premier avec le bouton ci-dessus</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30">
                <tr className="text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Numéro</th>
                  <th className="px-4 py-3 font-medium">Client</th>
                  <th className="px-4 py-3 font-medium">Montant HT</th>
                  <th className="px-4 py-3 font-medium">Statut</th>
                  <th className="px-4 py-3 font-medium">Validité</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {quotes.map(q => {
                  const cfg = STATUS_CONFIG[q.status] ?? STATUS_CONFIG.draft;
                  const Icon = cfg.icon;
                  const client = clients.find(c => c.id === q.clientId);
                  return (
                    <tr key={q.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3 font-mono text-xs font-semibold">{q.number}</td>
                      <td className="px-4 py-3">{client?.name ?? q.clientId.slice(0, 8) + "…"}</td>
                      <td className="px-4 py-3 font-bold">{fmtMoney(q.totalHT, q.currency)}</td>
                      <td className="px-4 py-3">
                        <Badge className={`text-xs gap-1 ${cfg.color}`}>
                          <Icon className="w-3 h-3" />{cfg.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {q.validUntil ? format(new Date(q.validUntil), "d MMM yyyy", { locale: fr }) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setSelectedQuote(q); setDialog("detail"); }}>
                            Voir
                          </Button>
                          {q.status === "draft" && (
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                              onClick={() => changeStatus.mutate({ id: q.id, action: "send" })}>
                              <Send className="w-3 h-3" />Envoyer
                            </Button>
                          )}
                          {q.status === "sent" && (
                            <>
                              <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700 gap-1"
                                onClick={() => changeStatus.mutate({ id: q.id, action: "accept" })}>
                                <CheckCircle className="w-3 h-3" />Accepter
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-red-600"
                                onClick={() => changeStatus.mutate({ id: q.id, action: "reject" })}>
                                <XCircle className="w-3 h-3" />Refuser
                              </Button>
                            </>
                          )}
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

      {/* Create Dialog */}
      <Dialog open={dialog === "create"} onOpenChange={() => setDialog(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nouveau devis</DialogTitle></DialogHeader>
          {err && <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">{err}</p>}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Client *</label>
                <Select value={clientId} onValueChange={setClientId}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner…" /></SelectTrigger>
                  <SelectContent>
                    {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name} ({c.country})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Devise</label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            {/* Items */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Articles</label>
                <Button variant="ghost" size="sm" onClick={addItem} className="h-7 text-xs gap-1">
                  <Plus className="w-3 h-3" />Ajouter
                </Button>
              </div>
              <div className="space-y-2 border rounded-lg p-3">
                {items.map((item, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center">
                    <Input className="col-span-5 text-xs" placeholder="Description (ex: Vanille Bourbon 500g)" value={item.description} onChange={e => updateItem(i, "description", e.target.value)} />
                    <Input className="col-span-2 text-xs" type="number" placeholder="Qté" value={item.quantity} onChange={e => updateItem(i, "quantity", e.target.value)} />
                    <Input className="col-span-2 text-xs" type="number" placeholder="Prix unit." value={item.unitPrice} onChange={e => updateItem(i, "unitPrice", e.target.value)} />
                    <div className="col-span-2 text-xs font-medium text-right">
                      {fmtMoney((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), currency)}
                    </div>
                    <button onClick={() => removeItem(i)} className="col-span-1 text-muted-foreground hover:text-destructive">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                <div className="flex justify-end pt-2 border-t">
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Total HT (TVA export 0%)</div>
                    <div className="text-lg font-bold text-primary">{fmtMoney(totalHT, currency)}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Notes</label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Conditions particulières, incoterm, délai de livraison…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Annuler</Button>
            <Button onClick={handleCreate} disabled={create.isPending}>
              Créer le devis
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={dialog === "detail" && selectedQuote !== null} onOpenChange={() => setDialog(null)}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          {selectedQuote && (() => {
            const cfg = STATUS_CONFIG[selectedQuote.status] ?? STATUS_CONFIG.draft;
            const Icon = cfg.icon;
            const client = clients.find(c => c.id === selectedQuote.clientId);
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-3">
                    <span className="font-mono">{selectedQuote.number}</span>
                    <Badge className={`text-xs gap-1 ${cfg.color}`}><Icon className="w-3 h-3" />{cfg.label}</Badge>
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div><span className="text-muted-foreground">Client :</span> <strong>{client?.name ?? "—"}</strong></div>
                    <div><span className="text-muted-foreground">Devise :</span> <strong>{selectedQuote.currency}</strong></div>
                    <div><span className="text-muted-foreground">Créé le :</span> {format(new Date(selectedQuote.createdAt), "d MMM yyyy", { locale: fr })}</div>
                    <div><span className="text-muted-foreground">Valide jusqu'au :</span> {selectedQuote.validUntil ? format(new Date(selectedQuote.validUntil), "d MMM yyyy", { locale: fr }) : "—"}</div>
                  </div>
                  <table className="w-full text-sm border rounded-lg overflow-hidden">
                    <thead className="bg-muted/30 text-muted-foreground">
                      <tr>
                        <th className="text-left px-3 py-2">Description</th>
                        <th className="text-right px-3 py-2">Qté</th>
                        <th className="text-right px-3 py-2">Prix unit.</th>
                        <th className="text-right px-3 py-2">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {selectedQuote.items.map(item => (
                        <tr key={item.id}>
                          <td className="px-3 py-2">{item.description}</td>
                          <td className="px-3 py-2 text-right">{item.quantity}</td>
                          <td className="px-3 py-2 text-right">{fmtMoney(item.unitPrice, selectedQuote.currency)}</td>
                          <td className="px-3 py-2 text-right font-medium">{fmtMoney(item.total, selectedQuote.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-muted/10 font-bold">
                      <tr>
                        <td colSpan={3} className="px-3 py-2 text-right">Total HT</td>
                        <td className="px-3 py-2 text-right text-primary">{fmtMoney(selectedQuote.totalHT, selectedQuote.currency)}</td>
                      </tr>
                    </tfoot>
                  </table>
                  {selectedQuote.notes && (
                    <div className="text-sm bg-muted/30 rounded-lg p-3">
                      <div className="text-xs text-muted-foreground mb-1">Notes</div>
                      {selectedQuote.notes}
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDialog(null)}>Fermer</Button>
                  {selectedQuote.status === "draft" && (
                    <Button className="gap-1" onClick={() => changeStatus.mutate({ id: selectedQuote.id, action: "send" })}>
                      <Send className="w-4 h-4" />Envoyer
                    </Button>
                  )}
                  {selectedQuote.status === "sent" && (
                    <Button className="bg-green-600 hover:bg-green-700 gap-1" onClick={() => changeStatus.mutate({ id: selectedQuote.id, action: "accept" })}>
                      <CheckCircle className="w-4 h-4" />Accepter
                    </Button>
                  )}
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
