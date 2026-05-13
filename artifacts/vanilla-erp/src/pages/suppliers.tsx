import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Package, Wrench, Users, TrendingUp, AlertTriangle,
  Plus, Search, Download, Eye, Edit2, Trash2,
  CheckCircle2,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) => new Intl.NumberFormat("fr-MG", { maximumFractionDigits: 0 }).format(n ?? 0);

function ScoreBadge({ score }: { score: number }) {
  const cls = score >= 80 ? "bg-green-100 text-green-700 border-green-200"
    : score >= 60 ? "bg-amber-100 text-amber-700 border-amber-200"
    : "bg-red-100 text-red-600 border-red-200";
  const dot = score >= 80 ? "bg-green-500" : score >= 60 ? "bg-amber-500" : "bg-red-500";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`}/>
      {score}/100
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    active:   { label: "Actif",   cls: "bg-emerald-100 text-emerald-700" },
    inactive: { label: "Inactif", cls: "bg-gray-100 text-gray-500" },
    blocked:  { label: "Bloqué",  cls: "bg-red-100 text-red-600" },
  };
  const { label, cls } = map[status] ?? map.inactive;
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{label}</span>;
}

function downloadCSV(rows: any[], filename: string) {
  const headers = ["Code", "Nom", "Type", "Catégorie", "Région", "Ville", "Téléphone", "Email", "Score", "Achats (Ar)", "Statut"];
  const csv = ["\ufeff" + headers.join(";"),
    ...rows.map(r => [r.supplierCode, r.name, r.supplierType === "GOODS" ? "Biens" : "Services",
      r.category ?? "", r.region, r.city ?? "", r.phone ?? "", r.email ?? "",
      r.qualityScore, r.totalPurchases, r.status].join(";"))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: filename }).click();
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function SuppliersPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const canDelete = user?.role === "SUPER_ADMIN" || user?.role === "LOGISTICS_MANAGER";

  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterRegion, setFilterRegion] = useState("all");
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/suppliers/${id}`, { method: "DELETE", credentials: "include" }).then(r => {
        if (!r.ok) throw new Error("Erreur lors de la suppression");
        return r.json();
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["suppliers-list"] });
      setConfirmDelete(null);
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["suppliers-list"],
    queryFn: () => fetch("/api/suppliers", { credentials: "include" }).then(r => r.json()),
  });

  const suppliers: any[] = data?.suppliers ?? [];
  const kpis = data?.kpis ?? {};

  const regions = useMemo(() => [...new Set(suppliers.map(s => s.region).filter(Boolean))].sort(), [suppliers]);

  const filtered = useMemo(() => suppliers.filter(s => {
    const q = search.toLowerCase();
    const matchSearch = !q || s.name.toLowerCase().includes(q) || (s.supplierCode ?? "").toLowerCase().includes(q)
      || (s.category ?? "").toLowerCase().includes(q) || (s.region ?? "").toLowerCase().includes(q);
    const matchType = filterType === "all" || s.supplierType === filterType;
    const matchStatus = filterStatus === "all" || s.status === filterStatus;
    const matchRegion = filterRegion === "all" || s.region === filterRegion;
    return matchSearch && matchType && matchStatus && matchRegion;
  }), [suppliers, search, filterType, filterStatus, filterRegion]);

  const alerts = suppliers.filter(s => s.score < 60 || s.status === "blocked" || s.status === "inactive");

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-600"/>
              </div>
              <h2 className="text-base font-bold text-gray-900">Supprimer le fournisseur</h2>
            </div>
            <p className="text-sm text-gray-600 mb-1">Vous êtes sur le point de supprimer définitivement :</p>
            <p className="text-sm font-semibold text-gray-900 mb-4">« {confirmDelete.name} »</p>
            <p className="text-xs text-red-500 mb-5">Cette action est irréversible. Toutes les données associées seront perdues.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
                Annuler
              </button>
              <button onClick={() => deleteMutation.mutate(confirmDelete.id)}
                disabled={deleteMutation.isPending}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60">
                {deleteMutation.isPending ? "Suppression…" : "Supprimer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Fournisseurs</h1>
              <p className="text-xs text-gray-400 mt-0.5">Gestion des fournisseurs de biens et services</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => downloadCSV(filtered, "fournisseurs.csv")}
                className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                <Download className="w-3.5 h-3.5"/>Export CSV
              </button>
              <button onClick={() => navigate("/suppliers/new")}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700">
                <Plus className="w-4 h-4"/>Nouveau fournisseur
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-5">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "Total", value: kpis.total ?? 0, icon: Users, cls: "text-gray-800", bg: "bg-white" },
            { label: "Actifs", value: kpis.actifs ?? 0, icon: CheckCircle2, cls: "text-emerald-700", bg: "bg-emerald-50" },
            { label: "Fournisseurs biens", value: kpis.biens ?? 0, icon: Package, cls: "text-blue-700", bg: "bg-blue-50" },
            { label: "Fournisseurs services", value: kpis.services ?? 0, icon: Wrench, cls: "text-purple-700", bg: "bg-purple-50" },
            { label: "Montant achats", value: fmt(kpis.montantAchats ?? 0) + " Ar", icon: TrendingUp, cls: "text-gray-800", bg: "bg-white", small: true },
            { label: "Alertes", value: alerts.length, icon: AlertTriangle, cls: "text-red-600", bg: "bg-red-50" },
          ].map(({ label, value, icon: Icon, cls, bg, small }) => (
            <div key={label} className={`${bg} border border-gray-200 rounded-xl p-4 shadow-sm`}>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-gray-500">{label}</p>
                <Icon className={`w-4 h-4 ${cls} opacity-70`}/>
              </div>
              <p className={`${small ? "text-base" : "text-xl"} font-bold ${cls}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Alerts banner */}
        {alerts.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0"/>
            <p className="text-sm text-amber-700">
              <strong>{alerts.length} fournisseur(s)</strong> nécessite(nt) attention : score faible, inactif ou bloqué.
            </p>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"/>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher fournisseur, code, catégorie…"
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"/>
            </div>
            <select value={filterType} onChange={e => setFilterType(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
              <option value="all">Tous les types</option>
              <option value="GOODS">Biens</option>
              <option value="SERVICES">Services</option>
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
              <option value="all">Tous les statuts</option>
              <option value="active">Actif</option>
              <option value="inactive">Inactif</option>
              <option value="blocked">Bloqué</option>
            </select>
            <select value={filterRegion} onChange={e => setFilterRegion(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
              <option value="all">Toutes les régions</option>
              {regions.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <span className="text-xs text-gray-400 ml-auto">{filtered.length} résultat(s)</span>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {["Code", "Fournisseur", "Type", "Région / Ville", "Contact", "Score qualité", "Achats (Ar)", "Statut", ""].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr><td colSpan={9} className="text-center py-12 text-gray-300">Chargement…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-12 text-gray-300">
                  <Users className="w-10 h-10 mx-auto mb-2 opacity-30"/>
                  Aucun fournisseur trouvé
                </td></tr>
              ) : filtered.map((s: any) => (
                <tr key={s.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/suppliers/${s.id}`)}>
                  <td className="px-4 py-3 font-mono text-xs font-bold text-gray-500">{s.supplierCode ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-gray-900">{s.name}</div>
                    {s.category && <div className="text-xs text-gray-400">{s.category}</div>}
                  </td>
                  <td className="px-4 py-3">
                    {s.supplierType === "GOODS"
                      ? <span className="flex items-center gap-1 text-xs text-blue-700"><Package className="w-3 h-3"/>Biens</span>
                      : <span className="flex items-center gap-1 text-xs text-purple-700"><Wrench className="w-3 h-3"/>Services</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">
                    <div>{s.region}</div>
                    {s.city && s.city !== s.region && <div className="text-gray-400">{s.city}</div>}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">
                    <div>{s.phone ?? "—"}</div>
                    {s.email && <div className="text-gray-400 truncate max-w-32">{s.email}</div>}
                  </td>
                  <td className="px-4 py-3"><ScoreBadge score={s.qualityScore ?? s.score}/></td>
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-800">{fmt(s.totalPurchases)}</td>
                  <td className="px-4 py-3"><StatusBadge status={s.status}/></td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <div className="flex gap-1">
                      <button onClick={() => navigate(`/suppliers/${s.id}`)}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700" title="Voir la fiche">
                        <Eye className="w-3.5 h-3.5"/>
                      </button>
                      <button onClick={() => navigate(`/suppliers/${s.id}/edit`)}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700" title="Modifier">
                        <Edit2 className="w-3.5 h-3.5"/>
                      </button>
                      {canDelete && (
                        <button onClick={() => setConfirmDelete({ id: s.id, name: s.name })}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors" title="Supprimer">
                          <Trash2 className="w-3.5 h-3.5"/>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
