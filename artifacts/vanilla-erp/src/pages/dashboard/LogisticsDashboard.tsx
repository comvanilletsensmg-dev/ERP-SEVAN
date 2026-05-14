import { Link } from "wouter";
import {
  Package, Leaf, AlertTriangle, Truck, Warehouse, BarChart2,
  ShoppingCart, Users, ChevronRight, Activity, ArrowUp, ArrowDown,
  Minus, Globe, Flame, Wind, Clock, CheckCircle2,
  TrendingDown, Box, CircleDot, Zap, Calendar,
} from "lucide-react";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
  LineChart, Line, XAxis, YAxis, CartesianGrid, BarChart, Bar,
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ConsumableItem { id: string; name: string; unit: string; stock: number; minStock: number; isCritical: boolean }
interface ExportOrder { id: string; reference: string; clientName: string; quantityKg: number; status: string; priority: string; deadline: string | null; destination: string | null; createdAt: string }
interface PurchaseItem { id: string; totalAmount: number; weight: number; humidity: number; status: string; reference: string | null; supplierName: string | null; region: string | null; score: number; createdAt: string }
interface LotItem { id: string; code: string; status: string; weightInitial: number; weightCurrent: number; humidity: number; riskLevel: string | null; riskScore: number; grade: string | null; warehouse: string | null; region: string | null; createdAt: string }

interface LogisticsData {
  totalStockKg: number; totalSalesUsd: number; totalPurchasesMga: number;
  activeLotsCount: number; suppliersCount: number; clientsCount: number;
  lotStatusBreakdown: { status: string; count: number; totalKg: number }[];
  recentMovements: { id: string; type: string; lotId: string | null; quantity: number; note: string | null; createdAt: string }[];
  highRiskLots: number; mediumRiskLots: number; highHumidityLots: number;
  pendingPurchases: number; activeExportOrders: number;
  exportOrdersByStatus: { status: string; count: number }[];
  monthlyPurchasesTrend: { label: string; total: number; nb: number }[];
  consumables: ConsumableItem[];
  criticalConsumablesCount: number;
  exportOrdersList: ExportOrder[];
  recentPurchasesList: PurchaseItem[];
  lotsList: LotItem[];
  productionTaskStats: { status: string; count: number }[];
}

// ─── Constants ────────────────────────────────────────────────────────────────
const LOT_COLORS: Record<string, string> = { raw: "#6366f1", curing: "#f59e0b", drying: "#f97316", ready: "#22c55e", sold: "#94a3b8" };
const LOT_FR: Record<string, string> = { raw: "Brut", curing: "Maturation", drying: "Séchage", ready: "Prêt export", sold: "Vendu" };

const RISK_CFG: Record<string, { bg: string; text: string; label: string }> = {
  HIGH:   { bg: "bg-red-100",    text: "text-red-700",    label: "ÉLEVÉ" },
  MEDIUM: { bg: "bg-amber-100",  text: "text-amber-700",  label: "MOYEN" },
  LOW:    { bg: "bg-emerald-100",text: "text-emerald-700",label: "FAIBLE" },
};

const EXPORT_CFG: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  pending:   { bg: "bg-amber-50",   text: "text-amber-700",   dot: "bg-amber-400",   label: "En attente" },
  preparing: { bg: "bg-blue-50",    text: "text-blue-700",    dot: "bg-blue-400",    label: "Préparation" },
  shipped:   { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500", label: "Expédié" },
  delivered: { bg: "bg-gray-100",   text: "text-gray-500",    dot: "bg-gray-400",    label: "Livré" },
};

const MOV_CFG: Record<string, { icon: any; color: string; bg: string; label: string }> = {
  IN:       { icon: ArrowUp,      color: "text-emerald-600", bg: "bg-emerald-50", label: "Entrée" },
  OUT:      { icon: ArrowDown,    color: "text-red-600",     bg: "bg-red-50",     label: "Sortie" },
  LOSS:     { icon: TrendingDown, color: "text-amber-600",   bg: "bg-amber-50",   label: "Perte" },
  TRANSFER: { icon: Minus,        color: "text-blue-600",    bg: "bg-blue-50",    label: "Transfert" },
};

const PURCHASE_STATUS_CFG: Record<string, { bg: string; text: string; label: string }> = {
  brouillon:    { bg: "bg-gray-100",    text: "text-gray-600",    label: "Brouillon" },
  valide:       { bg: "bg-blue-100",    text: "text-blue-700",    label: "Validé" },
  receptionne:  { bg: "bg-violet-100",  text: "text-violet-700",  label: "Réceptionné" },
  comptabilise: { bg: "bg-emerald-100", text: "text-emerald-700", label: "Comptabilisé" },
};

const fmt  = (n: number) => new Intl.NumberFormat("fr-MG", { maximumFractionDigits: 0 }).format(n ?? 0);
const fmtM = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} M` : n >= 1_000 ? `${(n / 1_000).toFixed(0)} K` : String(Math.round(n));

// ─── Sub-components ───────────────────────────────────────────────────────────
function KpiTile({ label, value, sub, icon: Icon, iconBg, iconColor, urgent }: {
  label: string; value: string | number; sub?: string;
  icon: any; iconBg: string; iconColor: string; urgent?: boolean;
}) {
  return (
    <div className={`bg-white rounded-2xl border shadow-sm p-4 ${urgent ? "border-red-200" : "border-gray-100"}`}>
      <div className="flex items-start justify-between mb-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${iconBg}`}>
          <Icon className={`w-4 h-4 ${iconColor}`} />
        </div>
        {urgent && (
          <span className="text-xs font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full animate-pulse">
            ALERTE
          </span>
        )}
      </div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
      <p className={`text-2xl font-bold ${urgent ? "text-red-600" : "text-gray-900"}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function StatusBadge({ status, cfg }: {
  status: string;
  cfg: Record<string, { bg: string; text: string; label: string; dot?: string }>;
}) {
  const c = cfg[status] ?? { bg: "bg-gray-100", text: "text-gray-600", label: status };
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${c.bg} ${c.text}`}>
      {"dot" in c && c.dot && <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />}
      {c.label}
    </span>
  );
}

function EmptyState({ icon: Icon, text }: { icon: any; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-2 text-gray-200">
      <Icon className="w-10 h-10" />
      <p className="text-xs text-gray-300">{text}</p>
    </div>
  );
}

function SectionHeader({ title, sub, href, linkLabel }: { title: string; sub?: string; href?: string; linkLabel?: string }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div>
        <h3 className="text-sm font-bold text-gray-800">{title}</h3>
        {sub && <p className="text-xs text-gray-400">{sub}</p>}
      </div>
      {href && linkLabel && (
        <Link href={href}>
          <div className="flex items-center gap-1 text-xs text-emerald-600 font-medium hover:underline cursor-pointer">
            {linkLabel} <ChevronRight className="w-3.5 h-3.5" />
          </div>
        </Link>
      )}
    </div>
  );
}

function ConsumableBar({ item }: { item: ConsumableItem }) {
  const maxRef = item.minStock * 3;
  const ratio  = maxRef > 0 ? Math.min((item.stock / maxRef) * 100, 100) : 100;
  const safety = item.minStock > 0 ? item.stock / item.minStock : 2;
  const bar    = safety <= 1 ? "bg-red-500" : safety <= 1.5 ? "bg-amber-400" : "bg-emerald-500";

  return (
    <div className="py-2 border-b border-gray-50 last:border-0">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-sm font-medium text-gray-800 truncate max-w-[160px]">{item.name}</span>
        <span className={`text-xs font-bold ml-2 flex-shrink-0 ${item.isCritical ? "text-red-600" : "text-gray-500"}`}>
          {fmt(item.stock)} {item.unit}
        </span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-1.5">
        <div className={`h-1.5 rounded-full transition-all ${bar}`} style={{ width: `${Math.max(ratio, 2)}%` }} />
      </div>
      <div className="flex justify-between mt-0.5">
        <span className="text-xs text-gray-300">Seuil min : {fmt(item.minStock)} {item.unit}</span>
        {item.isCritical && <span className="text-xs font-bold text-red-500">CRITIQUE</span>}
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function LogisticsDashboard({ data }: { data: LogisticsData }) {
  if (!data) {
    return (
      <div className="flex items-center justify-center py-24 gap-3 text-gray-400">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm">Chargement du tableau logistique…</p>
      </div>
    );
  }

  const totalAlerts =
    (data.highRiskLots ?? 0) + (data.mediumRiskLots ?? 0) +
    (data.highHumidityLots ?? 0) + (data.criticalConsumablesCount ?? 0);

  const lotPieData = (data.lotStatusBreakdown ?? [])
    .filter(r => r.totalKg > 0)
    .map(r => ({ name: LOT_FR[r.status] ?? r.status, value: r.totalKg, fill: LOT_COLORS[r.status] ?? "#94a3b8" }));

  const avgYield = (data.lotsList ?? []).length > 0
    ? Math.round((data.lotsList).reduce((s, l) => s + (l.weightInitial > 0 ? (l.weightCurrent / l.weightInitial) * 100 : 0), 0) / data.lotsList.length)
    : 0;

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
            <Activity className="w-3.5 h-3.5 text-emerald-500" />
            <span>Tableau de bord logistique · Temps réel</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Centre Logistique</h1>
          <p className="text-sm text-gray-500">Lots · Stock · Export · Achats · Consommables</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link href="/lots">
            <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors">
              <Leaf className="w-3.5 h-3.5" /> Gestion lots
            </button>
          </Link>
          <Link href="/purchases">
            <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
              <ShoppingCart className="w-3.5 h-3.5" /> Achats
            </button>
          </Link>
        </div>
      </div>

      {/* ── Alert Banner ── */}
      {totalAlerts > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <h2 className="text-sm font-bold text-red-800">
              {totalAlerts} alerte{totalAlerts > 1 ? "s" : ""} logistique{totalAlerts > 1 ? "s" : ""} détectée{totalAlerts > 1 ? "s" : ""}
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {(data.highRiskLots ?? 0) > 0 && (
              <Link href="/lots">
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-100 border border-red-300 rounded-xl text-xs font-semibold text-red-700 cursor-pointer hover:bg-red-200 transition-colors">
                  <AlertTriangle className="w-3.5 h-3.5" /> {data.highRiskLots} lot{data.highRiskLots > 1 ? "s" : ""} HIGH risque
                </div>
              </Link>
            )}
            {(data.mediumRiskLots ?? 0) > 0 && (
              <Link href="/lots">
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-100 border border-orange-300 rounded-xl text-xs font-semibold text-orange-700 cursor-pointer hover:bg-orange-200 transition-colors">
                  <AlertTriangle className="w-3.5 h-3.5" /> {data.mediumRiskLots} lot{data.mediumRiskLots > 1 ? "s" : ""} MEDIUM risque
                </div>
              </Link>
            )}
            {(data.highHumidityLots ?? 0) > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 border border-amber-300 rounded-xl text-xs font-semibold text-amber-700">
                <Wind className="w-3.5 h-3.5" /> {data.highHumidityLots} lot{data.highHumidityLots > 1 ? "s" : ""} humidité &gt;38%
              </div>
            )}
            {(data.criticalConsumablesCount ?? 0) > 0 && (
              <Link href="/logistics/consumables">
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-100 border border-violet-300 rounded-xl text-xs font-semibold text-violet-700 cursor-pointer hover:bg-violet-200 transition-colors">
                  <Box className="w-3.5 h-3.5" /> {data.criticalConsumablesCount} consommable{data.criticalConsumablesCount > 1 ? "s" : ""} critique{data.criticalConsumablesCount > 1 ? "s" : ""}
                </div>
              </Link>
            )}
          </div>
        </div>
      )}

      {/* ── KPI Grid (8 tiles) ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiTile label="Stock actif" icon={Warehouse} iconBg="bg-emerald-50" iconColor="text-emerald-600"
          value={`${fmt(data.totalStockKg)} kg`}
          sub={`${data.activeLotsCount} lot${data.activeLotsCount !== 1 ? "s" : ""} en cours`} />
        <KpiTile label="Lots à risque" icon={AlertTriangle} iconBg="bg-red-50" iconColor="text-red-500"
          value={(data.highRiskLots ?? 0) + (data.mediumRiskLots ?? 0)}
          sub={`${data.highRiskLots ?? 0} HIGH · ${data.mediumRiskLots ?? 0} MEDIUM`}
          urgent={(data.highRiskLots ?? 0) > 0} />
        <KpiTile label="Commandes export" icon={Truck} iconBg="bg-blue-50" iconColor="text-blue-600"
          value={data.activeExportOrders ?? 0}
          sub={`${(data.exportOrdersByStatus ?? []).find(s => s.status === "pending")?.count ?? 0} en attente`} />
        <KpiTile label="Achats en attente" icon={ShoppingCart} iconBg="bg-amber-50" iconColor="text-amber-600"
          value={data.pendingPurchases ?? 0} sub="statut validé"
          urgent={(data.pendingPurchases ?? 0) > 0} />
        <KpiTile label="Rendement moyen" icon={BarChart2} iconBg="bg-indigo-50" iconColor="text-indigo-600"
          value={`${avgYield}%`} sub="poids actuel / initial" />
        <KpiTile label="Consommables" icon={Box} iconBg="bg-violet-50" iconColor="text-violet-600"
          value={(data.consumables ?? []).length}
          sub={`${data.criticalConsumablesCount ?? 0} critique${(data.criticalConsumablesCount ?? 0) > 1 ? "s" : ""}`}
          urgent={(data.criticalConsumablesCount ?? 0) > 0} />
        <KpiTile label="Fournisseurs" icon={Users} iconBg="bg-sky-50" iconColor="text-sky-600"
          value={data.suppliersCount ?? 0} sub="actifs" />
        <KpiTile label="CA Export" icon={Globe} iconBg="bg-teal-50" iconColor="text-teal-600"
          value={`$${fmtM(data.totalSalesUsd ?? 0)}`}
          sub={`${data.clientsCount ?? 0} clients`} />
      </div>

      {/* ── Lot Status + Export Orders ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Suivi lots */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <SectionHeader title="Suivi des lots" sub={`${data.activeLotsCount} actifs · ${fmt(data.totalStockKg)} kg`} href="/lots" linkLabel="Tous les lots" />

          {lotPieData.length > 0 ? (
            <div className="flex gap-4 items-center">
              <div className="flex-shrink-0">
                <ResponsiveContainer width={150} height={150}>
                  <PieChart>
                    <Pie data={lotPieData} dataKey="value" cx="50%" cy="50%"
                      innerRadius={40} outerRadius={65} paddingAngle={3}>
                      {lotPieData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => [`${fmt(v)} kg`]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-2">
                {(data.lotStatusBreakdown ?? []).map(r => (
                  <div key={r.status} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ background: LOT_COLORS[r.status] ?? "#94a3b8" }} />
                      <span className="text-xs text-gray-600">{LOT_FR[r.status] ?? r.status}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold text-gray-800">{r.count}</span>
                      <span className="text-xs text-gray-400 ml-1">({fmt(r.totalKg)} kg)</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState icon={Leaf} text="Aucun lot actif en stock" />
          )}

          {/* Lots list */}
          {(data.lotsList ?? []).length > 0 && (
            <div className="mt-4 border-t border-gray-50 pt-4">
              <p className="text-xs font-semibold text-gray-400 mb-2">Lots actifs récents</p>
              <div className="space-y-0">
                {data.lotsList.slice(0, 5).map(l => {
                  const yld = l.weightInitial > 0 ? Math.round((l.weightCurrent / l.weightInitial) * 100) : 0;
                  return (
                    <div key={l.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <div>
                        <p className="text-xs font-bold text-gray-800">{l.code}</p>
                        <p className="text-xs text-gray-400">{l.region ?? "—"} · {l.grade ?? "—"}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">{fmt(l.weightCurrent)} kg</span>
                        <span className={`text-xs font-bold ${yld >= 90 ? "text-emerald-600" : yld >= 75 ? "text-amber-600" : "text-red-600"}`}>
                          {yld}%
                        </span>
                        {l.riskLevel && <StatusBadge status={l.riskLevel} cfg={RISK_CFG} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Export orders */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <SectionHeader
            title="Commandes Export"
            sub={`${data.activeExportOrders ?? 0} commande${(data.activeExportOrders ?? 0) > 1 ? "s" : ""} actives`}
            href="/logistics/planning"
            linkLabel="Planning"
          />

          {/* Status counters */}
          <div className="grid grid-cols-4 gap-2 mb-4">
            {(["pending", "preparing", "shipped", "delivered"] as const).map(s => {
              const cnt = (data.exportOrdersByStatus ?? []).find(x => x.status === s)?.count ?? 0;
              const cfg = EXPORT_CFG[s];
              return (
                <div key={s} className={`rounded-xl p-2.5 text-center ${cfg.bg}`}>
                  <p className={`text-xl font-bold ${cfg.text}`}>{cnt}</p>
                  <p className={`text-xs ${cfg.text} opacity-80`}>{cfg.label}</p>
                </div>
              );
            })}
          </div>

          {(data.exportOrdersList ?? []).length > 0 ? (
            <div className="space-y-0 overflow-y-auto max-h-60">
              {data.exportOrdersList.map(e => (
                <div key={e.id} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-xs font-bold text-gray-800">{e.reference}</p>
                    <p className="text-xs text-gray-400 truncate max-w-[140px]">
                      {e.clientName} · {e.destination ?? "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-gray-500">{fmt(e.quantityKg)} kg</span>
                    <StatusBadge status={e.status} cfg={EXPORT_CFG} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={Truck} text="Aucune commande export" />
          )}
        </div>
      </div>

      {/* ── Consommables + Mouvements stock ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Consumables */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <SectionHeader
            title="Consommables"
            sub={`${(data.consumables ?? []).length} références · ${data.criticalConsumablesCount ?? 0} critique${(data.criticalConsumablesCount ?? 0) > 1 ? "s" : ""}`}
            href="/logistics/consumables"
            linkLabel="Gérer"
          />
          {(data.consumables ?? []).length > 0 ? (
            <div className="space-y-0 overflow-y-auto max-h-72">
              {data.consumables.map(c => <ConsumableBar key={c.id} item={c} />)}
            </div>
          ) : (
            <EmptyState icon={Box} text="Aucun consommable enregistré" />
          )}
        </div>

        {/* Stock Movements Timeline */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <SectionHeader title="Mouvements stock" sub="Timeline — entrées, sorties, pertes" href="/logistics/stock" linkLabel="Historique" />
          {(data.recentMovements ?? []).length > 0 ? (
            <div className="relative pl-5">
              <div className="absolute left-5 top-0 bottom-0 w-px bg-gray-100" />
              <div className="space-y-3">
                {data.recentMovements.map(m => {
                  const cfg = MOV_CFG[m.type] ?? { icon: Minus, color: "text-gray-500", bg: "bg-gray-50", label: m.type };
                  const Icon = cfg.icon;
                  return (
                    <div key={m.id} className="flex items-start gap-3 relative">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 -ml-3.5 z-10 border-2 border-white ${cfg.bg}`}>
                        <Icon className={`w-3 h-3 ${cfg.color}`} />
                      </div>
                      <div className="flex-1 pb-3 border-b border-gray-50 last:border-0">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className={`text-xs font-bold ${cfg.color}`}>{cfg.label}</span>
                            {m.note && <span className="text-xs text-gray-500 ml-2">{m.note}</span>}
                          </div>
                          <span className="text-xs font-semibold text-gray-700">{fmt(m.quantity)} kg</span>
                        </div>
                        <p className="text-xs text-gray-300 mt-0.5">
                          {new Date(m.createdAt).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <EmptyState icon={Activity} text="Aucun mouvement de stock récent" />
          )}
        </div>
      </div>

      {/* ── Analytics Charts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Monthly purchases trend */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-bold text-gray-800 mb-1">Tendance achats matières</h3>
          <p className="text-xs text-gray-400 mb-4">Volume 6 derniers mois (MGA)</p>
          {(data.monthlyPurchasesTrend ?? []).length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={data.monthlyPurchasesTrend} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => fmtM(v)} />
                <Tooltip formatter={(v: number) => [`${fmt(v)} MGA`]} />
                <Line type="monotone" dataKey="total" stroke="#059669" strokeWidth={2.5}
                  dot={{ r: 3, fill: "#059669" }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState icon={BarChart2} text="Aucune donnée achats ce semestre" />
          )}
        </div>

        {/* Export breakdown bar */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-bold text-gray-800 mb-1">Export par statut</h3>
          <p className="text-xs text-gray-400 mb-4">Commandes en cours</p>
          {(data.exportOrdersByStatus ?? []).length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart
                data={(data.exportOrdersByStatus ?? []).map(s => ({ name: EXPORT_CFG[s.status]?.label ?? s.status, value: s.count }))}
                barSize={28} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" radius={[5, 5, 0, 0]} fill="#059669" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState icon={Globe} text="Aucune commande export" />
          )}
        </div>
      </div>

      {/* ── Recent Purchases table ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <SectionHeader
          title="Achats matières récents"
          sub="Historique des approvisionnements"
          href="/purchases"
          linkLabel="Tous les achats"
        />
        {(data.recentPurchasesList ?? []).length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-gray-400 border-b border-gray-100">
                  <th className="pb-2 pr-4">Référence</th>
                  <th className="pb-2 pr-4">Fournisseur</th>
                  <th className="pb-2 pr-4">Région</th>
                  <th className="pb-2 pr-4">Poids</th>
                  <th className="pb-2 pr-4">Humidité</th>
                  <th className="pb-2 pr-4">Montant</th>
                  <th className="pb-2">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.recentPurchasesList.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="py-2.5 pr-4 font-mono text-xs text-gray-500">{p.reference ?? "—"}</td>
                    <td className="py-2.5 pr-4 font-medium text-gray-800 max-w-[140px] truncate">{p.supplierName ?? "—"}</td>
                    <td className="py-2.5 pr-4 text-xs text-gray-500">{p.region ?? "—"}</td>
                    <td className="py-2.5 pr-4 text-xs text-gray-700">{p.weight > 0 ? `${fmt(p.weight)} kg` : "—"}</td>
                    <td className="py-2.5 pr-4">
                      {p.humidity > 0 ? (
                        <span className={`text-xs font-semibold ${p.humidity > 38 ? "text-red-600" : p.humidity > 35 ? "text-amber-600" : "text-emerald-600"}`}>
                          {p.humidity.toFixed(1)}%
                        </span>
                      ) : "—"}
                    </td>
                    <td className="py-2.5 pr-4 text-xs text-gray-700">
                      {p.totalAmount > 0 ? `${fmtM(p.totalAmount)} MGA` : "—"}
                    </td>
                    <td className="py-2.5">
                      <StatusBadge status={p.status ?? "brouillon"} cfg={PURCHASE_STATUS_CFG} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={ShoppingCart} text="Aucun achat enregistré" />
        )}
      </div>

      {/* ── Production Tasks + Quick Actions ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        {/* Production tasks */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <SectionHeader title="Tâches production" sub="Répartition par statut" href="/logistics/production" linkLabel="Planning" />
          {(data.productionTaskStats ?? []).length > 0 ? (
            <div className="space-y-2">
              {data.productionTaskStats.map(t => (
                <div key={t.status} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <span className="text-sm text-gray-700 capitalize">{t.status}</span>
                  <span className="text-lg font-bold text-gray-900">{t.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={Calendar} text="Aucune tâche de production" />
          )}
        </div>

        {/* Quick actions */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-4 h-4 text-emerald-500" />
            <h3 className="text-sm font-bold text-gray-800">Accès rapides</h3>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Nouveau lot",      icon: Leaf,         href: "/lots",                 color: "border-emerald-200 text-emerald-700 hover:bg-emerald-50" },
              { label: "Nouvel achat",     icon: ShoppingCart, href: "/purchases",             color: "border-blue-200 text-blue-700 hover:bg-blue-50" },
              { label: "Mouvements stock", icon: Activity,     href: "/logistics/stock",       color: "border-violet-200 text-violet-700 hover:bg-violet-50" },
              { label: "Export planning",  icon: Truck,        href: "/logistics/planning",    color: "border-indigo-200 text-indigo-700 hover:bg-indigo-50" },
              { label: "Lots à risque",    icon: AlertTriangle,href: "/logistics/risk",        color: "border-red-200 text-red-700 hover:bg-red-50" },
              { label: "Consommables",     icon: Box,          href: "/logistics/consumables", color: "border-amber-200 text-amber-700 hover:bg-amber-50" },
              { label: "Fournisseurs",     icon: Users,        href: "/suppliers",             color: "border-sky-200 text-sky-700 hover:bg-sky-50" },
              { label: "Opérations",       icon: BarChart2,    href: "/operations",            color: "border-teal-200 text-teal-700 hover:bg-teal-50" },
            ].map(a => {
              const Icon = a.icon;
              return (
                <Link key={a.href} href={a.href}>
                  <div className={`flex items-center gap-2 p-3 rounded-xl border-2 border-dashed cursor-pointer transition-all hover:border-solid ${a.color}`}>
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span className="text-xs font-semibold">{a.label}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
