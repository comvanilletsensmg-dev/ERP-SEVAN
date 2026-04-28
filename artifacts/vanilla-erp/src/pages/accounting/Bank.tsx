import { useState } from "react";
import { useGetBank, useCreateBankTransaction, useMatchBankTransaction, useUnmatchBankTransaction, useImportBankTransactions } from "@workspace/api-client-react";
import { useForm } from "react-hook-form";

type TxnForm = { date: string; description: string; amount: number; currency: string; reference: string };
type CsvRow = { date: string; description: string; amount: number; reference: string };

function parseSimpleCsv(text: string): CsvRow[] {
  const lines = text.trim().split("\n").filter(l => l.trim());
  const header = lines[0].toLowerCase().split(",").map(h => h.trim().replace(/"/g, ""));
  return lines.slice(1).map(line => {
    const vals = line.split(",").map(v => v.trim().replace(/"/g, ""));
    const obj: any = {};
    header.forEach((h, i) => obj[h] = vals[i] ?? "");
    return { date: obj.date, description: obj.description, amount: Number(obj.amount), reference: obj.reference ?? "" };
  }).filter(r => r.date && !isNaN(r.amount));
}

export default function BankPage() {
  const { data: transactions, refetch } = useGetBank();
  const createTxn = useCreateBankTransaction();
  const matchTxn = useMatchBankTransaction();
  const unmatchTxn = useUnmatchBankTransaction();
  const importTxns = useImportBankTransactions();
  const [showModal, setShowModal] = useState(false);
  const [filterMatched, setFilterMatched] = useState<"all" | "unmatched" | "matched">("all");

  const { register, handleSubmit, reset } = useForm<TxnForm>({ defaultValues: { currency: "MGA" } });

  const onSubmit = async (data: TxnForm) => {
    await createTxn.mutateAsync({ data: { date: data.date, description: data.description, amount: Number(data.amount), currency: data.currency, reference: data.reference || undefined } });
    setShowModal(false);
    reset({ currency: "MGA" });
    refetch();
  };

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const rows = parseSimpleCsv(text);
    if (rows.length === 0) { alert("Aucune ligne valide dans le CSV"); return; }
    await importTxns.mutateAsync({ data: { rows } });
    refetch();
    e.target.value = "";
  };

  const filtered = (transactions ?? []).filter(t => {
    if (filterMatched === "unmatched") return !t.matched;
    if (filterMatched === "matched") return t.matched;
    return true;
  });

  const total = filtered.reduce((s, t) => s + t.amount, 0);
  const unmatchedCount = (transactions ?? []).filter(t => !t.matched).length;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Rapprochement bancaire</h1>
          <p className="text-gray-500 text-sm mt-1">
            {unmatchedCount} transaction(s) non rapprochée(s)
          </p>
        </div>
        <div className="flex gap-2">
          <label className="px-4 py-2 border border-gray-300 rounded-lg text-sm cursor-pointer hover:bg-gray-50 font-medium text-gray-700">
            {importTxns.isPending ? "Import…" : "Import CSV"}
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleCsvUpload} />
          </label>
          <button onClick={() => { reset({ currency: "MGA" }); setShowModal(true); }} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium">
            + Ajouter
          </button>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 text-sm text-blue-700">
        Format CSV attendu : <code className="font-mono text-xs bg-blue-100 px-1 rounded">date,description,amount,reference</code> (date: YYYY-MM-DD, montant positif = crédit, négatif = débit)
      </div>

      <div className="flex gap-2 mb-4">
        {[["all", "Toutes"], ["unmatched", "Non rapprochées"], ["matched", "Rapprochées"]].map(([v, l]) => (
          <button key={v} onClick={() => setFilterMatched(v as any)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${filterMatched === v ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
            {l}
          </button>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {["Date", "Description", "Référence", "Montant", "Statut", "Action"].map(h => (
                <th key={h} className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12 text-gray-400">Aucune transaction bancaire</td></tr>
            ) : filtered.map(t => (
              <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 text-xs text-gray-500">{new Date(t.date).toLocaleDateString("fr-FR")}</td>
                <td className="px-4 py-3 text-gray-700 max-w-[200px] truncate" title={t.description}>{t.description}</td>
                <td className="px-4 py-3 font-mono text-xs text-gray-400">{t.reference ?? "—"}</td>
                <td className={`px-4 py-3 font-mono text-sm font-semibold ${t.amount >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                  {t.amount >= 0 ? "+" : ""}{t.amount.toLocaleString("fr-FR")} {t.currency}
                </td>
                <td className="px-4 py-3">
                  {t.matched
                    ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">Rapproché</span>
                    : <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">En attente</span>}
                </td>
                <td className="px-4 py-3">
                  {t.matched
                    ? <button onClick={async () => { await unmatchTxn.mutateAsync({ id: t.id }); refetch(); }} className="text-xs text-gray-500 hover:text-red-600">Annuler</button>
                    : <button onClick={async () => { await matchTxn.mutateAsync({ id: t.id, data: { matchedRef: "manual" } }); refetch(); }} className="text-xs text-emerald-600 hover:underline font-medium">Rapprocher</button>}
                </td>
              </tr>
            ))}
          </tbody>
          {filtered.length > 0 && (
            <tfoot className="bg-gray-50 border-t border-gray-200">
              <tr>
                <td colSpan={3} className="px-4 py-2 text-xs text-gray-500 font-medium">Solde filtré</td>
                <td className={`px-4 py-2 font-bold font-mono text-sm ${total >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                  {total >= 0 ? "+" : ""}{total.toLocaleString("fr-FR")} MGA
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex justify-between items-center p-5 border-b">
              <h2 className="text-lg font-semibold text-gray-800">Nouvelle transaction</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
                  <input type="date" {...register("date", { required: true })} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Montant *</label>
                  <input type="number" step="0.01" {...register("amount", { required: true })} placeholder="+ crédit / - débit" className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
                <input {...register("description", { required: true })} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Devise</label>
                  <select {...register("currency")} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none">
                    {["MGA", "USD", "EUR"].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Référence</label>
                  <input {...register("reference")} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Annuler</button>
                <button type="submit" className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700">Ajouter</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
