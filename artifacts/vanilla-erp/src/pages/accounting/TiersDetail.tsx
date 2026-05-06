import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  ArrowLeft, Building2, Mail, Phone, MapPin, FileText,
  TrendingUp, AlertTriangle, Download, CreditCard, ShoppingCart,
  CheckCircle2, Clock, XCircle, ChevronRight, Calendar, Hash,
} from "lucide-react";
import { toast } from "sonner";

interface TiersDetailProps { id: string }

function fmt(n: number) {
  return new Intl.NumberFormat("fr-MG", { maximumFractionDigits: 0 }).format(n) + " Ar";
}
function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR");
}
function statusBadge(s: string) {
  if (s === "paid") return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700"><CheckCircle2 className="w-3 h-3"/>Payé</span>;
  if (s === "validated") return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700"><Clock className="w-3 h-3"/>Validé</span>;
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600"><FileText className="w-3 h-3"/>Brouillon</span>;
}

const TABS = [
  { id: "compte",    label: "Compte tiers",  icon: TrendingUp },
  { id: "aging",     label: "Aging",         icon: AlertTriangle },
  { id: "factures",  label: "Factures",      icon: FileText },
  { id: "achats",    label: "Achats",        icon: ShoppingCart },
  { id: "fiche",     label: "Fiche",         icon: Building2 },
] as const;
type Tab = typeof TABS[number]["id"];

export default function TiersDetail({ id }: TiersDetailProps) {
  const [tab, setTab] = useState<Tab>("compte");

  const { data, isLoading, error } = useQuery({
    queryKey: ["tiers-detail", id],
    queryFn: async () => {
      const r = await fetch(`/api/tiers/${id}`, { credentials: "include" });
      if (!r.ok) throw new Error("Tiers introuvable");
      return r.json();
    },
  });

  const handleExport = () => {
    window.open("/api/tiers/export/excel", "_blank");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto"/>
          <p className="text-gray-500 text-sm">Chargement du tiers…</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center space-y-3">
          <XCircle className="w-12 h-12 text-red-400 mx-auto"/>
          <p className="text-gray-500">Tiers introuvable</p>
          <Link href="/accounting/partners" className="text-emerald-600 hover:underline text-sm">← Retour à la liste</Link>
        </div>
      </div>
    );
  }

  const { partner, invoices, aging, totalEncours, totalCA, ledger, purchases, crmData } = data as any;
  const isClient = partner.type === "client";

  const agingTotal = (aging["current"] ?? 0) + (aging["1-30"] ?? 0) + (aging["31-60"] ?? 0) + (aging["61+"] ?? 0);
  const agingBars = [
    { label: "Courant", key: "current", color: "bg-emerald-500" },
    { label: "1–30 j", key: "1-30",    color: "bg-yellow-400" },
    { label: "31–60 j", key: "31-60",  color: "bg-orange-500" },
    { label: "61+ j",  key: "61+",     color: "bg-red-500" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3">
        <Link href="/accounting/partners" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 transition-colors">
          <ArrowLeft className="w-4 h-4"/>
          Tiers
        </Link>
        <ChevronRight className="w-4 h-4 text-gray-300"/>
        <span className="text-sm font-medium text-gray-800">{partner.name}</span>
        <div className="flex-1"/>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">
          <Download className="w-4 h-4"/>
          Exporter balance
        </button>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Header card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-start gap-5">
            {/* Avatar */}
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold text-white shrink-0 ${isClient ? "bg-gradient-to-br from-blue-500 to-blue-700" : "bg-gradient-to-br from-orange-400 to-orange-600"}`}>
              {partner.name[0].toUpperCase()}
            </div>
            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-2xl font-bold text-gray-900 truncate">{partner.name}</h1>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${isClient ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"}`}>
                  {isClient ? "Client" : "Fournisseur"}
                </span>
              </div>
              <div className="flex flex-wrap gap-4 text-sm text-gray-500 mt-2">
                {partner.email && <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5"/>{partner.email}</span>}
                {partner.phone && <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5"/>{partner.phone}</span>}
                {partner.address && <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5"/>{partner.address}</span>}
                {partner.vatNumber && <span className="flex items-center gap-1.5"><Hash className="w-3.5 h-3.5"/>TVA: {partner.vatNumber}</span>}
              </div>
              {crmData && (
                <div className="mt-2 flex gap-3 text-xs text-gray-400">
                  {crmData.country && <span>🌍 {crmData.country}</span>}
                  {crmData.risk_level && <span className={`font-medium ${crmData.risk_level === "high" ? "text-red-500" : crmData.risk_level === "medium" ? "text-yellow-500" : "text-emerald-500"}`}>Risque: {crmData.risk_level}</span>}
                  {crmData.payment_terms && <span>Délai paiement: {crmData.payment_terms}j</span>}
                  {crmData.credit_limit && <span>Limite crédit: {fmt(crmData.credit_limit)}</span>}
                </div>
              )}
            </div>
            {/* KPI mini-cards */}
            <div className="flex gap-3 shrink-0">
              <div className="text-center px-5 py-3 bg-gray-50 rounded-xl border border-gray-100">
                <p className="text-xs text-gray-400 mb-0.5">Encours</p>
                <p className={`text-lg font-bold ${totalEncours > 0 ? (isClient ? "text-blue-700" : "text-orange-600") : "text-gray-400"}`}>{fmt(totalEncours)}</p>
              </div>
              <div className="text-center px-5 py-3 bg-gray-50 rounded-xl border border-gray-100">
                <p className="text-xs text-gray-400 mb-0.5">CA encaissé</p>
                <p className="text-lg font-bold text-emerald-700">{fmt(totalCA)}</p>
              </div>
              <div className="text-center px-5 py-3 bg-gray-50 rounded-xl border border-gray-100">
                <p className="text-xs text-gray-400 mb-0.5">Factures</p>
                <p className="text-lg font-bold text-gray-800">{invoices.length}</p>
              </div>
              {!isClient && (
                <div className="text-center px-5 py-3 bg-gray-50 rounded-xl border border-gray-100">
                  <p className="text-xs text-gray-400 mb-0.5">Achats</p>
                  <p className="text-lg font-bold text-gray-800">{purchases.length}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1 shadow-sm w-fit">
          {TABS.filter(t => t.id !== "achats" || !isClient).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.id ? "bg-emerald-600 text-white shadow-sm" : "text-gray-600 hover:bg-gray-50"}`}>
              <t.icon className="w-4 h-4"/>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── COMPTE TIERS ─────────────────────────────────────────────── */}
        {tab === "compte" && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-800">Compte tiers — {isClient ? "411" : "401"}</h2>
                <p className="text-xs text-gray-400 mt-0.5">Mouvements liés aux écritures comptables</p>
              </div>
            </div>
            {ledger.length === 0 ? (
              <div className="py-16 text-center text-gray-400">
                <TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-30"/>
                <p className="text-sm">Aucune écriture — les lignes apparaissent après validation des factures</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      {["Date", "Référence", "Libellé", "Débit (Ar)", "Crédit (Ar)", "Solde (Ar)"].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {ledger.map((row: any, i: number) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(row.date)}</td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-700">{row.reference ?? "—"}</td>
                        <td className="px-4 py-3 text-gray-700 max-w-xs truncate">{row.description ?? row.label ?? "—"}</td>
                        <td className="px-4 py-3 text-right font-medium text-blue-700">{row.debit > 0 ? fmt(row.debit) : "—"}</td>
                        <td className="px-4 py-3 text-right font-medium text-emerald-700">{row.credit > 0 ? fmt(row.credit) : "—"}</td>
                        <td className={`px-4 py-3 text-right font-bold ${row.balance > 0 ? "text-blue-700" : row.balance < 0 ? "text-red-600" : "text-gray-400"}`}>{fmt(Math.abs(row.balance))}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                    <tr>
                      <td colSpan={3} className="px-4 py-3 font-semibold text-gray-700 text-sm">Solde final</td>
                      <td className="px-4 py-3 text-right font-bold text-blue-700">
                        {fmt(ledger.reduce((s: number, r: any) => s + r.debit, 0))}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-700">
                        {fmt(ledger.reduce((s: number, r: any) => s + r.credit, 0))}
                      </td>
                      <td className={`px-4 py-3 text-right font-bold text-lg ${ledger[ledger.length - 1]?.balance > 0 ? "text-blue-700" : "text-emerald-700"}`}>
                        {ledger.length > 0 ? fmt(Math.abs(ledger[ledger.length - 1].balance)) : "—"}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── AGING ────────────────────────────────────────────────────── */}
        {tab === "aging" && (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-4">
              {agingBars.map(b => (
                <div key={b.key} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-gray-600">{b.label}</span>
                    <div className={`w-3 h-3 rounded-full ${b.color}`}/>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{fmt(aging[b.key] ?? 0)}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {agingTotal > 0 ? ((aging[b.key] ?? 0) / agingTotal * 100).toFixed(1) : "0.0"}% du total
                  </p>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
              <h3 className="font-semibold text-gray-800 mb-4">Répartition de l'encours</h3>
              {agingTotal === 0 ? (
                <p className="text-center text-gray-400 py-8 text-sm">Aucun encours — toutes les factures sont réglées</p>
              ) : (
                <div className="space-y-3">
                  {agingBars.map(b => {
                    const pct = agingTotal > 0 ? (aging[b.key] ?? 0) / agingTotal * 100 : 0;
                    return (
                      <div key={b.key} className="flex items-center gap-4">
                        <span className="w-20 text-sm text-gray-600 shrink-0">{b.label}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                          <div className={`${b.color} h-full rounded-full transition-all`} style={{ width: `${pct}%` }}/>
                        </div>
                        <span className="w-32 text-right text-sm font-medium text-gray-700">{fmt(aging[b.key] ?? 0)}</span>
                        <span className="w-12 text-right text-xs text-gray-400">{pct.toFixed(0)}%</span>
                      </div>
                    );
                  })}
                  <div className="border-t border-gray-100 pt-3 flex items-center gap-4">
                    <span className="w-20 text-sm font-bold text-gray-800 shrink-0">Total</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                      <div className="bg-gray-400 h-full rounded-full w-full"/>
                    </div>
                    <span className="w-32 text-right text-sm font-bold text-gray-900">{fmt(agingTotal)}</span>
                    <span className="w-12 text-right text-xs text-gray-500">100%</span>
                  </div>
                </div>
              )}

              {/* Invoice aging details */}
              {invoices.filter((inv: any) => inv.status !== "paid").length > 0 && (
                <div className="mt-6">
                  <h4 className="text-sm font-semibold text-gray-600 mb-3">Détail des factures ouvertes</h4>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-400 border-b border-gray-100">
                        <th className="text-left py-2">Facture</th>
                        <th className="text-left py-2">Échéance</th>
                        <th className="text-left py-2">Statut</th>
                        <th className="text-right py-2">Montant TTC</th>
                        <th className="text-right py-2">Restant dû</th>
                        <th className="text-right py-2">Tranche</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {invoices.filter((inv: any) => inv.status !== "paid").map((inv: any) => {
                        const dueDate = inv.dueDate ? new Date(inv.dueDate) : null;
                        const today = new Date();
                        const days = dueDate ? Math.floor((today.getTime() - dueDate.getTime()) / 86_400_000) : 0;
                        const bucket = !dueDate || days <= 0 ? { label: "Courant", cls: "bg-emerald-100 text-emerald-700" }
                          : days <= 30 ? { label: "1–30 j", cls: "bg-yellow-100 text-yellow-700" }
                          : days <= 60 ? { label: "31–60 j", cls: "bg-orange-100 text-orange-700" }
                          : { label: "61+ j", cls: "bg-red-100 text-red-700" };
                        return (
                          <tr key={inv.id}>
                            <td className="py-2 font-mono text-xs text-gray-700">{inv.invoiceNumber}</td>
                            <td className="py-2 text-gray-500">{fmtDate(inv.dueDate)}</td>
                            <td className="py-2">{statusBadge(inv.status)}</td>
                            <td className="py-2 text-right font-medium">{fmt(inv.amountTTC)}</td>
                            <td className="py-2 text-right font-bold text-blue-700">{fmt(inv.remaining ?? inv.amountTTC)}</td>
                            <td className="py-2 text-right">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${bucket.cls}`}>{bucket.label}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── FACTURES ─────────────────────────────────────────────────── */}
        {tab === "factures" && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-800">Factures liées</h2>
              <p className="text-xs text-gray-400 mt-0.5">{invoices.length} facture(s) au total</p>
            </div>
            {invoices.length === 0 ? (
              <div className="py-16 text-center text-gray-400">
                <FileText className="w-10 h-10 mx-auto mb-3 opacity-30"/>
                <p className="text-sm">Aucune facture associée</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      {["N° Facture", "Date", "Échéance", "Type", "Statut", "Montant HT", "TVA", "Montant TTC", "Payé", "Restant"].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {invoices.map((inv: any) => (
                      <tr key={inv.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-mono text-xs font-bold text-gray-800">{inv.invoiceNumber}</td>
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(inv.createdAt)}</td>
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(inv.dueDate)}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${inv.type === "sale" ? "bg-blue-50 text-blue-700" : "bg-orange-50 text-orange-700"}`}>
                            {inv.type === "sale" ? "Vente" : "Achat"}
                          </span>
                        </td>
                        <td className="px-4 py-3">{statusBadge(inv.status)}</td>
                        <td className="px-4 py-3 text-right text-gray-700">{fmt(inv.amountHT)}</td>
                        <td className="px-4 py-3 text-right text-gray-500">{inv.tvaRate}%</td>
                        <td className="px-4 py-3 text-right font-bold text-gray-900">{fmt(inv.amountTTC)}</td>
                        <td className="px-4 py-3 text-right text-emerald-700 font-medium">{fmt(inv.paidAmount ?? 0)}</td>
                        <td className="px-4 py-3 text-right font-bold text-blue-700">{inv.status === "paid" ? <span className="text-gray-300">—</span> : fmt(inv.remaining ?? inv.amountTTC)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                    <tr>
                      <td colSpan={5} className="px-4 py-3 font-semibold text-gray-700 text-sm">Total</td>
                      <td className="px-4 py-3 text-right font-bold">{fmt(invoices.reduce((s: number, i: any) => s + i.amountHT, 0))}</td>
                      <td/>
                      <td className="px-4 py-3 text-right font-bold">{fmt(invoices.reduce((s: number, i: any) => s + i.amountTTC, 0))}</td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-700">{fmt(invoices.reduce((s: number, i: any) => s + (i.paidAmount ?? 0), 0))}</td>
                      <td className="px-4 py-3 text-right font-bold text-blue-700">{fmt(totalEncours)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── ACHATS (suppliers only) ───────────────────────────────────── */}
        {tab === "achats" && !isClient && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-800">Historique des achats</h2>
              <p className="text-xs text-gray-400 mt-0.5">{purchases.length} achat(s) enregistrés</p>
            </div>
            {purchases.length === 0 ? (
              <div className="py-16 text-center text-gray-400">
                <ShoppingCart className="w-10 h-10 mx-auto mb-3 opacity-30"/>
                <p className="text-sm">Aucun achat logistique trouvé pour ce fournisseur</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      {["Date", "Lot", "Poids (kg)", "Prix / kg", "Montant Total", "Paiement", "Humidité"].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {purchases.map((p: any) => (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(p.created_at)}</td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-700">{p.lot_id ?? "—"}</td>
                        <td className="px-4 py-3 text-right font-medium">{p.weight != null ? `${p.weight} kg` : "—"}</td>
                        <td className="px-4 py-3 text-right text-gray-600">{p.price_per_kg != null ? fmt(p.price_per_kg) : "—"}</td>
                        <td className="px-4 py-3 text-right font-bold text-gray-900">{fmt(p.total_amount)}</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">{p.payment_method ?? "—"}</span>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-500">{p.humidity != null ? `${p.humidity}%` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                    <tr>
                      <td colSpan={4} className="px-4 py-3 font-semibold text-gray-700 text-sm">Total achats</td>
                      <td className="px-4 py-3 text-right font-bold text-gray-900">{fmt(purchases.reduce((s: number, p: any) => s + (p.total_amount ?? 0), 0))}</td>
                      <td colSpan={2}/>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── FICHE ────────────────────────────────────────────────────── */}
        {tab === "fiche" && (
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
              <h3 className="font-semibold text-gray-800 flex items-center gap-2"><Building2 className="w-4 h-4 text-emerald-600"/>Coordonnées</h3>
              <dl className="space-y-3 text-sm">
                {[
                  { label: "Nom", value: partner.name },
                  { label: "Type", value: partner.type === "client" ? "Client" : "Fournisseur" },
                  { label: "Email", value: partner.email },
                  { label: "Téléphone", value: partner.phone },
                  { label: "Adresse", value: partner.address },
                  { label: "N° TVA", value: partner.vatNumber },
                  { label: "Notes", value: partner.notes },
                  { label: "Créé le", value: fmtDate(partner.createdAt) },
                ].map(({ label, value }) => (
                  <div key={label} className="flex gap-3">
                    <dt className="w-28 text-gray-400 shrink-0">{label}</dt>
                    <dd className="text-gray-800 font-medium">{value ?? "—"}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {crmData && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
                <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-blue-600"/>Données CRM
                </h3>
                <dl className="space-y-3 text-sm">
                  {[
                    { label: "Pays", value: crmData.country },
                    { label: "Niveau risque", value: crmData.risk_level },
                    { label: "Devise", value: crmData.currency },
                    { label: "Limite crédit", value: crmData.credit_limit != null ? fmt(crmData.credit_limit) : null },
                    { label: "Délai paiement", value: crmData.payment_terms != null ? `${crmData.payment_terms} jours` : null },
                    { label: "CA total CRM", value: crmData.total_revenue != null ? fmt(crmData.total_revenue) : null },
                    { label: "Dernière commande", value: fmtDate(crmData.last_order_date) },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex gap-3">
                      <dt className="w-36 text-gray-400 shrink-0">{label}</dt>
                      <dd className="text-gray-800 font-medium">{value ?? "—"}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
              <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2"><CreditCard className="w-4 h-4 text-emerald-600"/>Résumé financier</h3>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-400">Total facturé (TTC)</dt>
                  <dd className="font-bold text-gray-900">{fmt(invoices.reduce((s: number, i: any) => s + i.amountTTC, 0))}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-400">Total encaissé</dt>
                  <dd className="font-bold text-emerald-700">{fmt(totalCA)}</dd>
                </div>
                <div className="flex justify-between border-t border-gray-100 pt-3">
                  <dt className="text-gray-600 font-semibold">Encours restant</dt>
                  <dd className="font-bold text-blue-700 text-base">{fmt(totalEncours)}</dd>
                </div>
                {!isClient && (
                  <div className="flex justify-between border-t border-gray-100 pt-3">
                    <dt className="text-gray-400">Total achats logistique</dt>
                    <dd className="font-bold text-orange-700">{fmt(purchases.reduce((s: number, p: any) => s + (p.total_amount ?? 0), 0))}</dd>
                  </div>
                )}
              </dl>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
