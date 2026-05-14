import { Link } from "wouter";
import {
  Globe, Banknote, TrendingUp, Warehouse, BarChart2, Users,
  AlertTriangle, ShoppingCart, FileText, Calendar, Clock,
  CheckCircle2, Zap, ChevronRight, Activity, Shield,
  Plane, CreditCard, Box, Building2, ArrowUp, Leaf,
  Wind, BookOpen, UserCheck, Lock,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Cell, PieChart, Pie, LineChart, Line, Legend,
} from "recharts";

// ─── Types ─────────────────────────────────────────────────────────────────────
interface ExportOrder { id: string; reference: string; clientName: string; quantityKg: number; status: string; priority: string; deadline: string | null; destination: string | null; createdAt: string }
interface WorkflowCounts { pendingPurchases: number; pendingInvoices: number; pendingLeaves: number; pendingHrRequests: number; pendingExportOrders: number }

interface AdminData {
  totalSalesUsd: number; bankBalance: number; revenue: number; charges: number; resultat: number;
  totalStockKg: number; avgYieldPct: number; totalEmployees: number; activeEmployees: number;
  totalPurchasesMga: number; pendingInvoices: number; totalValidatedTTC: number;
  unmatchedBankTransactions: number; activeLotsCount: number; suppliersCount: number;
  clientsCount: number; highRiskLots: number; mediumRiskLots: number; highHumidityLots: number;
  lotStatusBreakdown: { status: string; count: number; totalKg: number }[];
  pendingLeaves: number; pendingRequests: number;
  workflows: WorkflowCounts;
  activeExportOrders: number; exportOrdersByStatus: { status: string; count: number }[];
  exportOrdersList: ExportOrder[]; criticalConsumablesCount: number;
  monthlyRevenueTrend: { label: string; revenue: number; charges: number }[];
  recentMovements: { id: string; type: string; quantity: number; note: string | null; createdAt: string }[];
}

// ─── Constants ──────────────────────────────────────────────────────────────────
const LOT_COLORS: Record<string, string> = { raw: "#6366f1", curing: "#f59e0b", drying: "#f97316", ready: "#22c55e", sold: "#94a3b8" };
const LOT_FR: Record<string, string> = { raw: "Brut", curing: "Maturation", drying: "Séchage", ready: "Prêt", sold: "Vendu" };

const EXPORT_CFG: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  pending:   { bg: "bg-amber-50",   text: "text-amber-700",   dot: "bg-amber-400",   label: "En attente" },
  preparing: { bg: "bg-blue-50",    text: "text-blue-700",    dot: "bg-blue-400",    label: "Préparation" },
  shipped:   { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500", label: "Expédié" },
  delivered: { bg: "bg-gray-100",   text: "text-gray-500",    dot: "bg-gray-400",    label: "Livré" },
};

const PRIORITY_CFG: Record<string, { bg: string; text: string }> = {
  urgent: { bg: "bg-red-100",    text: "text-red-700" },
  high:   { bg: "bg-orange-100", text: "text-orange-700" },
  normal: { bg: "bg-gray-100",   text: "text-gray-600" },
  low:    { bg: "bg-blue-50",    text: "text-blue-600" },
};

const fmt  = (n: number) => new Intl.NumberFormat("fr-MG", { maximumFractionDigits: 0 }).format(n ?? 0);
const fmtM = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} M` : n >= 1_000 ? `${(n / 1_000).toFixed(0)} K` : String(Math.round(n));
const now  = new Date();
const dateStr = now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

// ─── Sub-components ─────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, icon: Icon, iconBg, iconColor, accent, urgent, href }: {
  label: string; value: string | number; sub?: string; icon: any;
  iconBg: string; iconColor: string; accent?: string; urgent?: boolean; href?: string;
}) {
  const inner = (
    <div className={`bg-white rounded-2xl border shadow-sm p-4 h-full ${urgent ? "border-red-200" : "border-gray-100"} hover:shadow-md transition-shadow`}>
      <div className="flex items-start justify-between mb-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${iconBg}`}>
          <Icon className={`w-4 h-4 ${iconColor}`} />
        </div>
        {urgent && <span className="text-xs font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full animate-pulse">!</span>}
      </div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
      <p className={`text-2xl font-bold ${accent ?? (urgent ? "text-red-600" : "text-gray-900")}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function WorkflowCard({ label, count, icon: Icon, href, color, urgentThreshold = 1 }: {
  label: string; count: number; icon: any; href: string; color: string; urgentThreshold?: number;
}) {
  const isUrgent = count >= urgentThreshold && urgentThreshold > 0;
  return (
    <Link href={href}>
      <div className={`bg-white rounded-xl border p-4 flex items-center justify-between hover:shadow-md transition-all cursor-pointer ${isUrgent ? "border-orange-200" : "border-gray-100"}`}>
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${color}`}>
            <Icon className="w-4 h-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-800">{label}</p>
            <p className="text-xs text-gray-400">Cliquer pour traiter</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-2xl font-bold ${count > 0 ? "text-orange-600" : "text-gray-300"}`}>{count}</span>
          <ChevronRight className="w-4 h-4 text-gray-300" />
        </div>
      </div>
    </Link>
  );
}

function EmptyState({ icon: Icon, text }: { icon: any; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 gap-2 text-gray-200">
      <Icon className="w-8 h-8" />
      <p className="text-xs text-gray-300">{text}</p>
    </div>
  );
}

// ─── Main Dashboard ─────────────────────────────────────────────────────────────
export default function AdminExecutiveDashboard({ data }: { data: AdminData }) {
  if (!data) {
    return (
      <div className="flex items-center justify-center py-24 gap-3 text-gray-400">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm">Chargement du centre de gouvernance…</p>
      </div>
    );
  }

  const wf = data.workflows ?? {};
  const totalWorkflows = (wf.pendingPurchases ?? 0) + (wf.pendingInvoices ?? 0) + (wf.pendingLeaves ?? 0) + (wf.pendingHrRequests ?? 0) + (wf.pendingExportOrders ?? 0);
  const totalRisks = (data.highRiskLots ?? 0) + (data.mediumRiskLots ?? 0) + (data.highHumidityLots ?? 0) + (data.unmatchedBankTransactions ?? 0) + (data.criticalConsumablesCount ?? 0);

  const lotPieData = (data.lotStatusBreakdown ?? [])
    .filter(r => r.totalKg > 0)
    .map(r => ({ name: LOT_FR[r.status] ?? r.status, value: r.totalKg, fill: LOT_COLORS[r.status] ?? "#94a3b8" }));

  return (
    <div className="space-y-6">

      {/* ── Executive Header ── */}
      <div className="bg-gradient-to-r from-gray-900 via-gray-800 to-emerald-900 rounded-2xl p-6 text-white">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-gray-400 text-xs mb-2">
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
              <span>Accès Administrateur · Données consolidées</span>
            </div>
            <h1 className="text-2xl font-bold text-white">Centre de gouvernance ERP</h1>
            <p className="text-gray-400 text-sm mt-0.5 capitalize">{dateStr}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/20 border border-emerald-500/40 rounded-lg text-xs font-medium text-emerald-400">
              <Activity className="w-3.5 h-3.5" /> Système opérationnel
            </div>
            {totalWorkflows > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500/20 border border-orange-500/40 rounded-lg text-xs font-medium text-orange-300">
                <Clock className="w-3.5 h-3.5" /> {totalWorkflows} action{totalWorkflows > 1 ? "s" : ""} en attente
              </div>
            )}
          </div>
        </div>

        {/* Executive KPI strip inside header */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mt-5 pt-5 border-t border-white/10">
          {[
            { label: "CA Export",    value: `$${fmtM(data.totalSalesUsd ?? 0)}`,       accent: "text-emerald-400" },
            { label: "Trésorerie",   value: `${fmtM(data.bankBalance ?? 0)} MGA`,       accent: data.bankBalance >= 0 ? "text-white" : "text-red-400" },
            { label: "Résultat net", value: `${fmtM(data.resultat ?? 0)} MGA`,          accent: data.resultat >= 0 ? "text-emerald-400" : "text-red-400" },
            { label: "Stock global", value: `${fmt(data.totalStockKg ?? 0)} kg`,        accent: "text-white" },
            { label: "Rendement",    value: `${data.avgYieldPct ?? 0}%`,               accent: (data.avgYieldPct ?? 0) >= 85 ? "text-emerald-400" : "text-amber-400" },
            { label: "Effectif",     value: `${data.activeEmployees ?? 0}/${data.totalEmployees ?? 0}`, accent: "text-white" },
          ].map(k => (
            <div key={k.label} className="text-center">
              <p className="text-xs text-gray-400 mb-1">{k.label}</p>
              <p className={`text-lg font-bold ${k.accent}`}>{k.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Risk Alerts ── */}
      {totalRisks > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <h2 className="text-sm font-bold text-red-800">{totalRisks} point{totalRisks > 1 ? "s" : ""} d'attention détecté{totalRisks > 1 ? "s" : ""}</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {(data.highRiskLots ?? 0) > 0 && (
              <Link href="/lots"><div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-100 border border-red-300 rounded-xl text-xs font-semibold text-red-700 cursor-pointer hover:bg-red-200">{data.highRiskLots} lot{data.highRiskLots > 1 ? "s" : ""} HIGH risque</div></Link>
            )}
            {(data.mediumRiskLots ?? 0) > 0 && (
              <Link href="/lots"><div className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-100 border border-orange-300 rounded-xl text-xs font-semibold text-orange-700 cursor-pointer hover:bg-orange-200">{data.mediumRiskLots} lot{data.mediumRiskLots > 1 ? "s" : ""} MEDIUM risque</div></Link>
            )}
            {(data.highHumidityLots ?? 0) > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 border border-amber-300 rounded-xl text-xs font-semibold text-amber-700">
                <Wind className="w-3.5 h-3.5" /> {data.highHumidityLots} lot{data.highHumidityLots > 1 ? "s" : ""} humidité &gt;38%
              </div>
            )}
            {(data.unmatchedBankTransactions ?? 0) > 0 && (
              <Link href="/accounting/bank"><div className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-100 border border-violet-300 rounded-xl text-xs font-semibold text-violet-700 cursor-pointer">{data.unmatchedBankTransactions} txn. bancaire{data.unmatchedBankTransactions > 1 ? "s" : ""} non rapprochée{data.unmatchedBankTransactions > 1 ? "s" : ""}</div></Link>
            )}
            {(data.criticalConsumablesCount ?? 0) > 0 && (
              <Link href="/logistics/consumables"><div className="flex items-center gap-1.5 px-3 py-1.5 bg-pink-100 border border-pink-300 rounded-xl text-xs font-semibold text-pink-700 cursor-pointer">{data.criticalConsumablesCount} consommable{data.criticalConsumablesCount > 1 ? "s" : ""} critique{data.criticalConsumablesCount > 1 ? "s" : ""}</div></Link>
            )}
          </div>
        </div>
      )}

      {/* ── KPI Grid ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Revenus" icon={TrendingUp} iconBg="bg-emerald-50" iconColor="text-emerald-600"
          value={`${fmtM(data.revenue ?? 0)} MGA`} sub={`Charges : ${fmtM(data.charges ?? 0)} MGA`}
          accent="text-emerald-700" href="/accounting" />
        <KpiCard label="Trésorerie" icon={Banknote} iconBg="bg-violet-50" iconColor="text-violet-600"
          value={`${fmtM(data.bankBalance ?? 0)} MGA`}
          sub={`${data.unmatchedBankTransactions ?? 0} txn. à rapprocher`}
          urgent={(data.unmatchedBankTransactions ?? 0) > 0}
          href="/accounting/bank" />
        <KpiCard label="Factures validées" icon={FileText} iconBg="bg-blue-50" iconColor="text-blue-600"
          value={`${fmtM(data.totalValidatedTTC ?? 0)} MGA`}
          sub={`${data.pendingInvoices ?? 0} en attente de paiement`}
          urgent={(data.pendingInvoices ?? 0) > 0} href="/accounting/invoices" />
        <KpiCard label="CA Export USD" icon={Globe} iconBg="bg-teal-50" iconColor="text-teal-600"
          value={`$${fmtM(data.totalSalesUsd ?? 0)}`}
          sub={`${data.clientsCount ?? 0} clients · ${data.suppliersCount ?? 0} fournisseurs`}
          accent="text-teal-700" href="/sales" />
        <KpiCard label="Lots actifs" icon={Leaf} iconBg="bg-green-50" iconColor="text-green-600"
          value={data.activeLotsCount ?? 0}
          sub={`${fmt(data.totalStockKg ?? 0)} kg · rendement ${data.avgYieldPct ?? 0}%`}
          href="/lots" />
        <KpiCard label="Lots à risque" icon={AlertTriangle} iconBg="bg-red-50" iconColor="text-red-500"
          value={(data.highRiskLots ?? 0) + (data.mediumRiskLots ?? 0)}
          sub={`${data.highRiskLots ?? 0} HIGH · ${data.mediumRiskLots ?? 0} MEDIUM`}
          urgent={(data.highRiskLots ?? 0) > 0} href="/logistics/risk" />
        <KpiCard label="Export actifs" icon={Plane} iconBg="bg-indigo-50" iconColor="text-indigo-600"
          value={data.activeExportOrders ?? 0}
          sub={`${(data.exportOrdersByStatus ?? []).find(s => s.status === "pending")?.count ?? 0} en attente`}
          href="/logistics/planning" />
        <KpiCard label="Achats total" icon={ShoppingCart} iconBg="bg-amber-50" iconColor="text-amber-600"
          value={`${fmtM(data.totalPurchasesMga ?? 0)} MGA`}
          sub={`${data.activeLotsCount ?? 0} lots créés`} href="/purchases" />
      </div>

      {/* ── Workflow Validation ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Zap className="w-4 h-4 text-orange-500" />
          <h2 className="text-sm font-bold text-gray-800">Workflows de validation</h2>
          {totalWorkflows > 0 && (
            <span className="text-xs font-bold text-white bg-orange-500 px-2 py-0.5 rounded-full ml-1">{totalWorkflows}</span>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <WorkflowCard label="Achats à valider"   count={wf.pendingPurchases ?? 0}   icon={ShoppingCart}  href="/purchases"           color="bg-emerald-50 text-emerald-600" />
          <WorkflowCard label="Factures à solder"  count={wf.pendingInvoices ?? 0}    icon={FileText}      href="/accounting/invoices"  color="bg-blue-50 text-blue-600" />
          <WorkflowCard label="Congés en attente"  count={wf.pendingLeaves ?? 0}      icon={Calendar}      href="/hr/leaves"            color="bg-violet-50 text-violet-600" />
          <WorkflowCard label="Demandes RH"        count={wf.pendingHrRequests ?? 0}  icon={Users}         href="/hr/requests"          color="bg-pink-50 text-pink-600" />
          <WorkflowCard label="Commandes export"   count={wf.pendingExportOrders ?? 0}icon={Plane}         href="/logistics/planning"   color="bg-indigo-50 text-indigo-600" />
        </div>
      </div>

      {/* ── BI Analytics Charts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Financial results */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-bold text-gray-800 mb-1">Résultats financiers — 6 derniers mois</h3>
          <p className="text-xs text-gray-400 mb-4">Revenus vs charges (MGA)</p>
          {(data.monthlyRevenueTrend ?? []).length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.monthlyRevenueTrend} barGap={4} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => fmtM(v)} />
                <Tooltip formatter={(v: number) => [`${fmtM(v)} MGA`]} />
                <Legend iconSize={10} />
                <Bar dataKey="revenue" name="Revenus" fill="#22c55e" radius={[4, 4, 0, 0]} barSize={18} />
                <Bar dataKey="charges" name="Charges"  fill="#f97316" radius={[4, 4, 0, 0]} barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState icon={BarChart2} text="Aucune donnée comptable sur 6 mois" />
          )}
        </div>

        {/* Lot breakdown donut */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-bold text-gray-800 mb-1">Lots par statut</h3>
          <p className="text-xs text-gray-400 mb-3">{data.activeLotsCount ?? 0} actifs · {fmt(data.totalStockKg ?? 0)} kg</p>
          {lotPieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={lotPieData} dataKey="value" cx="50%" cy="50%"
                  innerRadius={50} outerRadius={75} paddingAngle={3}>
                  {lotPieData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                </Pie>
                <Tooltip formatter={(v: number) => [`${fmt(v)} kg`]} />
                <Legend formatter={v => v} iconSize={10} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState icon={Leaf} text="Aucun lot actif en stock" />
          )}
        </div>
      </div>

      {/* ── Export Tracking ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-gray-800">Suivi commandes export</h3>
            <p className="text-xs text-gray-400">{data.activeExportOrders ?? 0} commandes actives</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Status counters */}
            {(["pending", "preparing", "shipped"] as const).map(s => {
              const cnt = (data.exportOrdersByStatus ?? []).find(x => x.status === s)?.count ?? 0;
              const cfg = EXPORT_CFG[s];
              return (
                <div key={s} className={`px-3 py-1 rounded-lg text-xs font-bold ${cfg.bg} ${cfg.text}`}>
                  {cnt} {cfg.label}
                </div>
              );
            })}
            <Link href="/logistics/planning">
              <div className="flex items-center gap-1 text-xs text-emerald-600 font-medium hover:underline cursor-pointer">
                Voir tout <ChevronRight className="w-3.5 h-3.5" />
              </div>
            </Link>
          </div>
        </div>
        {(data.exportOrdersList ?? []).length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-gray-400 border-b border-gray-100">
                  <th className="pb-2 pr-4">Référence</th>
                  <th className="pb-2 pr-4">Client</th>
                  <th className="pb-2 pr-4">Destination</th>
                  <th className="pb-2 pr-4">Quantité</th>
                  <th className="pb-2 pr-4">Priorité</th>
                  <th className="pb-2 pr-4">Échéance</th>
                  <th className="pb-2">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.exportOrdersList.map(e => {
                  const ecfg = EXPORT_CFG[e.status] ?? EXPORT_CFG.pending;
                  const pcfg = PRIORITY_CFG[e.priority ?? "normal"] ?? PRIORITY_CFG.normal;
                  const isOverdue = e.deadline && new Date(e.deadline) < new Date() && e.status !== "delivered";
                  return (
                    <tr key={e.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="py-2.5 pr-4 font-mono text-xs text-gray-600">{e.reference}</td>
                      <td className="py-2.5 pr-4 font-medium text-gray-800 max-w-[130px] truncate">{e.clientName}</td>
                      <td className="py-2.5 pr-4 text-xs text-gray-500">{e.destination ?? "—"}</td>
                      <td className="py-2.5 pr-4 text-xs font-semibold text-gray-700">{fmt(e.quantityKg)} kg</td>
                      <td className="py-2.5 pr-4">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${pcfg.bg} ${pcfg.text}`}>
                          {e.priority ?? "normal"}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4">
                        {e.deadline ? (
                          <span className={`text-xs font-medium ${isOverdue ? "text-red-600 font-bold" : "text-gray-600"}`}>
                            {new Date(e.deadline).toLocaleDateString("fr-FR")}
                            {isOverdue && " ⚠"}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="py-2.5">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${ecfg.bg} ${ecfg.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${ecfg.dot}`} />
                          {ecfg.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={Plane} text="Aucune commande export" />
        )}
      </div>

      {/* ── Governance quick actions + HR summary ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        {/* Quick Governance Actions */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Lock className="w-4 h-4 text-gray-600" />
            <h3 className="text-sm font-bold text-gray-800">Accès Administrateur</h3>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Utilisateurs ERP",    icon: Shield,    href: "/admin/users",          color: "border-gray-200 text-gray-700 hover:bg-gray-50" },
              { label: "Config. ERP",          icon: Building2, href: "/settings/platform",    color: "border-blue-200 text-blue-700 hover:bg-blue-50" },
              { label: "Config. Société",      icon: Building2, href: "/settings/company",     color: "border-indigo-200 text-indigo-700 hover:bg-indigo-50" },
              { label: "Journal comptable",    icon: BookOpen,  href: "/accounting",           color: "border-violet-200 text-violet-700 hover:bg-violet-50" },
              { label: "Factures",             icon: FileText,  href: "/accounting/invoices",  color: "border-emerald-200 text-emerald-700 hover:bg-emerald-50" },
              { label: "Lots à risque",        icon: AlertTriangle, href: "/logistics/risk",   color: "border-red-200 text-red-700 hover:bg-red-50" },
              { label: "Planning export",      icon: Plane,     href: "/logistics/planning",   color: "border-amber-200 text-amber-700 hover:bg-amber-50" },
              { label: "Dashboard financier",  icon: BarChart2, href: "/accounting/finance",   color: "border-teal-200 text-teal-700 hover:bg-teal-50" },
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

        {/* HR + Accounting summary */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-bold text-gray-800 mb-4">Synthèse RH & Finances</h3>
          <div className="space-y-3">
            {[
              { label: "Employés présents",     value: (data.activeEmployees ?? 0) - (data.pendingLeaves ?? 0),   color: "text-emerald-700", bg: "bg-emerald-50" },
              { label: "Congés en attente",      value: data.pendingLeaves ?? 0,      color: "text-violet-700",  bg: "bg-violet-50" },
              { label: "Demandes RH",            value: data.pendingRequests ?? 0,    color: "text-pink-700",    bg: "bg-pink-50" },
              { label: "Factures à payer",       value: data.pendingInvoices ?? 0,    color: "text-blue-700",    bg: "bg-blue-50" },
              { label: "Transactions à pointer", value: data.unmatchedBankTransactions ?? 0, color: "text-orange-700", bg: "bg-orange-50" },
              { label: "Lots à risque",          value: (data.highRiskLots ?? 0) + (data.mediumRiskLots ?? 0), color: "text-red-700", bg: "bg-red-50" },
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <span className="text-sm text-gray-600">{item.label}</span>
                <span className={`text-lg font-bold px-3 py-0.5 rounded-lg ${item.bg} ${item.color}`}>{item.value}</span>
              </div>
            ))}
          </div>

          {/* Résultat footer */}
          <div className="mt-4 pt-4 border-t border-gray-100 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-600">Résultat net cumulé</span>
              <span className={`text-xl font-bold ${data.resultat >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                {fmtM(data.resultat ?? 0)} MGA
              </span>
            </div>
            <div className="flex gap-4 mt-1">
              <span className="text-xs text-gray-400">Rev. {fmtM(data.revenue ?? 0)} MGA</span>
              <span className="text-xs text-gray-400">Ch. {fmtM(data.charges ?? 0)} MGA</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
