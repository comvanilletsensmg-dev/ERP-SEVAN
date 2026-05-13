import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Package, AlertTriangle, TrendingDown, CheckCircle2,
  Search, Eye, Trash2, Loader2, Shield, Droplets, Weight,
  ShoppingBag,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtKg   = (n: number | string) => `${Number(n).toFixed(1)} kg`;
const fmtDate = (d: string) => new Date(d).toLocaleDateString("fr-FR");

export const STATUS_META: Record<string, { label: string; dot: string; bg: string; text: string }> = {
  raw:      { label: "Brut",        dot: "bg-gray-400",    bg: "bg-gray-100",    text: "text-gray-700" },
  curing:   { label: "Étuvage",     dot: "bg-amber-500",   bg: "bg-amber-100",   text: "text-amber-800" },
  drying:   { label: "Séchage",     dot: "bg-orange-500",  bg: "bg-orange-100",  text: "text-orange-800" },
  PHENOLED: { label: "Phénolé",     dot: "bg-purple-500",  bg: "bg-purple-100",  text: "text-purple-800" },
  ready:    { label: "Prêt export", dot: "bg-emerald-500", bg: "bg-emerald-100", text: "text-emerald-800" },
  sold:     { label: "Vendu",       dot: "bg-blue-500",    bg: "bg-blue-100",    text: "text-blue-800" },
  SHIPPED:  { label: "Exporté",     dot: "bg-indigo-500",  bg: "bg-indigo-100",  text: "text-indigo-800" },
};

export const RISK_META: Record<string, { label: string; bg: string; text: string }> = {
  LOW:    { label: "Faible", bg: "bg-green-100",  text: "text-green-700" },
  MEDIUM: { label: "Moyen",  bg: "bg-amber-100",  text: "text-amber-700" },
  HIGH:   { label: "Élevé",  bg: "bg-red-100",    text: "text-red-700" },
};

export function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? { label: status, dot: "bg-gray-400", bg: "bg-gray-100", text: "text-gray-700" };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${m.bg} ${m.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`}/>
      {m.label}
    </span>
  );
}

export function RiskBadge({ level }: { level: string }) {
  const m = RISK_META[level] ?? { label: level, bg: "bg-gray-100", text: "text-gray-700" };
  return <span className={`px-2 py-0.5 rounded text-xs font-semibold ${m.bg} ${m.text}`}>{m.label}</span>;
}

function KpiCard({ label, value, sub, icon: Icon, color = "text-gray-900", bg = "bg-white" }: any) {
  return (
    <div className={`${bg} border border-gray-200 rounded-xl p-4 shadow-sm`}>
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-gray-500">{label}</p>
        <Icon className={`w-4 h-4 opacity-60 ${color}`}/>
      </div>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Lots() {
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const canDelete = user?.role === "SUPER_ADMIN" || user?.role === "LOGISTICS_MANAGER";

  const [search, setSearch]           = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterRisk, setFilterRisk]   = useState("all");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; code: string; status: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["lots-list"],
    queryFn: () => fetch("/api/lots", { credentials: "include" }).then(r => r.json()),
  });

  const lots: any[]  = data?.lots ?? [];
  const kpis: any    = data?.kpis ?? {};

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/lots/${id}`, { method: "DELETE", credentials: "include" });
      let data: any;
      try { data = await r.json(); } catch { throw new Error("Erreur serveur inattendue"); }
      if (!r.ok) throw new Error(data?.error ?? "Erreur lors de la suppression");
      return data;
    },
    onSuccess: (d: any) => { toast.success(`Lot ${d.lotCode} supprimé`); qc.invalidateQueries({ queryKey: ["lots-list"] }); setDeleteTarget(null); },
    onError:   (e: any) => toast.error(e.message),
  });

  const filtered = useMemo(() => lots.filter((l: any) => {
    const q = search.toLowerCase();
    const matchQ = !q || l.code?.toLowerCase().includes(q) || (l.supplier_name ?? "").toLowerCase().includes(q);
    const matchS = filterStatus === "all" || l.status === filterStatus;
    const matchR = filterRisk   === "all" || l.risk_level === filterRisk;
    return matchQ && matchS && matchR;
  }), [lots, search, filterStatus, filterRisk]);

  const isProtected = (s: string) => ["SHIPPED", "sold"].includes(s);

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Delete modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-600"/>
              </div>
              <div>
                <h2 className="font-bold text-gray-900">Supprimer le lot {deleteTarget.code} ?</h2>
                <p className="text-xs text-gray-500 mt-0.5">Action irréversible</p>
              </div>
            </div>
            {isProtected(deleteTarget.status) ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">
                <Shield className="w-4 h-4 inline mr-1"/>
                <strong>Interdit :</strong> statut « {STATUS_META[deleteTarget.status]?.label} » — suppression bloquée.
              </div>
            ) : (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm text-amber-800">
                Les mouvements de stock, l'historique, les coûts et événements de risque liés seront également supprimés.
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)}
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
                Annuler
              </button>
              {!isProtected(deleteTarget.status) && (
                <button onClick={() => deleteMutation.mutate(deleteTarget.id)} disabled={deleteMutation.isPending}
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
        <div className="max-w-7xl mx-auto px-6 py-5">
          <h1 className="text-xl font-bold text-gray-900">Lots vanille</h1>
          <p className="text-xs text-gray-400 mt-0.5">Traçabilité complète · stock · qualité · export</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-5">

        {/* KPI cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          <KpiCard label="Total lots"    value={kpis.total    ?? 0}                                    icon={Package}       bg="bg-emerald-50" color="text-emerald-700"/>
          <KpiCard label="Kg en stock"   value={Number(kpis.kgStock  ?? 0).toFixed(0) + " kg"}         icon={Weight}        bg="bg-blue-50"    color="text-blue-700"/>
          <KpiCard label="Prêts export"  value={kpis.readyCount ?? 0}                                  icon={CheckCircle2}  bg="bg-green-50"   color="text-green-700"/>
          <KpiCard label="Exportés"      value={kpis.exported  ?? 0}                                   icon={ShoppingBag}   color="text-indigo-700"/>
          <KpiCard label="Risque élevé"  value={kpis.highRisk  ?? 0}                                   icon={AlertTriangle} color={(kpis.highRisk ?? 0) > 0 ? "text-red-600" : "text-gray-400"} bg={(kpis.highRisk ?? 0) > 0 ? "bg-red-50" : "bg-white"}/>
          <KpiCard label="Risque moyen"  value={kpis.mediumRisk ?? 0}                                  icon={AlertTriangle} color="text-amber-600"/>
          <KpiCard label="Bloqués"       value={kpis.blocked   ?? 0}                                   icon={Shield}        color={(kpis.blocked ?? 0) > 0 ? "text-red-600" : "text-gray-400"}/>
          <KpiCard label="Pertes totales" value={Number(kpis.totalLoss ?? 0).toFixed(1) + " kg"}       icon={TrendingDown}  color="text-gray-600" sub="évap. + séchage"/>
        </div>

        {/* Risk / blocked alert */}
        {((kpis.highRisk ?? 0) > 0 || (kpis.blocked ?? 0) > 0) && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2 text-sm text-red-800">
            <AlertTriangle className="w-4 h-4 shrink-0"/>
            <span>
              {(kpis.highRisk ?? 0) > 0 && <strong>{kpis.highRisk} lot(s) à risque élevé</strong>}
              {(kpis.highRisk ?? 0) > 0 && (kpis.blocked ?? 0) > 0 && " · "}
              {(kpis.blocked ?? 0) > 0 && <strong>{kpis.blocked} lot(s) bloqué(s)</strong>}
              {" "} — consultez les fiches détail.
            </span>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"/>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Code lot, fournisseur…"
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500"/>
            </div>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500">
              <option value="all">Tous les statuts</option>
              {Object.entries(STATUS_META).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
            </select>
            <select value={filterRisk} onChange={e => setFilterRisk(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500">
              <option value="all">Tous les risques</option>
              <option value="HIGH">Élevé</option>
              <option value="MEDIUM">Moyen</option>
              <option value="LOW">Faible</option>
            </select>
            <span className="text-xs text-gray-400 ml-auto">{filtered.length} lot(s)</span>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {["Code lot","Fournisseur","Statut","Risque","Poids initial","Poids actuel","Pertes","Humidité","Date","Actions"].map((h, i) => (
                  <th key={i} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr><td colSpan={10} className="py-12 text-center">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-gray-300"/>
                  <p className="text-gray-300 text-sm">Chargement…</p>
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={10} className="py-12 text-center">
                  <Package className="w-10 h-10 mx-auto mb-2 opacity-20"/>
                  <p className="text-gray-300">Aucun lot trouvé</p>
                </td></tr>
              ) : filtered.map((l: any) => {
                const loss    = Number(l.weight_initial) - Number(l.weight_current);
                const lossPct = Number(l.weight_initial) > 0 ? (loss / Number(l.weight_initial)) * 100 : 0;
                return (
                  <tr key={l.id} className={`hover:bg-gray-50 transition-colors ${l.is_blocked ? "bg-red-50/40" : ""}`}>
                    <td className="px-4 py-3">
                      <button onClick={() => navigate(`/lots/${l.id}`)}
                        className="font-mono font-bold text-emerald-700 hover:underline text-xs">
                        {l.code}
                      </button>
                      {l.is_blocked && <span className="ml-1 text-red-500 text-xs" title={l.blocked_reason}>⚠</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800 text-xs">{l.supplier_name ?? "—"}</div>
                      {l.supplier_code && <div className="text-xs text-gray-400 font-mono">{l.supplier_code}</div>}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={l.status}/></td>
                    <td className="px-4 py-3"><RiskBadge level={l.risk_level}/></td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{fmtKg(l.weight_initial)}</td>
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-900">{fmtKg(l.weight_current)}</td>
                    <td className="px-4 py-3">
                      {loss > 0
                        ? <span className={`text-xs font-semibold ${lossPct > 30 ? "text-red-600" : lossPct > 15 ? "text-amber-600" : "text-gray-500"}`}>
                            -{loss.toFixed(1)} kg ({lossPct.toFixed(0)}%)
                          </span>
                        : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold ${Number(l.humidity) > 45 ? "text-red-600" : Number(l.humidity) > 35 ? "text-amber-600" : "text-emerald-600"}`}>
                        <Droplets className="w-3 h-3 inline mr-0.5"/>{Number(l.humidity).toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">{fmtDate(l.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => navigate(`/lots/${l.id}`)}
                          className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors" title="Voir la fiche">
                          <Eye className="w-3.5 h-3.5"/>
                        </button>
                        {canDelete && (
                          <button onClick={() => setDeleteTarget({ id: l.id, code: l.code, status: l.status })}
                            className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Supprimer">
                            <Trash2 className="w-3.5 h-3.5"/>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
