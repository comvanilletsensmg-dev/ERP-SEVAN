import { useState } from "react";
import { useGetReportsBalance, useGetReportsIncome, useGetReportsTva } from "@workspace/api-client-react";

type ReportTab = "balance" | "income" | "tva";

function fmt(n: number) { return n.toLocaleString("fr-FR"); }

export default function ReportsPage() {
  const [tab, setTab] = useState<ReportTab>("income");

  const { data: balance, isLoading: loadingBalance } = useGetReportsBalance();
  const { data: income, isLoading: loadingIncome } = useGetReportsIncome();
  const { data: tva, isLoading: loadingTva } = useGetReportsTva();

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Rapports financiers</h1>

      <div className="flex border-b border-gray-200 mb-6">
        {[
          { id: "income" as ReportTab, label: "Compte de résultat" },
          { id: "balance" as ReportTab, label: "Balance générale" },
          { id: "tva" as ReportTab, label: "Rapport TVA" },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === t.id ? "border-emerald-600 text-emerald-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "income" && (
        <div className="space-y-4">
          {loadingIncome ? <div className="text-center py-16 text-gray-400">Chargement…</div> : !income ? null : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                {[
                  { label: "Chiffre d'affaires", value: fmt(income.totalRevenue) + " MGA", color: "text-emerald-700", bg: "bg-emerald-50" },
                  { label: "Charges totales", value: fmt(income.totalCharges) + " MGA", color: "text-red-600", bg: "bg-red-50" },
                  { label: "Résultat net", value: fmt(income.resultat) + " MGA", color: income.resultat >= 0 ? "text-emerald-700 font-bold" : "text-red-700 font-bold", bg: income.resultat >= 0 ? "bg-emerald-50" : "bg-red-50" },
                ].map(c => (
                  <div key={c.label} className={`${c.bg} border border-gray-200 rounded-xl p-4`}>
                    <div className={`text-xl font-semibold ${c.color}`}>{c.value}</div>
                    <div className="text-xs text-gray-500 mt-1">{c.label}</div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Produits (comptes 7xx)</h3>
                  <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50"><tr>
                        <th className="text-left px-3 py-2 text-xs text-gray-500">Compte</th>
                        <th className="text-right px-3 py-2 text-xs text-gray-500">Montant</th>
                      </tr></thead>
                      <tbody className="divide-y divide-gray-100">
                        {(income.revenues ?? []).map((r: any) => (
                          <tr key={r.id} className="hover:bg-gray-50">
                            <td className="px-3 py-2"><span className="font-mono text-xs bg-gray-100 px-1 rounded mr-2">{r.code}</span>{r.name}</td>
                            <td className="px-3 py-2 text-right font-mono text-xs text-emerald-700">{fmt(r.amount)}</td>
                          </tr>
                        ))}
                        {!income.revenues?.length && <tr><td colSpan={2} className="px-3 py-4 text-center text-gray-400 text-xs">Aucun produit</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Charges (comptes 6xx)</h3>
                  <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50"><tr>
                        <th className="text-left px-3 py-2 text-xs text-gray-500">Compte</th>
                        <th className="text-right px-3 py-2 text-xs text-gray-500">Montant</th>
                      </tr></thead>
                      <tbody className="divide-y divide-gray-100">
                        {(income.charges ?? []).map((c: any) => (
                          <tr key={c.id} className="hover:bg-gray-50">
                            <td className="px-3 py-2"><span className="font-mono text-xs bg-gray-100 px-1 rounded mr-2">{c.code}</span>{c.name}</td>
                            <td className="px-3 py-2 text-right font-mono text-xs text-red-500">{fmt(c.amount)}</td>
                          </tr>
                        ))}
                        {!income.charges?.length && <tr><td colSpan={2} className="px-3 py-4 text-center text-gray-400 text-xs">Aucune charge</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {tab === "balance" && (
        <div>
          {loadingBalance ? <div className="text-center py-16 text-gray-400">Chargement…</div> : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {["Code", "Compte", "Type", "Débit", "Crédit", "Solde"].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-600 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(balance ?? []).length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-12 text-gray-400">Aucune écriture</td></tr>
                  ) : (balance ?? []).map((r: any) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-mono text-xs font-bold text-gray-700">{r.code}</td>
                      <td className="px-4 py-2 text-gray-800">{r.name}</td>
                      <td className="px-4 py-2 text-xs text-gray-500 capitalize">{r.type}</td>
                      <td className="px-4 py-2 font-mono text-xs text-gray-700">{fmt(r.debit)}</td>
                      <td className="px-4 py-2 font-mono text-xs text-gray-700">{fmt(r.credit)}</td>
                      <td className={`px-4 py-2 font-mono text-xs font-semibold ${r.solde >= 0 ? "text-gray-800" : "text-red-600"}`}>
                        {r.solde >= 0 ? "" : "-"}{fmt(Math.abs(r.solde))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "tva" && (
        <div>
          {loadingTva ? <div className="text-center py-16 text-gray-400">Chargement…</div> : !tva ? null : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { label: "TVA collectée (ventes)", value: fmt(tva.tvaCollectee) + " MGA", color: "text-red-600", bg: "bg-red-50" },
                  { label: "TVA déductible (achats)", value: fmt(tva.tvaDeduite) + " MGA", color: "text-blue-600", bg: "bg-blue-50" },
                  { label: "TVA nette à payer", value: fmt(tva.solde) + " MGA", color: tva.solde >= 0 ? "text-orange-600 font-bold" : "text-emerald-600 font-bold", bg: "bg-orange-50" },
                ].map(c => (
                  <div key={c.label} className={`${c.bg} border border-gray-200 rounded-xl p-5`}>
                    <div className={`text-2xl font-semibold ${c.color}`}>{c.value}</div>
                    <div className="text-xs text-gray-500 mt-1">{c.label}</div>
                  </div>
                ))}
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-4 text-sm">
                <h3 className="font-semibold text-gray-700 mb-3">Détail par source</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-500 font-medium mb-1">Depuis journal (compte 445)</p>
                    <p className="font-mono text-sm">Collectée : {fmt(tva.fromJournal?.tvaCollectee ?? 0)} MGA</p>
                    <p className="font-mono text-sm">Déductible : {fmt(tva.fromJournal?.tvaDeduite ?? 0)} MGA</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 font-medium mb-1">Depuis factures</p>
                    <p className="font-mono text-sm">Ventes : {fmt(tva.fromInvoices?.tvaFromSales ?? 0)} MGA</p>
                    <p className="font-mono text-sm">Achats : {fmt(tva.fromInvoices?.tvaFromPurchases ?? 0)} MGA</p>
                  </div>
                </div>
              </div>
              <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-700">
                Taux TVA standard Madagascar : <strong>20%</strong> · Exportations : <strong>0%</strong> (hors TVA)
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
