import React, { useState, useMemo } from "react";
import { useQuery }    from "@tanstack/react-query";
import { format }      from "date-fns";
import { fr }          from "date-fns/locale";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, Tooltip, Legend,
  XAxis, YAxis, CartesianGrid, ResponsiveContainer,
} from "recharts";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Label }    from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  TrendingUp, TrendingDown, DollarSign, Wallet, Users, Building2,
  AlertTriangle, Info, X, Download, RefreshCw, Package,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Kpis {
  revenue: number; expenses: number; netResult: number;
  cashBalance: number; receivables: number; payables: number;
  stockValue: number; grossMarginPct: number; currency: string;
}
interface MonthPoint  { month: string; revenue: number; expenses: number; }
interface CashPoint   { month: string; cashFlow: number; }
interface PieItem     { name: string; value: number; code: string; }
interface StatLine    { code: string; name: string; amount: number; }
interface BilanLine   { label: string; code: string; amount: number; }
interface LotRow {
  code: string; grade: string; status: string;
  weightInitial: number; weightCurrent: number;
  totalCost: number; purchaseCost: number; processCost: number;
}
interface Alert { level: "danger" | "warning" | "info"; message: string; }

interface DashboardData {
  kpis:             Kpis;
  chartMonthly:     MonthPoint[];
  chartCashFlow:    CashPoint[];
  expenseBreakdown: PieItem[];
  incomeStatement:  { produits: StatLine[]; charges: StatLine[]; totalProduits: number; totalCharges: number; result: number };
  balanceSheet:     { actif: BilanLine[]; passif: BilanLine[]; totalActif: number; totalPassif: number };
  lotAnalysis:      LotRow[];
  alerts:           Alert[];
  period:           { dateFrom: string | null; dateTo: string | null };
}

// ── Palette ───────────────────────────────────────────────────────────────────
const PIE_COLORS = ["#16a34a","#2563eb","#dc2626","#d97706","#7c3aed","#0891b2","#be185d","#65a30d"];
const LOT_STATUS_LABEL: Record<string, string> = {
  raw:"Brut", curing:"Affinage", drying:"Séchage", ready:"Prêt", sold:"Vendu",
};

// ── Formatters ────────────────────────────────────────────────────────────────
function fmtCur(n: number, currency: string, short = false): string {
  if (!isFinite(n)) return "—";
  const decimals = currency === "MGA" ? 0 : 2;
  const f = n.toLocaleString("fr-FR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  if (short) {
    const abs = Math.abs(n);
    if (currency === "MGA") {
      if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} M`;
      if (abs >= 1_000)     return `${(n / 1_000).toFixed(0)} K`;
    }
    return `${n.toFixed(2)}`;
  }
  return `${f} ${currency}`;
}

function fmtPct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)} %`;
}

// ── KPI Card ─────────────────────────────────────────────────────────────────
interface KpiCardProps {
  label: string; value: string; sub?: string;
  positive?: boolean | null; icon: React.ReactNode; gradient: string;
}
function KpiCard({ label, value, sub, positive, icon, gradient }: KpiCardProps) {
  const textColor = positive === true ? "text-emerald-700" : positive === false ? "text-red-600" : "text-foreground";
  return (
    <div className={`rounded-2xl p-5 shadow-sm border border-white/60 ${gradient} relative overflow-hidden`}>
      <div className="absolute -right-3 -top-3 opacity-10 scale-150">{icon}</div>
      <p className="text-[11px] font-semibold uppercase tracking-widest text-white/80 mb-1">{label}</p>
      <p className={`text-2xl font-bold font-mono ${textColor} text-white`}>{value}</p>
      {sub && <p className="text-[11px] text-white/70 mt-1">{sub}</p>}
    </div>
  );
}

// ── Alert banner ─────────────────────────────────────────────────────────────
function AlertBanner({ alert }: { alert: Alert }) {
  const styles = {
    danger:  "bg-red-50 border-red-200 text-red-800",
    warning: "bg-amber-50 border-amber-200 text-amber-800",
    info:    "bg-blue-50 border-blue-200 text-blue-800",
  };
  const icons = { danger: <AlertTriangle className="w-4 h-4 shrink-0" />, warning: <AlertTriangle className="w-4 h-4 shrink-0" />, info: <Info className="w-4 h-4 shrink-0" /> };
  return (
    <div className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-xs font-medium ${styles[alert.level]}`}>
      {icons[alert.level]}{alert.message}
    </div>
  );
}

// ── Custom tooltip ────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label, currency }: { active?: boolean; payload?: {name:string;value:number;color:string}[]; label?: string; currency: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white rounded-xl shadow-lg border p-3 text-xs min-w-[140px]">
      <p className="font-semibold text-foreground mb-2">{label}</p>
      {payload.map(p => (
        <div key={p.name} className="flex justify-between gap-4 mb-1">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-mono font-medium">{fmtCur(p.value, currency, true)}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function FinancialDashboard() {
  const currentYear = new Date().getFullYear();
  const [dateFrom, setDateFrom] = useState(`${currentYear}-01-01`);
  const [dateTo,   setDateTo]   = useState(`${currentYear}-12-31`);
  const [currency, setCurrency] = useState("MGA");
  const [filters,  setFilters]  = useState({ dateFrom: `${currentYear}-01-01`, dateTo: `${currentYear}-12-31`, currency: "MGA" });

  const { data, isLoading, refetch, isFetching } = useQuery<DashboardData>({
    queryKey: ["finance-dashboard", filters.dateFrom, filters.dateTo, filters.currency],
    queryFn:  () => {
      const p = new URLSearchParams();
      if (filters.dateFrom) p.set("dateFrom", filters.dateFrom);
      if (filters.dateTo)   p.set("dateTo",   filters.dateTo);
      p.set("currency", filters.currency);
      return fetch(`/api/finance/dashboard?${p}`).then(r => r.json());
    },
    staleTime: 60_000,
  });

  function applyFilters() {
    setFilters({ dateFrom, dateTo, currency });
  }

  const kpis     = data?.kpis;
  const cur      = kpis?.currency ?? currency;
  const isProfit = (kpis?.netResult ?? 0) >= 0;

  // Income statement sub-totals
  const chargesByFamily = useMemo(() => {
    const groups: Record<string, { label: string; amount: number }> = {};
    for (const c of data?.incomeStatement.charges ?? []) {
      const fam = c.code.slice(0, 2);
      if (!groups[fam]) groups[fam] = { label: `Compte ${fam}x`, amount: 0 };
      groups[fam].amount += c.amount;
    }
    return Object.values(groups).sort((a, b) => a.label.localeCompare(b.label));
  }, [data]);

  if (isLoading) return (
    <div className="p-8 flex items-center justify-center min-h-[60vh]">
      <div className="text-center space-y-3">
        <RefreshCw className="w-8 h-8 text-primary animate-spin mx-auto" />
        <p className="text-sm text-muted-foreground">Calcul des indicateurs financiers…</p>
      </div>
    </div>
  );

  return (
    <div className="p-6 space-y-6 bg-gray-50/50 min-h-screen">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3 justify-between items-end">
        <div>
          <h2 className="text-3xl font-serif text-primary tracking-tight">Dashboard Financier</h2>
          <p className="text-muted-foreground mt-1 text-sm">PCG 2005 Madagascar · temps réel</p>
        </div>
        <div className="flex gap-2 flex-wrap items-end">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Du</Label>
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-8 text-xs w-36" />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Au</Label>
            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-8 text-xs w-36" />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Devise</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger className="h-8 text-xs w-24"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MGA">MGA</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="EUR">EUR</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" className="h-8 gap-1.5" onClick={applyFilters} disabled={isFetching}>
            {isFetching ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Actualiser
          </Button>
          <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => {
            const p = new URLSearchParams({ dateFrom: filters.dateFrom, dateTo: filters.dateTo, currency: filters.currency });
            window.open(`/api/journal/export/excel?${p}`, "_blank");
          }}>
            <Download className="w-3.5 h-3.5" /> Export
          </Button>
        </div>
      </div>

      {/* ── Alerts ─────────────────────────────────────────────────────────── */}
      {data?.alerts && data.alerts.length > 0 && (
        <div className="space-y-2">
          {data.alerts.map((a, i) => <AlertBanner key={i} alert={a} />)}
        </div>
      )}

      {/* ── KPI Cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <KpiCard
          label="Chiffre d'affaires"
          value={fmtCur(kpis?.revenue ?? 0, cur, true)}
          sub={cur !== "MGA" ? `≈ ${fmtCur((kpis?.revenue ?? 0) * 4500, "MGA", true)}` : undefined}
          icon={<TrendingUp className="w-12 h-12" />}
          gradient="bg-gradient-to-br from-emerald-600 to-emerald-800"
        />
        <KpiCard
          label="Résultat net"
          value={fmtCur(kpis?.netResult ?? 0, cur, true)}
          sub={fmtPct(kpis?.grossMarginPct ?? 0)}
          positive={isProfit}
          icon={isProfit ? <TrendingUp className="w-12 h-12" /> : <TrendingDown className="w-12 h-12" />}
          gradient={isProfit ? "bg-gradient-to-br from-blue-600 to-blue-800" : "bg-gradient-to-br from-red-600 to-red-800"}
        />
        <KpiCard
          label="Trésorerie"
          value={fmtCur(kpis?.cashBalance ?? 0, cur, true)}
          icon={<Wallet className="w-12 h-12" />}
          positive={(kpis?.cashBalance ?? 0) > 0}
          gradient="bg-gradient-to-br from-indigo-600 to-indigo-800"
        />
        <KpiCard
          label="Marge brute"
          value={fmtPct(kpis?.grossMarginPct ?? 0)}
          icon={<DollarSign className="w-12 h-12" />}
          positive={(kpis?.grossMarginPct ?? 0) >= 10}
          gradient="bg-gradient-to-br from-violet-600 to-violet-800"
        />
        <KpiCard
          label="Créances clients"
          value={fmtCur(kpis?.receivables ?? 0, cur, true)}
          icon={<Users className="w-12 h-12" />}
          gradient="bg-gradient-to-br from-cyan-600 to-cyan-800"
        />
        <KpiCard
          label="Dettes fournisseurs"
          value={fmtCur(kpis?.payables ?? 0, cur, true)}
          icon={<Building2 className="w-12 h-12" />}
          gradient="bg-gradient-to-br from-rose-600 to-rose-800"
        />
      </div>

      {/* ── Charts row 1: CA + Charges vs Produits ──────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* CA Evolution */}
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-semibold">Évolution du Chiffre d'Affaires</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={data?.chartMonthly ?? []} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => fmtCur(v, cur, true)} width={60} />
                <Tooltip content={<ChartTooltip currency={cur} />} />
                <Line type="monotone" dataKey="revenue" name="CA" stroke="#16a34a" strokeWidth={2.5} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="expenses" name="Charges" stroke="#dc2626" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="4 2" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Charges vs Produits bar */}
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-semibold">Charges vs Produits par Mois</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data?.chartMonthly ?? []} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => fmtCur(v, cur, true)} width={60} />
                <Tooltip content={<ChartTooltip currency={cur} />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="revenue"  name="Produits" fill="#16a34a" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expenses" name="Charges"  fill="#dc2626" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* ── Charts row 2: Pie + Cash Flow ──────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Expense breakdown pie */}
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-semibold">Répartition des Charges (comptes 6x)</CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            {(data?.expenseBreakdown?.length ?? 0) === 0 ? (
              <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">
                Aucune charge enregistrée sur la période
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={data?.expenseBreakdown}
                    cx="50%" cy="50%"
                    innerRadius={55} outerRadius={90}
                    paddingAngle={3}
                    dataKey="value"
                    nameKey="name"
                    label={({ name, percent }) => `${(percent * 100).toFixed(0)} %`}
                    labelLine={false}
                  >
                    {data?.expenseBreakdown.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => fmtCur(v, cur)} />
                  <Legend wrapperStyle={{ fontSize: 10 }} formatter={(v: string) => v.length > 28 ? v.slice(0, 28) + "…" : v} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Cash flow */}
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-semibold">Cash Flow Cumulé</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={data?.chartCashFlow ?? []} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => fmtCur(v, cur, true)} width={60} />
                <Tooltip content={<ChartTooltip currency={cur} />} />
                <Line type="monotone" dataKey="cashFlow" name="Cash Flow" stroke="#7c3aed" strokeWidth={2.5} dot={{ r: 4 }} fill="#7c3aed22" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* ── Compte de résultat + Bilan ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Compte de résultat */}
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-semibold">Compte de Résultat</CardTitle>
            <p className="text-[11px] text-muted-foreground">PCG 2005 · période sélectionnée</p>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            {/* Produits */}
            <div className="mb-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 mb-1.5">PRODUITS (7x)</p>
              {(data?.incomeStatement.produits ?? []).length === 0
                ? <p className="text-xs text-muted-foreground italic">Aucun produit</p>
                : (data?.incomeStatement.produits ?? []).map(r => (
                  <div key={r.code} className="flex justify-between py-0.5 text-xs">
                    <span className="text-muted-foreground"><span className="font-mono">{r.code}</span> {r.name}</span>
                    <span className="font-mono font-medium text-emerald-700">{fmtCur(r.amount, cur, true)}</span>
                  </div>
                ))}
              <div className="flex justify-between border-t pt-1 mt-1 text-xs font-semibold">
                <span>Total Produits</span>
                <span className="font-mono text-emerald-700">{fmtCur(data?.incomeStatement.totalProduits ?? 0, cur)}</span>
              </div>
            </div>
            {/* Charges */}
            <div className="mb-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-red-700 mb-1.5">CHARGES (6x)</p>
              {chargesByFamily.length === 0
                ? <p className="text-xs text-muted-foreground italic">Aucune charge</p>
                : chargesByFamily.map(r => (
                  <div key={r.label} className="flex justify-between py-0.5 text-xs">
                    <span className="text-muted-foreground">{r.label}</span>
                    <span className="font-mono font-medium text-red-700">{fmtCur(r.amount, cur, true)}</span>
                  </div>
                ))}
              <div className="flex justify-between border-t pt-1 mt-1 text-xs font-semibold">
                <span>Total Charges</span>
                <span className="font-mono text-red-700">{fmtCur(data?.incomeStatement.totalCharges ?? 0, cur)}</span>
              </div>
            </div>
            {/* Résultat */}
            <div className={`flex justify-between rounded-xl px-3 py-2.5 text-sm font-bold ${(data?.incomeStatement.result ?? 0) >= 0 ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-red-50 text-red-800 border border-red-200"}`}>
              <span>Résultat de l'exercice</span>
              <span className="font-mono">{fmtCur(data?.incomeStatement.result ?? 0, cur)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Bilan simplifié */}
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-semibold">Bilan Simplifié</CardTitle>
            <p className="text-[11px] text-muted-foreground">PCG 2005 · cumulatif</p>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <div className="grid grid-cols-2 gap-4">
              {/* ACTIF */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700 mb-2">ACTIF</p>
                {(data?.balanceSheet.actif ?? []).map(r => (
                  <div key={r.code} className="flex justify-between py-0.5 text-xs">
                    <span className="text-muted-foreground truncate" title={r.label}>{r.label}</span>
                    <span className="font-mono ml-2 shrink-0">{fmtCur(r.amount, cur, true)}</span>
                  </div>
                ))}
                <div className="flex justify-between border-t pt-1 mt-1 text-xs font-semibold text-blue-700">
                  <span>Total Actif</span>
                  <span className="font-mono">{fmtCur(data?.balanceSheet.totalActif ?? 0, cur, true)}</span>
                </div>
              </div>
              {/* PASSIF */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-rose-700 mb-2">PASSIF</p>
                {(data?.balanceSheet.passif ?? []).map(r => (
                  <div key={r.code} className="flex justify-between py-0.5 text-xs">
                    <span className="text-muted-foreground truncate" title={r.label}>{r.label}</span>
                    <span className="font-mono ml-2 shrink-0">{fmtCur(r.amount, cur, true)}</span>
                  </div>
                ))}
                <div className="flex justify-between border-t pt-1 mt-1 text-xs font-semibold text-rose-700">
                  <span>Total Passif</span>
                  <span className="font-mono">{fmtCur(data?.balanceSheet.totalPassif ?? 0, cur, true)}</span>
                </div>
              </div>
            </div>
            {/* Equilibre indicator */}
            {data && (
              <div className={`mt-3 rounded-lg px-3 py-2 text-xs font-medium flex justify-between ${Math.abs((data.balanceSheet.totalActif ?? 0) - (data.balanceSheet.totalPassif ?? 0)) < 1 ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-amber-50 text-amber-700 border border-amber-200"}`}>
                <span>Équilibre</span>
                <span className="font-mono">{Math.abs((data.balanceSheet.totalActif ?? 0) - (data.balanceSheet.totalPassif ?? 0)) < 1 ? "✔ Équilibré" : `Écart : ${fmtCur(Math.abs(data.balanceSheet.totalActif - data.balanceSheet.totalPassif), cur, true)}`}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Lot analysis ──────────────────────────────────────────────────── */}
      {(data?.lotAnalysis.length ?? 0) > 0 && (
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-2 pt-4 px-5 flex flex-row items-center gap-2">
            <Package className="w-4 h-4 text-primary" />
            <CardTitle className="text-sm font-semibold">Analyse Coûts par Lot Vanille</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/50 border-b">
                    {["Code Lot", "Grade", "Statut", "Poids init. (kg)", "Poids actuel (kg)", "Coût Achat", "Coût Process.", "Coût Transport", "Coût Total"].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left font-semibold text-[10px] uppercase tracking-wide text-muted-foreground whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data?.lotAnalysis.map((lot, i) => (
                    <tr key={lot.code} className={`border-b hover:bg-muted/20 ${i % 2 === 0 ? "" : "bg-muted/10"}`}>
                      <td className="px-4 py-2 font-mono font-medium">{lot.code}</td>
                      <td className="px-4 py-2">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">{lot.grade ?? "—"}</span>
                      </td>
                      <td className="px-4 py-2">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">{LOT_STATUS_LABEL[lot.status] ?? lot.status}</span>
                      </td>
                      <td className="px-4 py-2 text-right font-mono">{lot.weightInitial?.toFixed(1)}</td>
                      <td className="px-4 py-2 text-right font-mono">{lot.weightCurrent?.toFixed(1)}</td>
                      <td className="px-4 py-2 text-right font-mono text-blue-700">{lot.purchaseCost > 0 ? fmtCur(lot.purchaseCost, cur, true) : "—"}</td>
                      <td className="px-4 py-2 text-right font-mono text-violet-700">{lot.processCost > 0 ? fmtCur(lot.processCost, cur, true) : "—"}</td>
                      <td className="px-4 py-2 text-right font-mono text-orange-700">{lot.transportCost > 0 ? fmtCur((lot as LotRow & { transportCost: number }).transportCost, cur, true) : "—"}</td>
                      <td className="px-4 py-2 text-right font-mono font-semibold">{lot.totalCost > 0 ? fmtCur(lot.totalCost, cur, true) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <p className="text-center text-[10px] text-muted-foreground pb-2">
        Dashboard Financier — Vanilla Madagascar ERP · PCG 2005 · Généré le {format(new Date(), "dd MMMM yyyy HH:mm", { locale: fr })}
        {filters.dateFrom && ` · Période : ${filters.dateFrom} → ${filters.dateTo}`}
      </p>
    </div>
  );
}
