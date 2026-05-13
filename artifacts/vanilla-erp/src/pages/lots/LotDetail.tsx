import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  ArrowLeft, Package, Truck, AlertTriangle, Shield, Droplets,
  CheckCircle2, Clock, ArrowRight, Trash2, Loader2, Plus,
  BarChart2, History, TrendingDown, Users, ShoppingCart, X,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { StatusBadge, RiskBadge, STATUS_META } from "@/pages/lots";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt     = (n: number) => new Intl.NumberFormat("fr-MG", { maximumFractionDigits: 0 }).format(n ?? 0);
const fmtKg   = (n: number) => `${Number(n).toFixed(1)} kg`;
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString("fr-FR") : "—";
const fmtDt   = (d: string) => d ? new Date(d).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—";

const PAYMENT_FR: Record<string, string> = {
  cash: "Espèces", mobile_money: "Mobile Money", bank_transfer: "Virement bancaire",
};

// ─── Timeline ─────────────────────────────────────────────────────────────────
const TIMELINE_STAGES = [
  { key: "raw",      label: "Réception",    icon: Package },
  { key: "curing",   label: "Étuvage",      icon: Clock },
  { key: "PHENOLED", label: "Phénolage",    icon: Droplets },
  { key: "drying",   label: "Séchage",      icon: BarChart2 },
  { key: "ready",    label: "Prêt export",  icon: CheckCircle2 },
  { key: "SHIPPED",  label: "Exporté",      icon: Truck },
];

const STATUS_ORDER = ["raw", "curing", "PHENOLED", "drying", "ready", "SHIPPED", "sold"];

function Timeline({ status, history }: { status: string; history: any[] }) {
  const currentIdx = STATUS_ORDER.indexOf(status);

  return (
    <div className="relative">
      {/* Line */}
      <div className="absolute left-5 top-5 bottom-5 w-0.5 bg-gray-200"/>

      <div className="space-y-3">
        {TIMELINE_STAGES.map((stage, i) => {
          const stageIdx = STATUS_ORDER.indexOf(stage.key);
          const isDone    = stageIdx < currentIdx || (stageIdx === currentIdx);
          const isCurrent = stage.key === status;
          const stageHist = history.filter(h => h.status === stage.key);

          return (
            <div key={stage.key} className="relative flex items-start gap-4 pl-2">
              {/* Icon */}
              <div className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center shrink-0 border-2 transition-all ${
                isCurrent ? "border-emerald-500 bg-emerald-500 text-white shadow-lg shadow-emerald-200" :
                isDone    ? "border-emerald-400 bg-emerald-100 text-emerald-600" :
                            "border-gray-200 bg-white text-gray-300"
              }`}>
                <stage.icon className="w-3.5 h-3.5"/>
              </div>

              {/* Content */}
              <div className="flex-1 pb-3">
                <div className="flex items-center gap-2">
                  <p className={`text-sm font-semibold ${isCurrent ? "text-emerald-700" : isDone ? "text-gray-700" : "text-gray-300"}`}>
                    {stage.label}
                  </p>
                  {isCurrent && (
                    <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-bold rounded">EN COURS</span>
                  )}
                  {isDone && !isCurrent && (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400"/>
                  )}
                </div>
                {stageHist.map((h: any) => (
                  <div key={h.id} className="mt-1 text-xs text-gray-400">
                    {fmtDt(h.created_at)} · {fmtKg(h.weight)} · {Number(h.humidity).toFixed(1)}%{h.note && ` · ${h.note}`}
                  </div>
                ))}
              </div>

              {i < TIMELINE_STAGES.length - 1 && isDone && (
                <ArrowRight className="w-3 h-3 text-emerald-300 absolute right-0 top-2.5"/>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Movement type badge ───────────────────────────────────────────────────────
function MovBadge({ type }: { type: string }) {
  if (type === "IN")   return <span className="px-2 py-0.5 rounded text-xs font-bold bg-green-100 text-green-700">ENTRÉE</span>;
  if (type === "LOSS") return <span className="px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-700">PERTE</span>;
  if (type === "OUT")  return <span className="px-2 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-700">SORTIE</span>;
  return <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600">{type}</span>;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function LotDetail({ id }: { id: string }) {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { user } = useAuth();
  const canDelete = user?.role === "SUPER_ADMIN" || user?.role === "LOGISTICS_MANAGER";

  const [tab, setTab]               = useState<"general" | "timeline" | "stock" | "history">("general");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [noteText, setNoteText]     = useState("");
  const [showNoteForm, setShowNoteForm] = useState(false);

  const { data: lot, isLoading } = useQuery({
    queryKey: ["lot-detail", id],
    queryFn: () => fetch(`/api/lots/${id}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!id,
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/lots/${id}`, { method: "DELETE", credentials: "include" });
      let data: any;
      try { data = await r.json(); } catch { throw new Error("Erreur serveur inattendue"); }
      if (!r.ok) throw new Error(data?.error ?? "Erreur lors de la suppression");
      return data;
    },
    onSuccess: () => { toast.success(`Lot ${lot?.code} supprimé`); navigate("/lots"); },
    onError: (e: any) => toast.error(e.message),
  });

  const addNoteMutation = useMutation({
    mutationFn: (note: string) => fetch(`/api/lots/${id}/history`, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    }).then(async r => { if (!r.ok) throw new Error(await r.text()); return r.json(); }),
    onSuccess: () => {
      toast.success("Note ajoutée");
      setNoteText("");
      setShowNoteForm(false);
      qc.invalidateQueries({ queryKey: ["lot-detail", id] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-emerald-500"/>
    </div>
  );

  if (!lot || lot.error) return (
    <div className="p-8 text-center text-gray-400">Lot introuvable</div>
  );

  const isProtected = ["SHIPPED", "sold"].includes(lot.status);
  const tabs = [
    { key: "general",  label: "Vue générale",    icon: Package },
    { key: "timeline", label: "Timeline",         icon: Clock },
    { key: "stock",    label: "Stock & Coûts",    icon: BarChart2 },
    { key: "history",  label: `Historique (${(lot.history ?? []).length + (lot.riskEvents ?? []).length})`, icon: History },
  ] as const;

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Delete modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-600"/>
              </div>
              <div>
                <h2 className="font-bold text-gray-900">Supprimer le lot {lot.code} ?</h2>
                <p className="text-xs text-gray-500">Action irréversible</p>
              </div>
            </div>
            {isProtected ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">
                <Shield className="w-4 h-4 inline mr-1"/>
                Statut « {STATUS_META[lot.status]?.label} » — suppression interdite.
              </div>
            ) : (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm text-amber-800">
                L'historique, les mouvements de stock, les coûts et les événements de risque seront aussi supprimés.
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteModal(false)}
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Annuler</button>
              {!isProtected && (
                <button onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60">
                  {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin"/> : <Trash2 className="w-4 h-4"/>}
                  Supprimer définitivement
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => navigate("/lots")}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
                <ArrowLeft className="w-5 h-5"/>
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold font-mono text-gray-900">{lot.code}</h1>
                  <StatusBadge status={lot.status}/>
                  <RiskBadge level={lot.riskLevel}/>
                  {lot.isBlocked && (
                    <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-bold rounded-full">BLOQUÉ</span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  {lot.supplier?.name ?? "—"} · Créé le {fmtDate(lot.createdAt)}
                </p>
              </div>
            </div>
            {canDelete && (
              <button onClick={() => setShowDeleteModal(true)}
                className="flex items-center gap-1.5 px-3 py-2 border border-red-200 text-red-600 rounded-lg text-sm hover:bg-red-50">
                <Trash2 className="w-4 h-4"/>Supprimer
              </button>
            )}
          </div>

          {/* Blocked reason */}
          {lot.isBlocked && lot.blockedReason && (
            <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-2.5 text-xs text-red-700 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5"/>
              <span><strong>Bloqué :</strong> {lot.blockedReason}</span>
            </div>
          )}

          {/* Tab bar */}
          <div className="flex gap-1 mt-4 border-b border-gray-100 -mb-px">
            {tabs.map(t => (
              <button key={t.key} onClick={() => setTab(t.key as any)}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  tab === t.key
                    ? "border-emerald-500 text-emerald-700"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}>
                <t.icon className="w-3.5 h-3.5"/>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6">

        {/* ── TAB: VUE GÉNÉRALE ─────────────────────────────────────────────── */}
        {tab === "general" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Left: lot stats */}
            <div className="lg:col-span-2 space-y-5">
              {/* Main lot card */}
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Informations lot</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {[
                    { label: "Poids initial",  value: fmtKg(lot.weightInitial) },
                    { label: "Poids actuel",   value: fmtKg(lot.weightCurrent), bold: true },
                    { label: "Pertes",         value: lot.loss > 0 ? `-${fmtKg(lot.loss)} (${lot.lossPct}%)` : "—", red: lot.lossPct > 20 },
                    { label: "Humidité",       value: `${Number(lot.humidity).toFixed(1)}%`, amber: Number(lot.humidity) > 40 },
                    { label: "Grade",          value: lot.grade ?? "Non défini" },
                    { label: "Entrepôt",       value: lot.warehouse ?? "—" },
                    { label: "Région",         value: lot.region ?? "—" },
                    { label: "Score risque",   value: `${lot.riskScore ?? 0}/100` },
                    { label: "Créé le",        value: fmtDate(lot.createdAt) },
                  ].map(({ label, value, bold, red, amber }) => (
                    <div key={label} className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs text-gray-500">{label}</p>
                      <p className={`text-sm mt-0.5 ${bold ? "font-bold text-gray-900" : red ? "font-semibold text-red-600" : amber ? "font-semibold text-amber-600" : "text-gray-700"}`}>
                        {value}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Purchase card */}
              {lot.purchase && (
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4 text-emerald-500"/>Achat d'origine
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {[
                      { label: "Montant total",   value: `${fmt(lot.purchase.totalAmount)} Ar` },
                      { label: "Prix / kg",        value: `${fmt(lot.purchase.pricePerKg)} Ar` },
                      { label: "Poids acheté",     value: fmtKg(lot.purchase.weight) },
                      { label: "Humidité achat",   value: `${lot.purchase.humidity}%` },
                      { label: "Mode paiement",    value: PAYMENT_FR[lot.purchase.paymentMethod] ?? lot.purchase.paymentMethod },
                      { label: "Date achat",       value: fmtDate(lot.purchase.createdAt) },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs text-gray-500">{label}</p>
                        <p className="text-sm font-medium text-gray-800 mt-0.5">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Export card */}
              {lot.export && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-indigo-700 mb-4 flex items-center gap-2">
                    <Truck className="w-4 h-4"/>Commande export
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {[
                      { label: "Référence",    value: lot.export.reference },
                      { label: "Client",       value: lot.export.client },
                      { label: "Destination",  value: lot.export.destination ?? "—" },
                      { label: "Quantité",     value: fmtKg(lot.export.quantityKg) },
                      { label: "Statut",       value: lot.export.status },
                      { label: "Deadline",     value: fmtDate(lot.export.deadline) },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-white/60 rounded-lg p-3">
                        <p className="text-xs text-indigo-400">{label}</p>
                        <p className="text-sm font-medium text-indigo-900 mt-0.5">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Costs */}
              {lot.costs && (
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                    <TrendingDown className="w-4 h-4 text-blue-500"/>Coût réel du lot
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {[
                      { label: "Coût achat",     value: `${fmt(lot.costs.purchaseCost)} Ar` },
                      { label: "Traitement",      value: `${fmt(lot.costs.processCost)} Ar` },
                      { label: "Transport",       value: `${fmt(lot.costs.transportCost)} Ar` },
                      { label: "Total réel",      value: `${fmt(lot.costs.totalCost)} Ar`, bold: true },
                      { label: "Coût / kg réel",  value: `${fmt(lot.costs.costPerKg)} Ar/kg`, bold: true },
                    ].map(({ label, value, bold }) => (
                      <div key={label} className={`${bold ? "bg-blue-50" : "bg-gray-50"} rounded-lg p-3`}>
                        <p className="text-xs text-gray-500">{label}</p>
                        <p className={`text-sm mt-0.5 ${bold ? "font-bold text-blue-700" : "font-medium text-gray-800"}`}>{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right: supplier */}
            <div className="space-y-5">
              {lot.supplier && (
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                    <Users className="w-4 h-4 text-purple-500"/>Fournisseur
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-gray-400">Nom</p>
                      <p className="font-semibold text-gray-900">{lot.supplier.name}</p>
                    </div>
                    {lot.supplier.code && (
                      <div>
                        <p className="text-xs text-gray-400">Code</p>
                        <p className="font-mono text-sm text-gray-700">{lot.supplier.code}</p>
                      </div>
                    )}
                    {lot.supplier.region && (
                      <div>
                        <p className="text-xs text-gray-400">Région collecte</p>
                        <p className="text-sm text-gray-700">{lot.supplier.region}</p>
                      </div>
                    )}
                    {lot.supplier.city && (
                      <div>
                        <p className="text-xs text-gray-400">Ville</p>
                        <p className="text-sm text-gray-700">{lot.supplier.city}</p>
                      </div>
                    )}
                    {lot.supplier.mobile && (
                      <div>
                        <p className="text-xs text-gray-400">Téléphone</p>
                        <p className="text-sm text-gray-700">{lot.supplier.mobile}</p>
                      </div>
                    )}
                    {lot.supplier.email && (
                      <div>
                        <p className="text-xs text-gray-400">Email</p>
                        <p className="text-sm text-blue-600 truncate">{lot.supplier.email}</p>
                      </div>
                    )}
                    <button onClick={() => navigate(`/suppliers/${lot.supplier.id}`)}
                      className="w-full mt-2 px-4 py-2 border border-purple-200 text-purple-700 text-sm rounded-lg hover:bg-purple-50 font-medium">
                      Voir la fiche fournisseur →
                    </button>
                  </div>
                </div>
              )}

              {/* Quick stats */}
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Résumé</h3>
                <div className="space-y-2">
                  {[
                    { label: "Mouvements stock", value: (lot.movements ?? []).length },
                    { label: "Entrées historique", value: (lot.history ?? []).length },
                    { label: "Événements risque", value: (lot.riskEvents ?? []).length },
                    { label: "Mesures qualité",   value: (lot.metrics ?? []).length },
                    { label: "Prédictions IA",    value: (lot.predictions ?? []).length },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">{label}</span>
                      <span className="font-semibold text-gray-800">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB: TIMELINE ─────────────────────────────────────────────────── */}
        {tab === "timeline" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-6">Parcours de production</h3>
              <Timeline status={lot.status} history={lot.history ?? []}/>
            </div>

            {/* Quality metrics */}
            {(lot.metrics ?? []).length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Mesures qualité récentes</h3>
                <div className="space-y-2">
                  {lot.metrics.map((m: any) => (
                    <div key={m.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-xs">
                      <span className="text-gray-500">{fmtDt(m.date)}</span>
                      <span className="font-mono text-gray-700">{fmtKg(m.weight)}</span>
                      <span className={`font-semibold ${Number(m.humidity) > 45 ? "text-red-600" : "text-emerald-600"}`}>
                        <Droplets className="w-3 h-3 inline mr-0.5"/>{Number(m.humidity).toFixed(1)}%
                      </span>
                      {m.temp && <span className="text-gray-400">{Number(m.temp).toFixed(1)}°C</span>}
                      {m.storage && <span className="text-gray-400">{m.storage}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Predictions */}
            {(lot.predictions ?? []).length > 0 && (
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-blue-700 mb-4">Prévisions IA</h3>
                <div className="space-y-2">
                  {lot.predictions.map((p: any) => (
                    <div key={p.id} className="bg-white/70 rounded-lg px-3 py-2 text-xs">
                      <div className="flex justify-between">
                        <span className="font-medium text-blue-800">{p.type}</span>
                        <span className="text-blue-600 font-bold">{Number(p.value).toFixed(1)}</span>
                      </div>
                      <div className="flex justify-between text-blue-400 mt-0.5">
                        <span>{fmtDate(p.date)}</span>
                        <span>Confiance : {Math.round(Number(p.confidence) * 100)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TAB: STOCK & COÛTS ────────────────────────────────────────────── */}
        {tab === "stock" && (
          <div className="space-y-5">
            {/* Stock movements */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-700">Mouvements de stock</h3>
              </div>
              {(lot.movements ?? []).length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-gray-300">Aucun mouvement enregistré</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      {["Type","Quantité","Note","Date"].map(h => (
                        <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {lot.movements.map((m: any) => (
                      <tr key={m.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3"><MovBadge type={m.type}/></td>
                        <td className="px-4 py-3 font-mono font-semibold text-sm">{fmtKg(m.quantity)}</td>
                        <td className="px-4 py-3 text-xs text-gray-500 max-w-xs truncate">{m.note ?? "—"}</td>
                        <td className="px-4 py-3 text-xs text-gray-400">{fmtDt(m.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                    <tr>
                      <td className="px-4 py-2.5 text-xs font-bold text-gray-600 uppercase">Net</td>
                      <td className="px-4 py-2.5 font-mono font-bold text-sm">
                        {fmtKg(
                          lot.movements.reduce((s: number, m: any) =>
                            m.type === "IN" ? s + Number(m.quantity) :
                            m.type === "LOSS" || m.type === "OUT" ? s - Number(m.quantity) : s
                          , 0)
                        )}
                      </td>
                      <td colSpan={2}/>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>

            {/* Cost breakdown */}
            {lot.costs ? (
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Décomposition des coûts réels</h3>
                <div className="space-y-2">
                  {[
                    { label: "Coût achat matière",   value: lot.costs.purchaseCost,   pct: lot.costs.totalCost > 0 ? (lot.costs.purchaseCost / lot.costs.totalCost) * 100 : 0, color: "bg-emerald-400" },
                    { label: "Traitement & process",  value: lot.costs.processCost,    pct: lot.costs.totalCost > 0 ? (lot.costs.processCost / lot.costs.totalCost) * 100 : 0,  color: "bg-blue-400" },
                    { label: "Transport & logistique",value: lot.costs.transportCost,  pct: lot.costs.totalCost > 0 ? (lot.costs.transportCost / lot.costs.totalCost) * 100 : 0,color: "bg-purple-400" },
                  ].map(({ label, value, pct, color }) => (
                    <div key={label}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-600">{label}</span>
                        <span className="font-semibold">{fmt(value)} Ar ({pct.toFixed(0)}%)</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }}/>
                      </div>
                    </div>
                  ))}
                  <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between text-sm font-bold">
                    <span className="text-gray-700">Total réel</span>
                    <span className="text-blue-700">{fmt(lot.costs.totalCost)} Ar — {fmt(lot.costs.costPerKg)} Ar/kg</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center text-sm text-gray-400">
                Aucune donnée de coût disponible pour ce lot.
              </div>
            )}
          </div>
        )}

        {/* ── TAB: HISTORIQUE ───────────────────────────────────────────────── */}
        {tab === "history" && (
          <div className="space-y-5">
            {/* Add note */}
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700">Ajouter une note</h3>
                {!showNoteForm && (
                  <button onClick={() => setShowNoteForm(true)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs hover:bg-emerald-700">
                    <Plus className="w-3 h-3"/>Nouvelle note
                  </button>
                )}
              </div>
              {showNoteForm && (
                <div className="space-y-3">
                  <textarea value={noteText} onChange={e => setNoteText(e.target.value)}
                    rows={3} placeholder="Observation sur le lot (qualité, traitement, incident…)"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none resize-none"/>
                  <div className="flex gap-2">
                    <button onClick={() => { setShowNoteForm(false); setNoteText(""); }}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                      Annuler
                    </button>
                    <button onClick={() => addNoteMutation.mutate(noteText)} disabled={!noteText.trim() || addNoteMutation.isPending}
                      className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 disabled:opacity-60">
                      {addNoteMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Plus className="w-3.5 h-3.5"/>}
                      Enregistrer
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* History timeline */}
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Journal du lot ({(lot.history ?? []).length} entrée(s))</h3>
              {(lot.history ?? []).length === 0 ? (
                <p className="text-sm text-gray-300 text-center py-8">Aucun historique enregistré</p>
              ) : (
                <div className="space-y-2">
                  {[...lot.history].reverse().map((h: any) => (
                    <div key={h.id} className="flex items-start gap-3 bg-gray-50 rounded-lg px-4 py-3">
                      <div className="w-2 h-2 rounded-full bg-emerald-400 mt-1.5 shrink-0"/>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <StatusBadge status={h.status}/>
                          <span className="text-xs text-gray-500">{fmtDt(h.created_at)}</span>
                          <span className="text-xs text-gray-400">· {fmtKg(h.weight)} · {Number(h.humidity).toFixed(1)}%</span>
                        </div>
                        {h.note && <p className="text-xs text-gray-600 mt-1">{h.note}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Risk events */}
            {(lot.riskEvents ?? []).length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-red-700 mb-4 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4"/>Événements de risque ({lot.riskEvents.length})
                </h3>
                <div className="space-y-2">
                  {lot.riskEvents.map((e: any) => (
                    <div key={e.id} className="bg-white border border-red-100 rounded-lg px-4 py-3">
                      <div className="flex items-center justify-between">
                        <RiskBadge level={e.risk_level}/>
                        <span className="text-xs text-gray-400">{fmtDt(e.created_at)}</span>
                      </div>
                      <p className="text-xs text-gray-700 mt-1">{e.reason}</p>
                      <p className="text-xs text-gray-400">Score : {e.score}/100</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
