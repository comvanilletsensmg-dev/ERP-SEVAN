import { useState } from "react";
import { Link } from "wouter";
import {
  Package, TrendingUp, Users, Banknote, Warehouse, BarChart2, UserCheck,
  Clock, AlertTriangle, CheckCircle2, ShoppingCart, FileText, Plane, Leaf,
  Activity, Plus, Building2, CreditCard, Truck, ChevronRight, Zap,
  RefreshCw, Globe, Shield, BookOpen, Calendar, ArrowUpRight,
} from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line,
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────
interface LogisticsData {
  totalStockKg: number; totalSalesUsd: number; totalPurchasesMga: number;
  activeLotsCount: number; suppliersCount: number; clientsCount: number;
  lotStatusBreakdown: { status: string; count: number; totalKg: number }[];
  highRiskLots: number; mediumRiskLots: number; highHumidityLots: number;
  pendingPurchases: number; activeExportOrders: number;
  exportOrdersByStatus: { status: string; count: number }[];
  monthlyPurchasesTrend: { label: string; total: number; nb: number }[];
}
interface HrData {
  totalEmployees: number; activeEmployees: number; absentToday: number;
  pendingLeaves: number; pendingRequests: number;
  totalSalariesMga: number; totalBonusesMga: number;
}
interface AccountingData {
  revenue: number; charges: number; resultat: number; bankBalance: number;
  pendingInvoices: number; totalValidatedTTC: number; unmatchedBankTransactions: number;
}
interface SuperAdminData {
  logistics?: LogisticsData; hr?: HrData; accounting?: AccountingData;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) => new Intl.NumberFormat("fr-MG", { maximumFractionDigits: 0 }).format(n ?? 0);
const fmtM = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} M` : n >= 1_000 ? `${(n / 1_000).toFixed(0)} K` : String(Math.round(n));

const LOT_COLORS: Record<string, string> = { raw: "#6366f1", curing: "#f59e0b", drying: "#f97316", ready: "#22c55e", sold: "#94a3b8" };
const LOT_FR: Record<string, string> = { raw: "Brut", curing: "Maturation", drying: "Séchage", ready: "Prêt", sold: "Vendu" };
const EXPORT_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  pending:    { bg: "bg-amber-100",   text: "text-amber-700",   label: "En attente" },
  preparing:  { bg: "bg-blue-100",    text: "text-blue-700",    label: "Préparation" },
  shipped:    { bg: "bg-emerald-100", text: "text-emerald-700", label: "Expédié" },
  delivered:  { bg: "bg-gray-100",    text: "text-gray-600",    label: "Livré" },
};

// ─── Sub-components ───────────────────────────────────────────────────────────
function KpiCard({
  label, value, sub, icon: Icon, iconBg, iconColor, accent, href,
}: { label: string; value: string | number; sub?: string; icon: any; iconBg: string; iconColor: string; accent?: string; href?: string }) {
  const inner = (
    <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-3 hover:shadow-md transition-shadow ${href ? "cursor-pointer" : ""}`}>
      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconBg}`}>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
        {href && <ChevronRight className="w-4 h-4 text-gray-300" />}
      </div>
      <div>
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
        <p className={`text-2xl font-bold ${accent ?? "text-gray-900"}`}>{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function AlertBadge({ count, label, color, icon: Icon }: { count: number; label: string; color: string; icon: any }) {
  if (count === 0) return null;
  return (
    <div className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border ${color} text-sm font-medium`}>
      <Icon className="w-4 h-4 flex-shrink-0" />
      <span className="font-bold">{count}</span>
      <span className="opacity-80">{label}</span>
    </div>
  );
}

function WorkflowCard({ label, count, icon: Icon, href, color }: { label: string; count: number; icon: any; href: string; color: string }) {
  return (
    <Link href={href}>
      <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-center justify-between hover:shadow-md transition-all hover:-translate-y-0.5 cursor-pointer">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`}>
            <Icon className="w-4 h-4" />
          </div>
          <span className="text-sm font-medium text-gray-700">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-lg font-bold ${count > 0 ? "text-orange-600" : "text-gray-400"}`}>{count}</span>
          <ArrowUpRight className="w-3.5 h-3.5 text-gray-300" />
        </div>
      </div>
    </Link>
  );
}

function QuickAction({ label, icon: Icon, href, color }: { label: string; icon: any; href: string; color: string }) {
  return (
    <Link href={href}>
      <div className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 border-dashed cursor-pointer transition-all hover:border-solid hover:shadow-sm ${color}`}>
        <Icon className="w-5 h-5" />
        <span className="text-xs font-semibold text-center leading-tight">{label}</span>
      </div>
    </Link>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function SuperAdminDashboard({ data }: { data: SuperAdminData }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const { logistics: l, hr, accounting: a } = data;

  if (!l || !hr || !a) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-gray-400">
        <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm">Chargement du centre de pilotage…</p>
      </div>
    );
  }

  // Alert count
  const totalAlerts = l.highRiskLots + l.mediumRiskLots + l.highHumidityLots + a.unmatchedBankTransactions;

  // Financial chart
  const financialData = [
    { name: "Revenus", value: Math.round(a.revenue / 1_000_000), fill: "#22c55e" },
    { name: "Charges", value: Math.round(a.charges / 1_000_000), fill: "#f97316" },
    { name: "Résultat", value: Math.round(Math.max(a.resultat, 0) / 1_000_000), fill: "#6366f1" },
  ];

  // Lot breakdown data
  const lotPieData = l.lotStatusBreakdown
    .filter(r => r.totalKg > 0)
    .map(r => ({ name: LOT_FR[r.status] ?? r.status, value: r.totalKg, fill: LOT_COLORS[r.status] ?? "#94a3b8" }));

  // Monthly trend (fill with placeholder if empty)
  const trendData = l.monthlyPurchasesTrend.length > 0 ? l.monthlyPurchasesTrend : [];

  const now = new Date();
  const dateStr = now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
            <Calendar className="w-3.5 h-3.5" />
            <span className="capitalize">{dateStr}</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Centre de pilotage ERP</h1>
          <p className="text-sm text-gray-500 mt-0.5">Vue consolidée · Madagascar Vanilla Operations</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setRefreshKey(k => k + 1)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Actualiser
          </button>
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-medium text-emerald-700">
            <Activity className="w-3.5 h-3.5" />
            Système opérationnel
          </div>
        </div>
      </div>

      {/* ── Alert Center (only if alerts) ── */}
      {totalAlerts > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <h2 className="text-sm font-bold text-amber-800">Centre d'alertes — {totalAlerts} point{totalAlerts > 1 ? "s" : ""} d'attention</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <AlertBadge count={l.highRiskLots}              label="lots HIGH risque"       color="bg-red-50 border-red-200 text-red-700"    icon={AlertTriangle} />
            <AlertBadge count={l.mediumRiskLots}            label="lots MEDIUM risque"     color="bg-orange-50 border-orange-200 text-orange-700" icon={AlertTriangle} />
            <AlertBadge count={l.highHumidityLots}          label="lots humidité >38%"     color="bg-amber-50 border-amber-300 text-amber-700" icon={AlertTriangle} />
            <AlertBadge count={a.unmatchedBankTransactions} label="txn. bancaires non rapprochées" color="bg-violet-50 border-violet-200 text-violet-700" icon={CreditCard} />
          </div>
        </div>
      )}

      {/* ── KPI Grid (8 cards) ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label="Stock actif" icon={Leaf} iconBg="bg-emerald-50" iconColor="text-emerald-600"
          value={`${fmt(l.totalStockKg)} kg`}
          sub={`${l.activeLotsCount} lot${l.activeLotsCount > 1 ? "s" : ""} en cours`}
          href="/lots"
        />
        <KpiCard
          label="CA Export" icon={Globe} iconBg="bg-blue-50" iconColor="text-blue-600"
          value={`$${fmtM(l.totalSalesUsd)}`}
          sub={`${l.clientsCount} client${l.clientsCount > 1 ? "s" : ""}`}
          accent="text-blue-700" href="/sales"
        />
        <KpiCard
          label="Trésorerie" icon={Banknote} iconBg="bg-violet-50" iconColor="text-violet-600"
          value={`${fmtM(a.bankBalance)} MGA`}
          sub={a.unmatchedBankTransactions > 0 ? `${a.unmatchedBankTransactions} txn. à rapprocher` : "Tout rapproché"}
          accent={a.bankBalance >= 0 ? "text-gray-900" : "text-red-600"}
          href="/accounting/bank"
        />
        <KpiCard
          label="Résultat net" icon={TrendingUp} iconBg="bg-emerald-50" iconColor="text-emerald-600"
          value={`${fmtM(a.resultat)} MGA`}
          sub={`Rev. ${fmtM(a.revenue)} · Ch. ${fmtM(a.charges)}`}
          accent={a.resultat >= 0 ? "text-emerald-700" : "text-red-600"}
          href="/accounting"
        />
        <KpiCard
          label="Employés actifs" icon={UserCheck} iconBg="bg-sky-50" iconColor="text-sky-600"
          value={hr.activeEmployees}
          sub={`${hr.absentToday} absent${hr.absentToday > 1 ? "s" : ""} auj.`}
          href="/hr/employees"
        />
        <KpiCard
          label="Masse salariale" icon={BarChart2} iconBg="bg-pink-50" iconColor="text-pink-600"
          value={`${fmtM(hr.totalSalariesMga)} MGA`}
          sub="mois courant"
          href="/hr/payroll"
        />
        <KpiCard
          label="Fournisseurs" icon={Warehouse} iconBg="bg-amber-50" iconColor="text-amber-600"
          value={l.suppliersCount}
          sub={`${l.pendingPurchases} achat${l.pendingPurchases > 1 ? "s" : ""} en attente`}
          href="/suppliers"
        />
        <KpiCard
          label="Export actifs" icon={Plane} iconBg="bg-indigo-50" iconColor="text-indigo-600"
          value={l.activeExportOrders}
          sub={`${a.pendingInvoices} facture${a.pendingInvoices > 1 ? "s" : ""} à valider`}
          href="/logistics/planning"
        />
      </div>

      {/* ── Workflows en attente ── */}
      <div>
        <h2 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
          <Zap className="w-4 h-4 text-orange-500" /> Workflows en attente d'action
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <WorkflowCard label="Achats à valider"   count={l.pendingPurchases}   icon={ShoppingCart} href="/purchases"          color="bg-emerald-50 text-emerald-600" />
          <WorkflowCard label="Factures à valider" count={a.pendingInvoices}    icon={FileText}     href="/accounting/invoices" color="bg-blue-50 text-blue-600" />
          <WorkflowCard label="Congés en attente"  count={hr.pendingLeaves}     icon={Calendar}     href="/hr/leaves"           color="bg-violet-50 text-violet-600" />
          <WorkflowCard label="Demandes RH"        count={hr.pendingRequests}   icon={Users}        href="/hr/requests"         color="bg-pink-50 text-pink-600" />
        </div>
      </div>

      {/* ── Charts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Lot breakdown donut */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-bold text-gray-800 mb-1">Lots par statut</h3>
          <p className="text-xs text-gray-400 mb-4">{l.activeLotsCount} lots actifs · {fmt(l.totalStockKg)} kg</p>
          {lotPieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={lotPieData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                  innerRadius={50} outerRadius={75}
                  paddingAngle={3}
                >
                  {lotPieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Pie>
                <Tooltip formatter={(v: number) => [`${fmt(v)} kg`]} />
                <Legend formatter={v => v} iconSize={10} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center justify-center h-48 gap-2 text-gray-300">
              <Package className="w-8 h-8" />
              <p className="text-xs">Aucun lot en stock</p>
            </div>
          )}
        </div>

        {/* Financial bar */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-bold text-gray-800 mb-1">Résultats financiers</h3>
          <p className="text-xs text-gray-400 mb-4">En millions MGA · période courante</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={financialData} barSize={32} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}M`} />
              <Tooltip formatter={(v: number) => [`${v.toFixed(1)} M MGA`]} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {financialData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Monthly purchases trend */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-bold text-gray-800 mb-1">Tendance achats</h3>
          <p className="text-xs text-gray-400 mb-4">6 derniers mois · MGA</p>
          {trendData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={trendData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => fmtM(v)} />
                <Tooltip formatter={(v: number) => [`${fmt(v)} MGA`]} />
                <Line type="monotone" dataKey="total" stroke="#059669" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center justify-center h-48 gap-2 text-gray-300">
              <TrendingUp className="w-8 h-8" />
              <p className="text-xs">Aucun achat ce semestre</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Export Logistics + HR Summary ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        {/* Export logistics */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-gray-800">Commandes Export</h3>
              <p className="text-xs text-gray-400">{l.activeExportOrders} commande{l.activeExportOrders > 1 ? "s" : ""} actives</p>
            </div>
            <Link href="/logistics/planning">
              <div className="flex items-center gap-1 text-xs text-emerald-600 font-medium hover:underline cursor-pointer">
                Voir tout <ChevronRight className="w-3.5 h-3.5" />
              </div>
            </Link>
          </div>
          {l.exportOrdersByStatus.length > 0 ? (
            <div className="space-y-2.5">
              {l.exportOrdersByStatus.map(e => {
                const cfg = EXPORT_COLORS[e.status] ?? { bg: "bg-gray-100", text: "text-gray-600", label: e.status };
                const pct = l.activeExportOrders > 0 ? Math.round((e.count / (l.activeExportOrders + (l.exportOrdersByStatus.find(x => x.status === "delivered")?.count ?? 0))) * 100) : 0;
                return (
                  <div key={e.status} className="flex items-center gap-3">
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${cfg.bg} ${cfg.text} w-28 text-center flex-shrink-0`}>{cfg.label}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2">
                      <div className="bg-emerald-500 h-2 rounded-full transition-all" style={{ width: `${Math.max(pct, 5)}%` }} />
                    </div>
                    <span className="text-sm font-bold text-gray-800 w-6 text-right">{e.count}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-gray-300">
              <Plane className="w-8 h-8" />
              <p className="text-xs">Aucune commande export</p>
            </div>
          )}
        </div>

        {/* HR Summary */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-gray-800">Tableau RH</h3>
              <p className="text-xs text-gray-400">{hr.totalEmployees} employés · mois courant</p>
            </div>
            <Link href="/hr/dashboard">
              <div className="flex items-center gap-1 text-xs text-emerald-600 font-medium hover:underline cursor-pointer">
                Dashboard RH <ChevronRight className="w-3.5 h-3.5" />
              </div>
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Présents",         value: hr.activeEmployees - hr.absentToday, color: "bg-emerald-50 text-emerald-700 border-emerald-100", icon: UserCheck },
              { label: "Absents auj.",     value: hr.absentToday,                      color: "bg-orange-50 text-orange-700 border-orange-100",    icon: Clock },
              { label: "Congés att.",      value: hr.pendingLeaves,                    color: "bg-violet-50 text-violet-700 border-violet-100",    icon: Calendar },
              { label: "Demandes RH",      value: hr.pendingRequests,                  color: "bg-pink-50 text-pink-700 border-pink-100",          icon: FileText },
            ].map(item => {
              const Icon = item.icon;
              return (
                <div key={item.label} className={`rounded-xl border p-3 ${item.color}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="w-3.5 h-3.5 opacity-70" />
                    <span className="text-xs font-medium opacity-70">{item.label}</span>
                  </div>
                  <p className="text-2xl font-bold">{item.value}</p>
                </div>
              );
            })}
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
            <span>Masse salariale ce mois</span>
            <span className="font-bold text-gray-800">{fmtM(hr.totalSalariesMga)} MGA</span>
          </div>
        </div>
      </div>

      {/* ── Quick Actions ── */}
      <div>
        <h2 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
          <Plus className="w-4 h-4 text-emerald-500" /> Actions rapides
        </h2>
        <div className="grid grid-cols-4 md:grid-cols-8 gap-3">
          <QuickAction label="Nouvel achat"      icon={ShoppingCart}  href="/purchases"           color="border-emerald-200 text-emerald-600 hover:bg-emerald-50" />
          <QuickAction label="Nouvelle facture"  icon={FileText}      href="/accounting/invoices" color="border-blue-200 text-blue-600 hover:bg-blue-50" />
          <QuickAction label="Nouveau lot"       icon={Leaf}          href="/lots"                color="border-green-200 text-green-600 hover:bg-green-50" />
          <QuickAction label="Nouveau fournisseur" icon={Building2}   href="/suppliers"           color="border-amber-200 text-amber-600 hover:bg-amber-50" />
          <QuickAction label="Nouvel employé"    icon={UserCheck}     href="/hr/employees"        color="border-sky-200 text-sky-600 hover:bg-sky-50" />
          <QuickAction label="Commande export"   icon={Plane}         href="/logistics/planning"  color="border-indigo-200 text-indigo-600 hover:bg-indigo-50" />
          <QuickAction label="Journal comptable" icon={BookOpen}      href="/accounting"          color="border-violet-200 text-violet-600 hover:bg-violet-50" />
          <QuickAction label="Lots à risque"     icon={Shield}        href="/logistics/risk"      color="border-red-200 text-red-600 hover:bg-red-50" />
        </div>
      </div>

      {/* ── Accounting summary footer ── */}
      <div className="bg-gradient-to-r from-emerald-700 to-emerald-900 rounded-2xl p-5 text-white">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-emerald-200 text-xs font-medium uppercase tracking-wider mb-1">Synthèse financière consolidée</p>
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-bold">{fmtM(a.resultat)} MGA</span>
              <span className={`text-sm font-medium px-2 py-0.5 rounded-full ${a.resultat >= 0 ? "bg-emerald-600 text-emerald-100" : "bg-red-500 text-white"}`}>
                {a.resultat >= 0 ? "Bénéfice" : "Déficit"}
              </span>
            </div>
            <p className="text-emerald-300 text-xs mt-1">
              Revenus {fmtM(a.revenue)} MGA · Charges {fmtM(a.charges)} MGA
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-3 text-sm">
              <span className="text-emerald-300 w-32">Trésorerie</span>
              <span className="font-bold">{fmtM(a.bankBalance)} MGA</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-emerald-300 w-32">Factures att.</span>
              <span className="font-bold">{a.pendingInvoices}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-emerald-300 w-32">CA total validé</span>
              <span className="font-bold">{fmtM(a.totalValidatedTTC)} MGA</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
