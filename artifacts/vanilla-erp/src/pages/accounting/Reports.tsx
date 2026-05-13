import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  TrendingUp, TrendingDown, Scale, BookOpen, FileText,
  Receipt, Landmark, Users, Building2, AlertTriangle,
  CheckCircle2, Info, XCircle, Download, Printer,
  ChevronDown, ChevronRight, Search, Filter,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number | undefined | null) =>
  new Intl.NumberFormat("fr-MG", { maximumFractionDigits: 0 }).format(n ?? 0);
const fmtDate = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString("fr-FR") : "—";
const fmtPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

function downloadCSV(rows: Record<string, any>[], filename: string) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    "\ufeff" + headers.join(";"),
    ...rows.map(r => headers.map(h => {
      const v = r[h]; return typeof v === "number" ? String(v) : `"${String(v ?? "").replace(/"/g, '""')}"`;
    }).join(";")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement("a"), { href: url, download: filename }).click();
  URL.revokeObjectURL(url);
}

// ─── Period selector ──────────────────────────────────────────────────────────
const now = new Date();
const PERIODS = [
  {
    label: "Ce mois",
    from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
    to: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10),
  },
  {
    label: "Trimestre",
    from: new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1).toISOString().slice(0, 10),
    to: new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 + 3, 0).toISOString().slice(0, 10),
  },
  {
    label: "Année",
    from: `${now.getFullYear()}-01-01`,
    to: `${now.getFullYear()}-12-31`,
  },
  { label: "Tout", from: "2020-01-01", to: "2030-12-31" },
];

// ─── TABS definition ──────────────────────────────────────────────────────────
const TABS = [
  { id: "income",      label: "Compte de résultat", icon: TrendingUp },
  { id: "balance",     label: "Balance générale",   icon: Scale },
  { id: "ledger",      label: "Grand livre",         icon: BookOpen },
  { id: "journal",     label: "Journal",             icon: FileText },
  { id: "tva",         label: "TVA",                 icon: Receipt },
  { id: "treasury",    label: "Trésorerie",          icon: Landmark },
  { id: "clients",     label: "Clients",             icon: Users },
  { id: "suppliers",   label: "Fournisseurs",        icon: Building2 },
] as const;

type TabId = typeof TABS[number]["id"];

// ─── Main component ───────────────────────────────────────────────────────────
export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<TabId>("income");
  const [period, setPeriod] = useState<{ from: string; to: string }>({ from: PERIODS[2].from, to: PERIODS[2].to });
  const [customPeriod, setCustomPeriod] = useState(false);
  const [ledgerAccount, setLedgerAccount] = useState("");
  const [balanceSearch, setBalanceSearch] = useState("");
  const [journalType, setJournalType] = useState("all");
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);

  const params = new URLSearchParams({ from: period.from, to: period.to });

  // ─ Data fetches ────────────────────────────────────────────────────────────
  const incomeQ  = useQuery({ queryKey: ["reports-income",  period], queryFn: () => fetch(`/api/reports/income?${params}`, { credentials: "include" }).then(r => r.json()) });
  const balanceQ = useQuery({ queryKey: ["reports-balance", period, balanceSearch], queryFn: () => fetch(`/api/reports/balance?${params}&q=${balanceSearch}`, { credentials: "include" }).then(r => r.json()) });
  const tvaQ     = useQuery({ queryKey: ["reports-tva",     period], queryFn: () => fetch(`/api/reports/tva?${params}`, { credentials: "include" }).then(r => r.json()) });
  const treasuryQ = useQuery({ queryKey: ["reports-treasury", period], queryFn: () => fetch(`/api/reports/treasury?${params}`, { credentials: "include" }).then(r => r.json()) });
  const journalQ = useQuery({ queryKey: ["reports-journal", period, journalType], queryFn: () => fetch(`/api/reports/journal?${params}&type=${journalType}`, { credentials: "include" }).then(r => r.json()) });
  const clientsQ = useQuery({ queryKey: ["reports-clients", period], queryFn: () => fetch(`/api/reports/auxiliaire/clients?${params}`, { credentials: "include" }).then(r => r.json()) });
  const suppliersQ = useQuery({ queryKey: ["reports-suppliers", period], queryFn: () => fetch(`/api/reports/auxiliaire/suppliers?${params}`, { credentials: "include" }).then(r => r.json()) });
  const alertsQ  = useQuery({ queryKey: ["reports-alerts"], queryFn: () => fetch("/api/reports/alerts", { credentials: "include" }).then(r => r.json()), staleTime: 30000 });
  const ledgerQ  = useQuery({
    queryKey: ["reports-ledger", ledgerAccount, period],
    enabled: !!ledgerAccount,
    queryFn: () => fetch(`/api/reports/ledger/${ledgerAccount}?${params}`, { credentials: "include" }).then(r => r.json()),
  });

  // ─ Print ──────────────────────────────────────────────────────────────────
  const handlePrint = () => window.print();

  // ─── Alerts banner ───────────────────────────────────────────────────────
  const alerts = alertsQ.data;
  const hasErrors = (alerts?.summary?.errors ?? 0) > 0;

  return (
    <div className="min-h-screen bg-gray-50 print:bg-white">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 print:border-none">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Rapports comptables</h1>
              <p className="text-xs text-gray-400 mt-0.5">PCG 2005 Madagascar · Conforme audit & impôts</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap print:hidden">
              <button onClick={handlePrint}
                className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
                <Printer className="w-3.5 h-3.5"/>Imprimer
              </button>
            </div>
          </div>

          {/* Period filter */}
          <div className="flex items-center gap-2 mt-4 flex-wrap print:hidden">
            <span className="text-xs text-gray-500 font-medium">Période :</span>
            {PERIODS.map(p => (
              <button key={p.label}
                onClick={() => { setPeriod({ from: p.from, to: p.to }); setCustomPeriod(false); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${!customPeriod && period.from === p.from && period.to === p.to ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                {p.label}
              </button>
            ))}
            <button onClick={() => setCustomPeriod(v => !v)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${customPeriod ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              <Filter className="w-3 h-3"/>Personnalisé
            </button>
            {customPeriod && (
              <div className="flex items-center gap-2">
                <input type="date" value={period.from}
                  onChange={e => setPeriod(p => ({ ...p, from: e.target.value }))}
                  className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:ring-2 focus:ring-emerald-500 outline-none"/>
                <span className="text-gray-400 text-xs">→</span>
                <input type="date" value={period.to}
                  onChange={e => setPeriod(p => ({ ...p, to: e.target.value }))}
                  className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:ring-2 focus:ring-emerald-500 outline-none"/>
              </div>
            )}
            <span className="ml-2 text-xs text-gray-400">
              Du {fmtDate(period.from)} au {fmtDate(period.to)}
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-7xl mx-auto px-6 overflow-x-auto print:hidden">
          <div className="flex gap-0 min-w-max border-b border-gray-200">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setActiveTab(id)}
                className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === id ? "border-emerald-500 text-emerald-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
                <Icon className="w-3.5 h-3.5"/>{label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Alerts banner */}
      {alerts && (alerts.summary.errors > 0 || alerts.summary.warnings > 0) && (
        <div className={`border-b px-6 py-3 print:hidden ${hasErrors ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"}`}>
          <div className="max-w-7xl mx-auto flex items-center gap-3 flex-wrap">
            <AlertTriangle className={`w-4 h-4 shrink-0 ${hasErrors ? "text-red-500" : "text-amber-500"}`}/>
            <span className={`text-sm font-medium ${hasErrors ? "text-red-700" : "text-amber-700"}`}>
              {alerts.summary.errors > 0 && `${alerts.summary.errors} erreur(s) comptable(s) · `}
              {alerts.summary.warnings > 0 && `${alerts.summary.warnings} avertissement(s) · `}
              {alerts.summary.infos > 0 && `${alerts.summary.infos} info(s)`}
            </span>
            <div className="flex gap-2 flex-wrap">
              {(alerts.alerts ?? []).slice(0, 3).map((a: any, i: number) => (
                <span key={i} className={`px-2 py-0.5 rounded text-xs ${a.severity === "error" ? "bg-red-100 text-red-700" : a.severity === "warning" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}`}>
                  {a.message}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-6 py-6">

        {/* ──────── COMPTE DE RÉSULTAT ──────── */}
        {activeTab === "income" && (
          <IncomeTab data={incomeQ.data} loading={incomeQ.isLoading} period={period}/>
        )}

        {/* ──────── BALANCE GÉNÉRALE ──────── */}
        {activeTab === "balance" && (
          <BalanceTab
            data={balanceQ.data} loading={balanceQ.isLoading}
            search={balanceSearch} onSearch={setBalanceSearch}
          />
        )}

        {/* ──────── GRAND LIVRE ──────── */}
        {activeTab === "ledger" && (
          <LedgerTab
            data={ledgerQ.data} loading={ledgerQ.isLoading}
            account={ledgerAccount} onAccount={setLedgerAccount}
          />
        )}

        {/* ──────── JOURNAL ──────── */}
        {activeTab === "journal" && (
          <JournalTab
            data={journalQ.data} loading={journalQ.isLoading}
            type={journalType} onType={setJournalType}
            expanded={expandedEntry} onExpand={setExpandedEntry}
          />
        )}

        {/* ──────── TVA ──────── */}
        {activeTab === "tva" && (
          <TVATab data={tvaQ.data} loading={tvaQ.isLoading}/>
        )}

        {/* ──────── TRÉSORERIE ──────── */}
        {activeTab === "treasury" && (
          <TreasuryTab data={treasuryQ.data} loading={treasuryQ.isLoading}/>
        )}

        {/* ──────── CLIENTS ──────── */}
        {activeTab === "clients" && (
          <AuxiliaryTab data={clientsQ.data} loading={clientsQ.isLoading} type="clients"/>
        )}

        {/* ──────── FOURNISSEURS ──────── */}
        {activeTab === "suppliers" && (
          <AuxiliaryTab data={suppliersQ.data} loading={suppliersQ.isLoading} type="suppliers"/>
        )}
      </div>
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────
function Loading() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"/>
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KPI({ label, value, sub, cls, bg }: { label: string; value: string; sub?: string; cls: string; bg: string }) {
  return (
    <div className={`rounded-xl border p-4 ${bg}`}>
      <p className={`text-xl font-bold ${cls}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
      {sub && <p className={`text-xs mt-1 font-medium ${cls}`}>{sub}</p>}
    </div>
  );
}

// ─── Section: Compte de résultat ──────────────────────────────────────────────
function IncomeTab({ data, loading, period }: { data: any; loading: boolean; period: any }) {
  if (loading) return <Loading/>;
  if (!data) return null;

  const { revenues = [], charges = [], totalRevenue, totalCharges, resultat, margeNette, monthlyChart = [] } = data;

  const exportData = [
    ...revenues.map((r: any) => ({ type: "Produit", code: r.code, libelle: r.name, montant: r.amount })),
    ...charges.map((c: any) => ({ type: "Charge", code: c.code, libelle: c.name, montant: c.amount })),
    { type: "TOTAL", code: "", libelle: "Résultat net", montant: resultat },
  ];

  return (
    <div className="space-y-6 print:space-y-4">
      {/* Print header */}
      <div className="hidden print:block mb-4">
        <h2 className="text-xl font-bold">Compte de résultat</h2>
        <p className="text-sm text-gray-500">Du {new Date(period.from).toLocaleDateString("fr-FR")} au {new Date(period.to).toLocaleDateString("fr-FR")}</p>
      </div>

      <div className="flex items-center justify-between print:hidden">
        <h2 className="text-base font-bold text-gray-800">Compte de résultat</h2>
        <button onClick={() => downloadCSV(exportData, "compte-de-resultat.csv")}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-600 hover:bg-gray-50">
          <Download className="w-3.5 h-3.5"/>Export CSV
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPI label="Chiffre d'affaires" value={fmt(totalRevenue) + " Ar"} cls="text-emerald-700" bg="bg-emerald-50 border-emerald-200"/>
        <KPI label="Charges totales" value={fmt(totalCharges) + " Ar"} cls="text-red-600" bg="bg-red-50 border-red-200"/>
        <KPI label="Résultat net" value={fmt(resultat) + " Ar"}
          cls={resultat >= 0 ? "text-emerald-800 font-bold" : "text-red-700 font-bold"}
          bg={resultat >= 0 ? "bg-emerald-100 border-emerald-200" : "bg-red-100 border-red-200"}/>
        <KPI label="Marge nette" value={fmtPct(margeNette)}
          cls={margeNette >= 0 ? "text-blue-700" : "text-red-600"} bg="bg-blue-50 border-blue-200"/>
      </div>

      {/* Monthly chart */}
      {monthlyChart.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 print:hidden">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Évolution mensuelle</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthlyChart} margin={{ top: 0, right: 10, bottom: 0, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
              <XAxis dataKey="month" tick={{ fontSize: 11 }}/>
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => (v / 1000000).toFixed(1) + "M"}/>
              <Tooltip formatter={(v: number) => fmt(v) + " Ar"} labelStyle={{ fontWeight: "bold" }}/>
              <Legend/>
              <Bar dataKey="revenues" name="Produits" fill="#10b981" radius={[3,3,0,0]}/>
              <Bar dataKey="charges" name="Charges" fill="#ef4444" radius={[3,3,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Produits / Charges tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Produits */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-600"/>Produits (comptes 7xx)
          </h3>
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Compte</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Libellé</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">Montant</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {revenues.length === 0
                  ? <tr><td colSpan={3} className="text-center py-8 text-gray-300 text-xs">Aucun produit</td></tr>
                  : revenues.map((r: any) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-mono text-xs font-bold text-gray-500">{r.code}</td>
                      <td className="px-4 py-2.5 text-gray-700">{r.name}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-sm font-semibold text-emerald-700">{fmt(r.amount)}</td>
                    </tr>
                  ))}
              </tbody>
              <tfoot className="bg-emerald-50 border-t-2 border-emerald-200">
                <tr>
                  <td colSpan={2} className="px-4 py-2.5 text-xs font-bold text-emerald-800 uppercase">Total produits</td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-emerald-800">{fmt(totalRevenue)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Charges */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
            <TrendingDown className="w-3.5 h-3.5 text-red-500"/>Charges (comptes 6xx)
          </h3>
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Compte</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Libellé</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">Montant</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {charges.length === 0
                  ? <tr><td colSpan={3} className="text-center py-8 text-gray-300 text-xs">Aucune charge</td></tr>
                  : charges.map((c: any) => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-mono text-xs font-bold text-gray-500">{c.code}</td>
                      <td className="px-4 py-2.5 text-gray-700">{c.name}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-sm font-semibold text-red-600">{fmt(c.amount)}</td>
                    </tr>
                  ))}
              </tbody>
              <tfoot className="bg-red-50 border-t-2 border-red-200">
                <tr>
                  <td colSpan={2} className="px-4 py-2.5 text-xs font-bold text-red-800 uppercase">Total charges</td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-red-800">{fmt(totalCharges)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      {/* Résultat final */}
      <div className={`rounded-xl border-2 p-4 flex items-center justify-between ${resultat >= 0 ? "bg-emerald-50 border-emerald-300" : "bg-red-50 border-red-300"}`}>
        <div>
          <p className="text-sm font-bold text-gray-700">RÉSULTAT NET DE LA PÉRIODE</p>
          <p className="text-xs text-gray-400 mt-0.5">{totalRevenue > 0 ? "Bénéfice" : "Perte"} · Marge nette {fmtPct(margeNette)}</p>
        </div>
        <p className={`text-2xl font-bold ${resultat >= 0 ? "text-emerald-800" : "text-red-700"}`}>
          {resultat >= 0 ? "+" : ""}{fmt(resultat)} Ar
        </p>
      </div>
    </div>
  );
}

// ─── Section: Balance générale ────────────────────────────────────────────────
function BalanceTab({ data, loading, search, onSearch }: { data: any; loading: boolean; search: string; onSearch: (v: string) => void }) {
  if (loading) return <Loading/>;
  if (!data) return null;
  const { rows = [], totals = {}, anomalies = [] } = data;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-base font-bold text-gray-800">Balance générale</h2>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400"/>
            <input value={search} onChange={e => onSearch(e.target.value)}
              placeholder="Rechercher compte…"
              className="pl-8 pr-3 py-1.5 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 outline-none w-44"/>
          </div>
          <button onClick={() => downloadCSV(rows.map((r: any) => ({ code: r.code, libelle: r.name, type: r.type, debit: r.debit, credit: r.credit, solde: r.solde })), "balance-generale.csv")}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-600 hover:bg-gray-50">
            <Download className="w-3.5 h-3.5"/>CSV
          </button>
        </div>
      </div>

      {anomalies.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-1">
          {anomalies.map((a: string, i: number) => (
            <div key={i} className="flex items-center gap-2 text-xs text-red-700">
              <XCircle className="w-3.5 h-3.5 shrink-0"/>{a}
            </div>
          ))}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {["Code", "Libellé", "Type", "Débit", "Crédit", "Solde"].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0
              ? <tr><td colSpan={6} className="text-center py-12 text-gray-300">Aucune écriture sur la période</td></tr>
              : rows.map((r: any) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-mono text-xs font-bold text-gray-600">{r.code}</td>
                  <td className="px-4 py-2.5 text-gray-800">{r.name}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-1.5 py-0.5 rounded text-xs ${r.type === "asset" ? "bg-blue-100 text-blue-700" : r.type === "liability" ? "bg-orange-100 text-orange-700" : r.type === "revenue" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
                      {r.type === "asset" ? "Actif" : r.type === "liability" ? "Passif" : r.type === "revenue" ? "Produit" : "Charge"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-700">{fmt(r.debit)}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-700">{fmt(r.credit)}</td>
                  <td className={`px-4 py-2.5 font-mono text-xs font-semibold ${r.solde >= 0 ? "text-gray-800" : "text-red-600"}`}>
                    {r.solde < 0 ? "-" : ""}{fmt(Math.abs(r.solde))}
                  </td>
                </tr>
              ))}
          </tbody>
          <tfoot className="bg-gray-100 border-t-2 border-gray-300">
            <tr>
              <td colSpan={3} className="px-4 py-3 text-xs font-bold text-gray-700 uppercase">Totaux</td>
              <td className="px-4 py-3 font-mono font-bold text-gray-800">{fmt(totals.debit)}</td>
              <td className="px-4 py-3 font-mono font-bold text-gray-800">{fmt(totals.credit)}</td>
              <td className={`px-4 py-3 font-mono font-bold ${Math.abs(totals.solde ?? 0) < 1 ? "text-emerald-700" : "text-red-600"}`}>
                {Math.abs(totals.solde ?? 0) < 1 ? "✓ Équilibrée" : fmt(totals.solde)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ─── Section: Grand livre ─────────────────────────────────────────────────────
function LedgerTab({ data, loading, account, onAccount }: { data: any; loading: boolean; account: string; onAccount: (v: string) => void }) {
  const ACCOUNTS = [
    { code: "401", label: "401 — Fournisseurs" },
    { code: "411", label: "411 — Clients" },
    { code: "512", label: "512 — Banques" },
    { code: "53",  label: "53 — Caisse" },
    { code: "601", label: "601 — Achats marchandises" },
    { code: "602", label: "602 — Matières premières" },
    { code: "681", label: "681 — Dotations amortissements" },
    { code: "701", label: "701 — Ventes produits finis" },
    { code: "758", label: "758 — Autres produits" },
    { code: "281", label: "281 — Amortissements immo." },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-base font-bold text-gray-800">Grand livre</h2>
        {data && (
          <button onClick={() => downloadCSV((data.lines ?? []).map((l: any) => ({ date: fmtDate(l.date), reference: l.reference, description: l.description, debit: l.debit, credit: l.credit, solde: l.runningBalance })), `grand-livre-${account}.csv`)}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-600 hover:bg-gray-50">
            <Download className="w-3.5 h-3.5"/>CSV
          </button>
        )}
      </div>

      <div className="flex gap-2 flex-wrap">
        <label className="text-xs font-medium text-gray-500 self-center">Compte :</label>
        <select value={account} onChange={e => onAccount(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
          <option value="">— Sélectionner un compte —</option>
          {ACCOUNTS.map(a => <option key={a.code} value={a.code}>{a.label}</option>)}
        </select>
      </div>

      {!account && (
        <div className="text-center py-16 text-gray-300 bg-white rounded-xl border border-gray-200">
          <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30"/>
          <p className="text-sm">Sélectionnez un compte pour afficher le grand livre</p>
        </div>
      )}

      {account && loading && <Loading/>}

      {data && !loading && (
        <>
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-6">
            <div>
              <p className="text-xs text-gray-400">Compte</p>
              <p className="font-mono font-bold text-gray-900">{data.account?.code} — {data.account?.name}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Total débit</p>
              <p className="font-mono font-semibold text-gray-700">{fmt(data.totalDebit)} Ar</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Total crédit</p>
              <p className="font-mono font-semibold text-gray-700">{fmt(data.totalCredit)} Ar</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Solde</p>
              <p className={`font-mono font-bold ${data.solde >= 0 ? "text-emerald-700" : "text-red-600"}`}>{fmt(data.solde)} Ar</p>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {["Date", "Référence", "Description / Libellé", "Statut", "Débit", "Crédit", "Solde cumulé"].map(h => (
                    <th key={h} className="text-left px-3 py-2.5 font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(data.lines ?? []).length === 0
                  ? <tr><td colSpan={7} className="text-center py-10 text-gray-300">Aucun mouvement sur ce compte pour la période</td></tr>
                  : (data.lines ?? []).map((l: any, i: number) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{fmtDate(l.date)}</td>
                      <td className="px-3 py-2 font-mono font-bold text-gray-700">{l.reference}</td>
                      <td className="px-3 py-2 text-gray-600 max-w-xs">
                        {l.description && <span>{l.description}</span>}
                        {l.label && l.label !== l.description && <span className="text-gray-400"> · {l.label}</span>}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`px-1.5 py-0.5 rounded ${l.status === "validated" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                          {l.status === "validated" ? "Validé" : "Brouillon"}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-right text-blue-700 font-semibold">{l.debit > 0 ? fmt(l.debit) : ""}</td>
                      <td className="px-3 py-2 font-mono text-right text-orange-600 font-semibold">{l.credit > 0 ? fmt(l.credit) : ""}</td>
                      <td className={`px-3 py-2 font-mono text-right font-bold ${l.runningBalance >= 0 ? "text-gray-800" : "text-red-600"}`}>
                        {fmt(Math.abs(l.runningBalance))}{l.runningBalance < 0 ? " C" : " D"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Section: Journal comptable ────────────────────────────────────────────────
function JournalTab({ data, loading, type, onType, expanded, onExpand }: {
  data: any; loading: boolean; type: string; onType: (v: string) => void;
  expanded: string | null; onExpand: (v: string | null) => void;
}) {
  const TYPES = [
    { id: "all", label: "Tous" },
    { id: "ventes", label: "Ventes" },
    { id: "achats", label: "Achats" },
    { id: "banque", label: "Banque" },
    { id: "od", label: "Opérations diverses" },
  ];

  if (loading) return <Loading/>;
  if (!data) return null;

  const { entries = [], totals = {} } = data;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-base font-bold text-gray-800">Journal comptable</h2>
        <button onClick={() => downloadCSV(entries.map((e: any) => ({ date: fmtDate(e.date), reference: e.reference, description: e.description, journal: e.journalType, debit: e.totalDebit, credit: e.totalCredit, statut: e.status })), "journal.csv")}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-600 hover:bg-gray-50">
          <Download className="w-3.5 h-3.5"/>CSV
        </button>
      </div>

      <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1 flex-wrap">
        {TYPES.map(t => (
          <button key={t.id} onClick={() => onType(t.id)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${type === t.id ? "bg-gray-800 text-white" : "text-gray-600 hover:bg-gray-100"}`}>
            {t.label}
            {data.byType?.[t.id] && <span className="ml-1 opacity-60">({data.byType[t.id].length})</span>}
          </button>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="w-8 px-3 py-2.5"/>
              <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase">Date</th>
              <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase">Référence</th>
              <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase">Description</th>
              <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase">Journal</th>
              <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase">Statut</th>
              <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase">Débit</th>
              <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase">Crédit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {entries.length === 0
              ? <tr><td colSpan={8} className="text-center py-10 text-gray-300">Aucune écriture sur la période</td></tr>
              : entries.map((e: any) => (
                <>
                  <tr key={e.id} className={`cursor-pointer hover:bg-gray-50 ${!e.isBalanced ? "bg-red-50" : ""}`}
                    onClick={() => onExpand(expanded === e.id ? null : e.id)}>
                    <td className="px-3 py-2.5 text-gray-400">
                      {expanded === e.id ? <ChevronDown className="w-3.5 h-3.5"/> : <ChevronRight className="w-3.5 h-3.5"/>}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">{fmtDate(e.date)}</td>
                    <td className="px-3 py-2.5 font-mono text-xs font-bold text-gray-700">{e.reference}</td>
                    <td className="px-3 py-2.5 text-gray-600 text-xs">{e.description}</td>
                    <td className="px-3 py-2.5">
                      <span className={`px-1.5 py-0.5 rounded text-xs ${e.journalType === "ventes" ? "bg-emerald-100 text-emerald-700" : e.journalType === "achats" ? "bg-red-100 text-red-600" : e.journalType === "banque" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}`}>
                        {e.journalType === "ventes" ? "VTE" : e.journalType === "achats" ? "ACH" : e.journalType === "banque" ? "BNK" : "OD"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`px-1.5 py-0.5 rounded text-xs ${e.status === "validated" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                        {e.status === "validated" ? "Validé" : "Brouillon"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs text-blue-700 font-semibold">{fmt(e.totalDebit)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs text-orange-600 font-semibold">{fmt(e.totalCredit)}</td>
                  </tr>
                  {expanded === e.id && (
                    <tr key={e.id + "-detail"} className="bg-blue-50/40">
                      <td colSpan={8} className="px-8 py-2">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-gray-400">
                              <th className="text-left py-1 font-medium">Compte</th>
                              <th className="text-left py-1 font-medium">Libellé</th>
                              <th className="text-right py-1 font-medium">Débit</th>
                              <th className="text-right py-1 font-medium">Crédit</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(e.lines ?? []).map((l: any, i: number) => (
                              <tr key={i} className="border-t border-blue-100">
                                <td className="py-1 font-mono font-bold text-gray-600">{l.accountCode} {l.accountName}</td>
                                <td className="py-1 text-gray-500">{l.label ?? ""}</td>
                                <td className="py-1 text-right font-mono text-blue-700">{l.debit > 0 ? fmt(l.debit) : ""}</td>
                                <td className="py-1 text-right font-mono text-orange-600">{l.credit > 0 ? fmt(l.credit) : ""}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </>
              ))}
          </tbody>
          <tfoot className="bg-gray-100 border-t-2 border-gray-300">
            <tr>
              <td colSpan={6} className="px-3 py-2.5 text-xs font-bold text-gray-700 uppercase">Total général</td>
              <td className="px-3 py-2.5 text-right font-mono font-bold text-blue-800">{fmt(totals.debit)}</td>
              <td className="px-3 py-2.5 text-right font-mono font-bold text-orange-700">{fmt(totals.credit)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ─── Section: TVA ─────────────────────────────────────────────────────────────
function TVATab({ data, loading }: { data: any; loading: boolean }) {
  if (loading) return <Loading/>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-gray-800">TVA & Fiscalité</h2>
        <button onClick={() => downloadCSV([{ tva_collectee: data.tvaCollectee, tva_deductible: data.tvaDeduite, solde: data.solde, ventes_ht: data.ventesHT }], "tva.csv")}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-600 hover:bg-gray-50">
          <Download className="w-3.5 h-3.5"/>CSV fiscal
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KPI label="TVA collectée (ventes)" value={fmt(data.tvaCollectee) + " Ar"} cls="text-red-600" bg="bg-red-50 border-red-200"/>
        <KPI label="TVA déductible (achats)" value={fmt(data.tvaDeduite) + " Ar"} cls="text-blue-600" bg="bg-blue-50 border-blue-200"/>
        <KPI label="TVA nette à reverser" value={fmt(data.solde) + " Ar"}
          cls={data.solde >= 0 ? "text-orange-700 font-bold" : "text-emerald-700 font-bold"}
          bg="bg-orange-50 border-orange-200"/>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">Détail fiscal</h3>
          {[
            { label: "Ventes HT (comptes 70x)", value: fmt(data.ventesHT) + " Ar" },
            { label: "Taux TVA standard", value: "20%" },
            { label: "TVA théorique collectée", value: fmt(data.ventesHT * 0.20) + " Ar" },
            { label: "Exportations (taux 0%)", value: fmt(data.exportVentes) + " Ar" },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between text-sm border-b border-gray-100 pb-2">
              <span className="text-gray-500">{label}</span>
              <span className="font-mono font-medium">{value}</span>
            </div>
          ))}
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">Note fiscale Madagascar</h3>
          <div className="space-y-2 text-xs text-gray-600">
            <p>• TVA sur les ventes : <strong>20%</strong> (régime général)</p>
            <p>• Exportations de vanille : <strong>0% TVA</strong> (exonérées)</p>
            <p>• IRSA sur salaires : calculé via module RH</p>
            <p>• Déclaration mensuelle obligatoire avant le 15</p>
            <p>• PCG 2005 : comptes 44566 (déductible) / 44571 (collectée)</p>
          </div>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
        <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0"/>
        <div className="text-xs text-blue-700">
          <strong>Exportateur de vanille :</strong> Les ventes à l'export sont exonérées de TVA (taux 0%).
          La TVA déductible sur les achats peut générer un crédit de TVA récupérable auprès des impôts.
        </div>
      </div>
    </div>
  );
}

// ─── Section: Trésorerie ──────────────────────────────────────────────────────
function TreasuryTab({ data, loading }: { data: any; loading: boolean }) {
  if (loading) return <Loading/>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-gray-800">Trésorerie</h2>
        <button onClick={() => downloadCSV(data.monthly ?? [], "tresorerie.csv")}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-600 hover:bg-gray-50">
          <Download className="w-3.5 h-3.5"/>CSV
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPI label="Banques (512)" value={fmt(data.bank) + " Ar"} cls="text-blue-700" bg="bg-blue-50 border-blue-200"/>
        <KPI label="Caisse (53)" value={fmt(data.cash) + " Ar"} cls="text-teal-700" bg="bg-teal-50 border-teal-200"/>
        <KPI label="Trésorerie totale" value={fmt(data.total) + " Ar"} cls="text-emerald-800 font-bold" bg="bg-emerald-50 border-emerald-200"/>
        <KPI label="Flux net période" value={fmt(data.net) + " Ar"}
          cls={data.net >= 0 ? "text-emerald-700" : "text-red-600"} bg="bg-gray-50 border-gray-200"/>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Encaissements période</p>
          <p className="text-xl font-bold text-green-700">+{fmt(data.inflows)} Ar</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Décaissements période</p>
          <p className="text-xl font-bold text-red-600">-{fmt(data.outflows)} Ar</p>
        </div>
      </div>

      {(data.monthly ?? []).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Cash flow mensuel</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={data.monthly} margin={{ top: 0, right: 10, bottom: 0, left: 10 }}>
              <defs>
                <linearGradient id="inflowGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="outflowGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
              <XAxis dataKey="month" tick={{ fontSize: 11 }}/>
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => (v / 1000).toFixed(0) + "k"}/>
              <Tooltip formatter={(v: number) => fmt(v) + " Ar"}/>
              <Legend/>
              <Area type="monotone" dataKey="inflow" name="Encaissements" stroke="#10b981" fill="url(#inflowGrad)" strokeWidth={2}/>
              <Area type="monotone" dataKey="outflow" name="Décaissements" stroke="#ef4444" fill="url(#outflowGrad)" strokeWidth={2}/>
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {(data.monthly ?? []).length === 0 && (
        <div className="text-center py-12 text-gray-300 bg-white rounded-xl border border-gray-200">
          <Landmark className="w-12 h-12 mx-auto mb-3 opacity-30"/>
          <p>Aucun mouvement de trésorerie enregistré</p>
        </div>
      )}
    </div>
  );
}

// ─── Section: Auxiliaire clients / fournisseurs ───────────────────────────────
function AuxiliaryTab({ data, loading, type }: { data: any; loading: boolean; type: "clients" | "suppliers" }) {
  if (loading) return <Loading/>;
  if (!data) return null;

  const isClients = type === "clients";
  const entries = data.entries ?? [];
  const totals = data.totals ?? {};
  const aging = data.aging ?? {};
  const extra = isClients ? data.clientSales ?? [] : data.supplierPurchases ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-gray-800">
          {isClients ? "Balance auxiliaire clients" : "Balance auxiliaire fournisseurs"}
        </h2>
        <button onClick={() => downloadCSV(entries.map((e: any) => ({ date: fmtDate(e.date), reference: e.reference, debit: e.debit, credit: e.credit, jours: e.daysOld })), `auxiliaire-${type}.csv`)}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-600 hover:bg-gray-50">
          <Download className="w-3.5 h-3.5"/>CSV
        </button>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPI label={isClients ? "Total facturé" : "Total achats"} value={fmt(totals.credit ?? 0) + " Ar"} cls="text-gray-800" bg="bg-gray-50 border-gray-200"/>
        <KPI label={isClients ? "Total encaissé" : "Total payé"} value={fmt(totals.debit ?? 0) + " Ar"} cls="text-emerald-700" bg="bg-emerald-50 border-emerald-200"/>
        <KPI label={isClients ? "Solde à recouvrer" : "Dettes"} value={fmt(Math.abs(isClients ? totals.solde : totals.soldeDette) ?? 0) + " Ar"}
          cls="text-orange-600" bg="bg-orange-50 border-orange-200"/>
        <div className="bg-white border border-gray-200 rounded-xl p-3">
          <p className="text-xs text-gray-400 mb-1">Aging</p>
          <div className="space-y-0.5 text-xs">
            <div className="flex justify-between"><span className="text-green-600">0–30 j</span><span className="font-mono">{fmt(aging.current)} Ar</span></div>
            <div className="flex justify-between"><span className="text-amber-600">30–60 j</span><span className="font-mono">{fmt(aging.days30_60)} Ar</span></div>
            <div className="flex justify-between"><span className="text-red-600">60+ j</span><span className="font-mono">{fmt(aging.days60plus)} Ar</span></div>
          </div>
        </div>
      </div>

      {/* Extra: clients sales or supplier purchases */}
      {extra.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
              {isClients ? "Ventes par client" : "Achats par fournisseur"}
            </h3>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">
                  {isClients ? "Client" : "Fournisseur"}
                </th>
                {isClients
                  ? <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">Total ventes</th>
                  : <>
                      <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">Nb commandes</th>
                      <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">Total achats (Ar)</th>
                      <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">Quantité (kg)</th>
                    </>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {extra.map((e: any, i: number) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-gray-800">{e.name}</td>
                  {isClients
                    ? <td className="px-4 py-2.5 text-right font-mono text-sm font-semibold text-emerald-700">{fmt(Number(e.total_sales))}</td>
                    : <>
                        <td className="px-4 py-2.5 text-right text-gray-500">{e.nb_purchases}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-sm font-semibold text-gray-800">{fmt(Number(e.total_achats))}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs text-gray-500">{Number(e.total_kg).toFixed(1)} kg</td>
                      </>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Journal movements */}
      {entries.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
              Mouvements compte {isClients ? "411 — Clients" : "401 — Fournisseurs"}
            </h3>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {["Date", "Référence", "Description", "Statut", "Débit", "Crédit", "Ancienneté"].map(h => (
                  <th key={h} className="text-left px-3 py-2.5 text-xs font-medium text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {entries.map((e: any, i: number) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-3 py-2.5 text-xs text-gray-500">{fmtDate(e.date)}</td>
                  <td className="px-3 py-2.5 font-mono text-xs font-bold text-gray-700">{e.reference}</td>
                  <td className="px-3 py-2.5 text-xs text-gray-600 max-w-xs truncate">{e.description}</td>
                  <td className="px-3 py-2.5">
                    <span className={`px-1.5 py-0.5 rounded text-xs ${e.status === "validated" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                      {e.status === "validated" ? "Validé" : "Brouillon"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-blue-700">{e.debit > 0 ? fmt(e.debit) : ""}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-orange-600">{e.credit > 0 ? fmt(e.credit) : ""}</td>
                  <td className="px-3 py-2.5">
                    <span className={`px-1.5 py-0.5 rounded text-xs ${e.daysOld <= 30 ? "bg-green-100 text-green-700" : e.daysOld <= 60 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-600"}`}>
                      {e.daysOld} j
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-100 border-t-2 border-gray-300">
              <tr>
                <td colSpan={4} className="px-3 py-2.5 text-xs font-bold text-gray-700 uppercase">Totaux</td>
                <td className="px-3 py-2.5 font-mono font-bold text-blue-800">{fmt(totals.debit)}</td>
                <td className="px-3 py-2.5 font-mono font-bold text-orange-700">{fmt(totals.credit)}</td>
                <td/>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {entries.length === 0 && extra.length === 0 && (
        <div className="text-center py-12 text-gray-300 bg-white rounded-xl border border-gray-200">
          {isClients ? <Users className="w-12 h-12 mx-auto mb-3 opacity-30"/> : <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30"/>}
          <p>Aucun mouvement sur la période</p>
        </div>
      )}
    </div>
  );
}
