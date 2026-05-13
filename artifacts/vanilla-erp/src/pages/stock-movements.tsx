import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownCircle, ArrowUpCircle, MinusCircle, ArrowLeftRight,
  SlidersHorizontal, RotateCcw, Ship, Wand2, Activity, Loader2,
  Plus, Trash2, X, Search, Filter, TrendingDown, AlertTriangle,
  Package, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtQty  = (n: number) => `${Number(n ?? 0).toFixed(1)} kg`;
const fmtAr   = (n: number) => new Intl.NumberFormat("fr-MG").format(Math.round(n ?? 0)) + " Ar";
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString("fr-FR") : "—";
const fmtDt   = (d: string) => d ? new Date(d).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—";

// ─── Movement types config ────────────────────────────────────────────────────
const TYPE_META: Record<string, {
  label: string; icon: any;
  bg: string; text: string; border: string; dot: string;
}> = {
  IN:             { label: "Entrée",          icon: ArrowDownCircle,  bg: "bg-emerald-100", text: "text-emerald-800", border: "border-emerald-200", dot: "bg-emerald-500" },
  OUT:            { label: "Sortie",          icon: ArrowUpCircle,    bg: "bg-blue-100",    text: "text-blue-800",    border: "border-blue-200",    dot: "bg-blue-500" },
  LOSS:           { label: "Perte",           icon: MinusCircle,      bg: "bg-red-100",     text: "text-red-800",     border: "border-red-200",     dot: "bg-red-500" },
  TRANSFER:       { label: "Transfert",       icon: ArrowLeftRight,   bg: "bg-purple-100",  text: "text-purple-800",  border: "border-purple-200",  dot: "bg-purple-500" },
  ADJUSTMENT:     { label: "Ajustement",      icon: SlidersHorizontal,bg: "bg-orange-100",  text: "text-orange-800",  border: "border-orange-200",  dot: "bg-orange-500" },
  RETURN:         { label: "Retour",          icon: RotateCcw,        bg: "bg-cyan-100",    text: "text-cyan-800",    border: "border-cyan-200",    dot: "bg-cyan-500" },
  EXPORT:         { label: "Export",          icon: Ship,             bg: "bg-indigo-100",  text: "text-indigo-800",  border: "border-indigo-200",  dot: "bg-indigo-500" },
  TRANSFORMATION: { label: "Transformation",  icon: Wand2,            bg: "bg-amber-100",   text: "text-amber-800",   border: "border-amber-200",   dot: "bg-amber-500" },
};

function TypeBadge({ type }: { type: string }) {
  const m = TYPE_META[type] ?? { label: type, icon: Activity, bg: "bg-gray-100", text: "text-gray-700", border: "border-gray-200", dot: "bg-gray-400" };
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${m.bg} ${m.text} ${m.border}`}>
      <Icon className="w-3 h-3"/>{m.label}
    </span>
  );
}

function KpiCard({ label, value, sub, icon: Icon, color, bg }: any) {
  return (
    <div className={`${bg ?? "bg-white"} border border-gray-200 rounded-xl p-4 shadow-sm`}>
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-gray-500">{label}</p>
        <Icon className={`w-4 h-4 opacity-50 ${color ?? "text-gray-600"}`}/>
      </div>
      <p className={`text-lg font-bold ${color ?? "text-gray-900"} leading-tight`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Delete confirmation modal ────────────────────────────────────────────────
function DeleteModal({ open, movement, onConfirm, onClose, isPending }: any) {
  if (!open || !movement) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
            <Trash2 className="w-5 h-5 text-red-600"/>
          </div>
          <div>
            <h2 className="font-bold text-gray-900">Supprimer ce mouvement ?</h2>
            <p className="text-xs text-gray-400 mt-0.5">Suppression logique — conservé pour audit</p>
          </div>
        </div>
        <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-3 mb-5 space-y-1">
          <div className="flex items-center gap-2">
            <TypeBadge type={movement.type}/>
            <span className="text-sm font-semibold text-gray-800">{movement.lot_code}</span>
          </div>
          <p className="text-sm font-bold text-red-700">{fmtQty(movement.quantity)}</p>
          {movement.note && <p className="text-xs text-gray-500 truncate">{movement.note}</p>}
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Annuler</button>
          <button onClick={onConfirm} disabled={isPending}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60">
            {isPending ? <Loader2 className="w-4 h-4 animate-spin"/> : <Trash2 className="w-4 h-4"/>}
            Supprimer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Create movement modal ────────────────────────────────────────────────────
function CreateModal({ open, onClose, onSuccess }: any) {
  const [lotId, setLotId]           = useState("");
  const [type, setType]             = useState<string>("IN");
  const [quantity, setQuantity]     = useState("");
  const [unitCost, setUnitCost]     = useState("");
  const [warehouse, setWarehouse]   = useState("");
  const [reference, setReference]   = useState("");
  const [note, setNote]             = useState("");
  const [withAccounting, setWithAccounting] = useState(false);

  const { data: lotsData } = useQuery({
    queryKey: ["lots-for-stock"],
    queryFn:  () => fetch("/api/lots", { credentials: "include" }).then(r => r.json()),
    enabled:  open,
    select:   (d: any) => Array.isArray(d) ? d : (d.lots ?? []),
  });
  const lots: any[] = lotsData ?? [];

  const reset = () => { setLotId(""); setType("IN"); setQuantity(""); setUnitCost(""); setWarehouse(""); setReference(""); setNote(""); setWithAccounting(false); };

  const mut = useMutation({
    mutationFn: () => fetch("/api/stock-movements", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lotId, type, quantity: Number(quantity),
        unitCost:  unitCost   ? Number(unitCost)  : undefined,
        warehouse: warehouse  || undefined,
        reference: reference  || undefined,
        note:      note       || undefined,
        withAccounting,
      }),
    }).then(async r => { if (!r.ok) throw new Error((await r.json()).error); return r.json(); }),
    onSuccess: () => { toast.success("Mouvement enregistré"); onSuccess(); reset(); onClose(); },
    onError:   (e: any) => toast.error(e.message),
  });

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-bold text-gray-900">Nouveau mouvement de stock</h2>
            <p className="text-xs text-gray-400 mt-0.5">Traçabilité complète · Comptabilité optionnelle</p>
          </div>
          <button onClick={() => { onClose(); reset(); }} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100"><X className="w-4 h-4"/></button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Lot *</label>
              <select value={lotId} onChange={e => setLotId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500">
                <option value="">— Sélectionner —</option>
                {lots.map((l: any) => <option key={l.id} value={l.id}>{l.code} ({l.status})</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Type *</label>
              <select value={type} onChange={e => setType(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500">
                {Object.entries(TYPE_META).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Quantité (kg) *</label>
              <input type="number" value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="0.0" min="0" step="0.1"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500"/>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Coût unitaire (Ar/kg)</label>
              <input type="number" value={unitCost} onChange={e => setUnitCost(e.target.value)} placeholder="0"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500"/>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Entrepôt</label>
              <select value={warehouse} onChange={e => setWarehouse(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500">
                <option value="">— Entrepôt —</option>
                <option value="Andapa">Andapa</option>
                <option value="Sambava">Sambava</option>
                <option value="Antalaha">Antalaha</option>
                <option value="Vohémar">Vohémar</option>
                <option value="Antananarivo">Antananarivo</option>
                <option value="Port Tamatave">Port Tamatave</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Référence (BL, facture…)</label>
              <input type="text" value={reference} onChange={e => setReference(e.target.value)} placeholder="BL-2026-001"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500"/>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Note / Motif</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
              placeholder="Détail du mouvement, raison de la perte, instructions de transfert…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500 resize-none"/>
          </div>

          {unitCost && ["OUT","LOSS","EXPORT"].includes(type) && (
            <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-100 rounded-lg">
              <input type="checkbox" id="withAccounting" checked={withAccounting} onChange={e => setWithAccounting(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded"/>
              <label htmlFor="withAccounting" className="text-xs text-blue-800 cursor-pointer">
                Générer écriture comptable automatique (D607/D603 → C31 Stocks) — valeur : {fmtAr(Number(quantity) * Number(unitCost))}
              </label>
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={() => { onClose(); reset(); }} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Annuler</button>
          <button onClick={() => mut.mutate()} disabled={!lotId || !quantity || mut.isPending}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-60">
            {mut.isPending ? <Loader2 className="w-4 h-4 animate-spin"/> : <Plus className="w-4 h-4"/>}
            Enregistrer le mouvement
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const ALL_TYPES = Object.keys(TYPE_META);

const PERIODS = [
  { label: "Aujourd'hui", days: 0 },
  { label: "7 jours",     days: 7 },
  { label: "30 jours",    days: 30 },
  { label: "Tout",        days: -1 },
] as const;

export default function StockMovements() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const canDelete = user?.role === "SUPER_ADMIN" || user?.role === "ACCOUNTANT";

  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [search,     setSearch]     = useState("");
  const [period,     setPeriod]     = useState<number>(-1);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTgt,  setDeleteTgt]  = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["stock-movements-dashboard"],
    queryFn:  () => fetch("/api/stock-movements", { credentials: "include" }).then(r => r.json()),
    refetchInterval: 30_000,
  });

  const allMovements: any[] = data?.movements ?? [];
  const kpis: any           = data?.kpis      ?? {};

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const cutoff = period >= 0 ? Date.now() - period * 86_400_000 : 0;
    return allMovements.filter(m => {
      if (typeFilter !== "ALL" && m.type !== typeFilter) return false;
      if (period >= 0 && new Date(m.created_at).getTime() < cutoff) return false;
      if (q && !(
        (m.lot_code       ?? "").toLowerCase().includes(q) ||
        (m.supplier_name  ?? "").toLowerCase().includes(q) ||
        (m.client_name    ?? "").toLowerCase().includes(q) ||
        (m.note           ?? "").toLowerCase().includes(q) ||
        (m.reference      ?? "").toLowerCase().includes(q) ||
        (m.warehouse      ?? "").toLowerCase().includes(q) ||
        (m.type           ?? "").toLowerCase().includes(q)
      )) return false;
      return true;
    });
  }, [allMovements, typeFilter, search, period]);

  const deleteMut = useMutation({
    mutationFn: (id: string) => fetch(`/api/stock-movements/${id}`, { method: "DELETE", credentials: "include" })
      .then(async r => { if (!r.ok) throw new Error((await r.json()).error); return r.json(); }),
    onSuccess: () => { toast.success("Mouvement supprimé"); qc.invalidateQueries({ queryKey: ["stock-movements-dashboard"] }); setDeleteTgt(null); },
    onError:   (e: any) => toast.error(e.message),
  });

  const onSuccess = () => qc.invalidateQueries({ queryKey: ["stock-movements-dashboard"] });

  return (
    <div className="min-h-screen bg-gray-50">
      <CreateModal open={showCreate} onClose={() => setShowCreate(false)} onSuccess={onSuccess}/>
      <DeleteModal
        open={!!deleteTgt} movement={deleteTgt} isPending={deleteMut.isPending}
        onConfirm={() => deleteTgt && deleteMut.mutate(deleteTgt.id)}
        onClose={() => setDeleteTgt(null)}
      />

      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Mouvements de stock</h1>
            <p className="text-xs text-gray-400 mt-0.5">Traçabilité industrielle · CRM · Achats · Comptabilité</p>
          </div>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
            <Plus className="w-4 h-4"/>Nouveau mouvement
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-5">

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <KpiCard label="Entrées"        value={fmtQty(kpis.total_in)}         icon={ArrowDownCircle}  bg="bg-emerald-50"  color="text-emerald-700" sub="IN + Retours"/>
          <KpiCard label="Sorties"        value={fmtQty(kpis.total_out)}        icon={ArrowUpCircle}    bg="bg-blue-50"     color="text-blue-700"    sub="OUT + Export"/>
          <KpiCard label="Pertes"         value={fmtQty(kpis.total_loss)}       icon={MinusCircle}      bg={kpis.total_loss > 0 ? "bg-red-50" : "bg-white"} color={kpis.total_loss > 0 ? "text-red-700" : "text-gray-400"} sub="LOSS"/>
          <KpiCard label="Transferts"     value={fmtQty(kpis.total_transfer)}   icon={ArrowLeftRight}   bg="bg-purple-50"   color="text-purple-700"  sub="TRANSFER + Transf."/>
          <KpiCard label="Ajustements"    value={fmtQty(kpis.total_adjustment)} icon={SlidersHorizontal}bg="bg-orange-50"   color="text-orange-700"  sub="ADJUSTMENT"/>
          <KpiCard label="Total"          value={kpis.total_movements ?? 0}     icon={Activity}         color="text-gray-600"                         sub="mouvements actifs"/>
          <KpiCard label="Valeur estimée" value={fmtAr(kpis.total_value)}       icon={Package}          bg="bg-amber-50"    color="text-amber-700"   sub="coûts saisis"/>
        </div>

        {/* Filters */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            {/* Type pills */}
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setTypeFilter("ALL")}
                className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${typeFilter === "ALL" ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>
                Tous ({allMovements.length})
              </button>
              {ALL_TYPES.map(t => {
                const m = TYPE_META[t];
                const count = allMovements.filter(x => x.type === t).length;
                if (count === 0) return null;
                return (
                  <button key={t} onClick={() => setTypeFilter(t === typeFilter ? "ALL" : t)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                      typeFilter === t ? `${m.bg} ${m.text} ${m.border}` : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                    }`}>
                    {m.label} ({count})
                  </button>
                );
              })}
            </div>

            <div className="flex-1"/>

            {/* Period selector */}
            <div className="flex gap-1">
              {PERIODS.map(p => (
                <button key={p.days} onClick={() => setPeriod(p.days)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                    period === p.days ? "bg-green-600 text-white border-green-600" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                  }`}>
                  {p.label}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400"/>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Lot, fournisseur, client…"
                className="pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-green-500 w-52"/>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="py-16 text-center">
              <Loader2 className="w-7 h-7 animate-spin mx-auto mb-2 text-gray-300"/>
              <p className="text-sm text-gray-300">Chargement…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <Package className="w-10 h-10 mx-auto opacity-15 mb-2"/>
              <p className="text-gray-300 text-sm">Aucun mouvement trouvé</p>
              <button onClick={() => setShowCreate(true)} className="mt-3 text-green-600 text-xs hover:underline">+ Créer un mouvement</button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {["Date","Type","Lot","Fournisseur","Client","Qté (kg)","Coût/kg","Valeur","Entrepôt","Référence","Note"].map((h, i) => (
                      <th key={i} className={`px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap ${
                        [5,6,7].includes(i) ? "text-right" : "text-left"
                      }`}>{h}</th>
                    ))}
                    {canDelete && <th className="px-3 py-3 w-10"/>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((m: any) => {
                    const value = m.unit_cost && m.quantity ? m.unit_cost * m.quantity : null;
                    return (
                      <tr key={m.id} className="hover:bg-gray-50 group">
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{fmtDt(m.created_at)}</td>
                        <td className="px-4 py-3 whitespace-nowrap"><TypeBadge type={m.type}/></td>
                        <td className="px-4 py-3">
                          {m.lot_code ? (
                            <Link href={`/lots/${m.lot_id}`} className="font-mono text-xs font-bold text-green-700 hover:text-green-800 flex items-center gap-0.5">
                              {m.lot_code}<ChevronRight className="w-3 h-3 opacity-50"/>
                            </Link>
                          ) : <span className="text-gray-300 text-xs">—</span>}
                          {m.lot_status && <span className="block text-xs text-gray-400">{m.lot_status}</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-700 whitespace-nowrap">{m.supplier_name ?? <span className="text-gray-300">—</span>}</td>
                        <td className="px-4 py-3 text-xs">
                          {m.client_name
                            ? <span className="font-medium text-blue-700">{m.client_name}</span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-gray-800 whitespace-nowrap">{Number(m.quantity).toFixed(1)}</td>
                        <td className="px-4 py-3 text-right text-xs text-gray-500">
                          {m.unit_cost ? new Intl.NumberFormat("fr-MG").format(m.unit_cost) : <span className="text-gray-200">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-amber-700 whitespace-nowrap">
                          {value ? fmtAr(value) : <span className="text-gray-200 font-normal">—</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">{m.warehouse ?? <span className="text-gray-200">—</span>}</td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-400">{m.reference ?? <span className="text-gray-200">—</span>}</td>
                        <td className="px-4 py-3 text-xs text-gray-500 max-w-[180px]">
                          <span className="truncate block" title={m.note ?? ""}>{m.note ?? <span className="text-gray-200">—</span>}</span>
                        </td>
                        {canDelete && (
                          <td className="px-3 py-3">
                            <button onClick={() => setDeleteTgt(m)}
                              className="opacity-0 group-hover:opacity-100 p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                              title="Supprimer">
                              <Trash2 className="w-3.5 h-3.5"/>
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>

                {/* Footer totals */}
                <tfoot className="bg-gray-50 border-t-2 border-gray-100">
                  <tr>
                    <td colSpan={5} className="px-4 py-2.5 text-xs font-bold text-gray-500 uppercase tracking-wider">
                      {filtered.length} mouvement(s) affiché(s)
                    </td>
                    <td className="px-4 py-2.5 text-right font-bold text-gray-800">
                      {filtered.reduce((s: number, m: any) => s + Number(m.quantity ?? 0), 0).toFixed(1)} kg
                    </td>
                    <td/>
                    <td className="px-4 py-2.5 text-right font-bold text-amber-700">
                      {fmtAr(filtered.reduce((s: number, m: any) => s + (m.unit_cost && m.quantity ? m.unit_cost * m.quantity : 0), 0))}
                    </td>
                    <td colSpan={canDelete ? 4 : 3}/>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* Type breakdown */}
        {allMovements.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {ALL_TYPES.filter(t => allMovements.some((m: any) => m.type === t)).map(t => {
              const m     = TYPE_META[t];
              const items = allMovements.filter((x: any) => x.type === t);
              const total = items.reduce((s: number, x: any) => s + Number(x.quantity ?? 0), 0);
              const Icon  = m.icon;
              return (
                <div key={t} className={`${m.bg} border ${m.border} rounded-xl p-3 flex items-center gap-3`}>
                  <div className={`w-8 h-8 rounded-full bg-white/60 flex items-center justify-center shrink-0`}>
                    <Icon className={`w-4 h-4 ${m.text}`}/>
                  </div>
                  <div className="min-w-0">
                    <p className={`text-xs font-semibold ${m.text}`}>{m.label}</p>
                    <p className="text-sm font-bold text-gray-800">{total.toFixed(1)} kg</p>
                    <p className="text-xs text-gray-500">{items.length} mvt</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}
