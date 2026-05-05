import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Calendar, ChevronRight, Activity, Beaker, Skull, CheckCircle2,
  Package, ArrowLeft, TrendingUp, Box, BarChart3,
} from "lucide-react";

interface ReportSummary {
  id: string;
  date: string;
  quantityReceivedKg: number;
  quantityPreparedKg: number;
  notes: string | null;
  lotTotals: {
    processing: number;
    phenole: number;
    moldy: number;
    ready: number;
    preparing: number;
  };
  consumableCount: number;
}

const api = async (path: string) => {
  const r = await fetch(`/api${path}`, { credentials: "include" });
  if (!r.ok) throw new Error("Erreur serveur");
  return r.json();
};

const STATUS_CFG = [
  { key: "processing", label: "Traitement", icon: Activity,    color: "text-blue-600",   bg: "bg-blue-50"   },
  { key: "phenole",    label: "Phénolé",    icon: Beaker,      color: "text-orange-600", bg: "bg-orange-50" },
  { key: "moldy",      label: "Moisi",      icon: Skull,       color: "text-red-600",    bg: "bg-red-50"    },
  { key: "ready",      label: "Prêt",       icon: CheckCircle2,color: "text-green-600",  bg: "bg-green-50"  },
  { key: "preparing",  label: "Préparat.",  icon: Package,     color: "text-purple-600", bg: "bg-purple-50" },
] as const;

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("fr-FR", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
  });
}
function fmtDateShort(d: string) {
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function LotBadge({ icon: Icon, label, value, color, bg }: {
  icon: React.ElementType; label: string; value: number; color: string; bg: string;
}) {
  if (value <= 0) return null;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${bg} ${color}`}>
      <Icon className="w-3 h-3" />{value.toFixed(1)} kg
    </span>
  );
}

// Detail panel (inline expanded view)
function ReportDetail({ report }: { report: ReportSummary }) {
  const total = Object.values(report.lotTotals).reduce((a, b) => a + b, 0);
  return (
    <div className="border-t border-gray-100 bg-gray-50 p-4 space-y-4">
      {/* Totaux kg */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase mb-2 flex items-center gap-1.5">
          <BarChart3 className="w-3.5 h-3.5" />Répartition lots vanille
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {STATUS_CFG.map(cfg => {
            const val = report.lotTotals[cfg.key as keyof typeof report.lotTotals] ?? 0;
            const pct = total > 0 ? (val / total * 100).toFixed(0) : "0";
            if (val <= 0) return null;
            const Icon = cfg.icon;
            return (
              <div key={cfg.key} className={`rounded-xl p-3 ${cfg.bg}`}>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
                  <span className={`text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>
                </div>
                <p className={`text-lg font-bold ${cfg.color}`}>{val.toFixed(1)} kg</p>
                <p className={`text-[10px] ${cfg.color} opacity-70`}>{pct}% du total</p>
              </div>
            );
          })}
          {total === 0 && <p className="text-sm text-gray-400 col-span-3 py-2">Aucun lot enregistré</p>}
        </div>
      </div>

      {/* Marchandise */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-white rounded-xl border border-gray-100 p-3">
          <p className="text-xs text-gray-500 mb-0.5 flex items-center gap-1">
            <Box className="w-3.5 h-3.5" />Reçu
          </p>
          <p className="text-xl font-bold text-gray-900">{(report.quantityReceivedKg ?? 0).toFixed(1)} <span className="text-sm text-gray-400">kg</span></p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-3">
          <p className="text-xs text-gray-500 mb-0.5 flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5" />Préparé
          </p>
          <p className="text-xl font-bold text-gray-900">{(report.quantityPreparedKg ?? 0).toFixed(1)} <span className="text-sm text-gray-400">kg</span></p>
        </div>
      </div>

      {/* Notes */}
      {report.notes && (
        <div className="bg-white rounded-xl border border-gray-100 p-3">
          <p className="text-xs font-semibold text-gray-500 mb-1">Notes</p>
          <p className="text-sm text-gray-700 whitespace-pre-line">{report.notes}</p>
        </div>
      )}
    </div>
  );
}

export default function OperationHistory() {
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: reports = [], isLoading } = useQuery<ReportSummary[]>({
    queryKey: ["operation-reports-history"],
    queryFn: () => api("/operations/reports"),
  });

  const toggle = (id: string) => setExpanded(prev => prev === id ? null : id);

  // Group by month
  const grouped: Record<string, ReportSummary[]> = {};
  for (const r of reports) {
    const month = new Date(r.date).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
    if (!grouped[month]) grouped[month] = [];
    grouped[month].push(r);
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/operations/dashboard"
          className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-500">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Historique Opérations</h1>
          <p className="text-sm text-gray-500">{reports.length} rapport(s) enregistré(s)</p>
        </div>
        <Link href="/operations/report"
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 shadow-sm">
          <Calendar className="w-4 h-4" />Aujourd'hui
        </Link>
      </div>

      {isLoading && (
        <div className="text-center py-16 text-gray-400">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          Chargement…
        </div>
      )}

      {!isLoading && reports.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <Calendar className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Aucun rapport encore</p>
          <p className="text-sm mt-1">Les rapports journaliers apparaîtront ici</p>
          <Link href="/operations/report"
            className="inline-block mt-4 px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold">
            Créer le premier rapport
          </Link>
        </div>
      )}

      {/* Reports grouped by month */}
      <div className="space-y-6">
        {Object.entries(grouped).map(([month, monthReports]) => (
          <div key={month}>
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 px-1 capitalize">{month}</h2>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden divide-y divide-gray-50">
              {monthReports.map(r => {
                const total = Object.values(r.lotTotals).reduce((a, b) => a + b, 0);
                const isOpen = expanded === r.id;
                const hasMoldy = (r.lotTotals.moldy ?? 0) > 50;

                return (
                  <div key={r.id}>
                    {/* Row */}
                    <button
                      onClick={() => toggle(r.id)}
                      className="w-full text-left px-4 sm:px-5 py-4 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5">
                            <p className="font-semibold text-gray-900 text-sm capitalize">{fmtDate(r.date)}</p>
                            {hasMoldy && (
                              <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-[10px] font-bold">⚠ MOISISSURE</span>
                            )}
                          </div>
                          {/* Quick badges */}
                          <div className="flex flex-wrap gap-1.5">
                            {STATUS_CFG.map(cfg => (
                              <LotBadge
                                key={cfg.key}
                                icon={cfg.icon}
                                label={cfg.label}
                                value={r.lotTotals[cfg.key as keyof typeof r.lotTotals] ?? 0}
                                color={cfg.color}
                                bg={cfg.bg}
                              />
                            ))}
                            {total === 0 && <span className="text-xs text-gray-400">Aucun lot</span>}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-lg font-bold text-gray-900">{total.toFixed(0)} <span className="text-xs font-normal text-gray-400">kg</span></p>
                          <p className="text-[10px] text-gray-400">total lots</p>
                          <ChevronRight className={`w-4 h-4 text-gray-300 ml-auto mt-1 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                        </div>
                      </div>
                    </button>

                    {/* Expanded detail */}
                    {isOpen && <ReportDetail report={r} />}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
