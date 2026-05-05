import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Activity, AlertTriangle, CheckCircle2, Package, Skull, Beaker,
  ClipboardList, ChevronRight, TrendingDown, Box, Clock,
} from "lucide-react";

interface DashboardData {
  lotStats: Record<string, number>;
  consumableToday: { name: string; unit: string; used: number }[];
  lowStockAlerts: { id: string; name: string; stock: number; minStock: number; unit: string }[];
  moldyAlert: boolean;
  todayReport: { id: string; date: string; quantityReceivedKg: number; quantityPreparedKg: number } | null;
  recentReports: { id: string; date: string; quantityReceivedKg: number; quantityPreparedKg: number }[];
}

const api = async (path: string) => {
  const r = await fetch(`/api${path}`, { credentials: "include" });
  if (!r.ok) throw new Error("Erreur serveur");
  return r.json();
};

const LOT_STAT_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string; bg: string; border: string }> = {
  processing: { label: "En traitement",  icon: Activity,    color: "text-blue-700",   bg: "bg-blue-50",   border: "border-blue-200"  },
  phenole:    { label: "Phénolé",        icon: Beaker,      color: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200"},
  moldy:      { label: "Moisi",          icon: Skull,       color: "text-red-700",    bg: "bg-red-50",    border: "border-red-200"   },
  ready:      { label: "Prêt",           icon: CheckCircle2,color: "text-green-700",  bg: "bg-green-50",  border: "border-green-200" },
  preparing:  { label: "Préparation",    icon: Package,     color: "text-purple-700", bg: "bg-purple-50", border: "border-purple-200"},
};

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short" });
}

export default function OperationDashboard() {
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["operations-dashboard"],
    queryFn: () => api("/operations/dashboard"),
    refetchInterval: 60_000,
  });

  if (isLoading) return (
    <div className="p-8 text-center text-gray-400">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
      Chargement dashboard…
    </div>
  );

  const stats = data?.lotStats ?? {};
  const totalKg = Object.values(stats).reduce((a, b) => a + b, 0);

  return (
    <div className="p-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard Opérations</h1>
          <p className="text-sm text-gray-500 mt-0.5">Production vanille du jour · {totalKg.toFixed(1)} kg traités</p>
        </div>
        <Link href="/operations/report"
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 shadow-sm">
          <ClipboardList className="w-4 h-4" />Rapport du jour
        </Link>
      </div>

      {/* Alerts */}
      {(data?.moldyAlert || (data?.lowStockAlerts.length ?? 0) > 0) && (
        <div className="mb-5 space-y-2">
          {data?.moldyAlert && (
            <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <p className="text-sm font-semibold">Alerte qualité — Trop de vanille moisie ({(stats.moldy ?? 0).toFixed(1)} kg) !</p>
            </div>
          )}
          {data?.lowStockAlerts.map(c => (
            <div key={c.id} className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-amber-700">
              <TrendingDown className="w-5 h-5 shrink-0" />
              <p className="text-sm font-semibold">
                Stock faible — <strong>{c.name}</strong> : {c.stock} {c.unit} (seuil : {c.minStock})
              </p>
              <Link href="/operations/consumables"
                className="ml-auto text-xs underline shrink-0">Réapprovisionner</Link>
            </div>
          ))}
        </div>
      )}

      {/* KPI Lot Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        {Object.entries(LOT_STAT_CONFIG).map(([key, cfg]) => {
          const Icon = cfg.icon;
          const kg = stats[key] ?? 0;
          const pct = totalKg > 0 ? (kg / totalKg * 100).toFixed(0) : "0";
          return (
            <div key={key} className={`bg-white rounded-2xl border ${cfg.border} shadow-sm p-4`}>
              <div className={`w-9 h-9 rounded-xl ${cfg.bg} flex items-center justify-center mb-2`}>
                <Icon className={`w-4 h-4 ${cfg.color}`} />
              </div>
              <p className={`text-2xl font-bold ${cfg.color}`}>{kg.toFixed(1)}</p>
              <p className="text-xs text-gray-500 mt-0.5">{cfg.label}</p>
              <div className="mt-2 w-full bg-gray-100 rounded-full h-1.5">
                <div className={`${cfg.bg.replace("bg-", "bg-")} h-1.5 rounded-full`}
                  style={{ width: `${pct}%`, backgroundColor: `var(--tw-bg-opacity, 1)` }} />
              </div>
              <p className="text-[10px] text-gray-400 mt-1">{pct}% du total</p>
            </div>
          );
        })}
      </div>

      {/* Today's report summary */}
      {data?.todayReport && (
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
              <Box className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{(data.todayReport.quantityReceivedKg ?? 0).toFixed(1)} kg</p>
              <p className="text-xs text-gray-500">Marchandise reçue</p>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Package className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{(data.todayReport.quantityPreparedKg ?? 0).toFixed(1)} kg</p>
              <p className="text-xs text-gray-500">Préparée / conditionnée</p>
            </div>
          </div>
        </div>
      )}

      {/* Consumable usage today */}
      {(data?.consumableToday.length ?? 0) > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4 text-gray-400" />Consommables du jour
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {data?.consumableToday.map(c => (
              <div key={c.name} className="bg-gray-50 rounded-xl px-3 py-2.5">
                <p className="text-lg font-bold text-gray-900">{c.used} <span className="text-sm font-normal text-gray-500">{c.unit}</span></p>
                <p className="text-xs text-gray-500">{c.name}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent reports */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-400" />Rapports récents
          </h2>
          <Link href="/operations/report"
            className="text-xs text-primary hover:underline">Voir le rapport →</Link>
        </div>
        {(data?.recentReports.length ?? 0) === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">Aucun rapport encore</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Reçu</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Préparé</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data?.recentReports.map(r => (
                <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 font-medium text-gray-800">{fmtDate(r.date)}</td>
                  <td className="px-5 py-3 text-right text-gray-600">{(r.quantityReceivedKg ?? 0).toFixed(1)} kg</td>
                  <td className="px-5 py-3 text-right text-gray-600">{(r.quantityPreparedKg ?? 0).toFixed(1)} kg</td>
                  <td className="px-5 py-3 text-right">
                    <Link href="/operations/report"
                      className="text-gray-400 hover:text-primary"><ChevronRight className="w-4 h-4" /></Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
