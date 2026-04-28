import { useState } from "react";
import { useGetInvoices, useCreateInvoice, useValidateInvoice, usePayInvoice, useGetPartners } from "@workspace/api-client-react";
import { useForm } from "react-hook-form";

type InvoiceForm = { invoiceNumber: string; partnerId: string; type: string; currency: string; amountHT: number; tvaRate: number; dueDate: string; notes: string };

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft:     { label: "Brouillon", color: "bg-gray-100 text-gray-600" },
  validated: { label: "Validée",   color: "bg-blue-100 text-blue-700" },
  paid:      { label: "Payée",     color: "bg-emerald-100 text-emerald-700" },
};

function fmt(n: number) { return n.toLocaleString("fr-FR"); }

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
        <div className="flex justify-between items-center p-5 border-b">
          <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export default function InvoicesPage() {
  const { data: invoices, refetch, isLoading } = useGetInvoices({});
  const { data: partners } = useGetPartners();
  const createInvoice = useCreateInvoice();
  const validateInvoice = useValidateInvoice();
  const payInvoice = usePayInvoice();
  const [showModal, setShowModal] = useState(false);
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [error, setError] = useState("");

  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<InvoiceForm>({ defaultValues: { type: "sale", currency: "MGA", tvaRate: 20 } });

  const watchHT = watch("amountHT");
  const watchRate = watch("tvaRate");
  const tvaPreview = (Number(watchHT) || 0) * (Number(watchRate) || 0) / 100;
  const ttcPreview = (Number(watchHT) || 0) + tvaPreview;

  const onSubmit = async (data: InvoiceForm) => {
    setError("");
    try {
      await createInvoice.mutateAsync({ data: { invoiceNumber: data.invoiceNumber, partnerId: data.partnerId, type: data.type, currency: data.currency, amountHT: Number(data.amountHT), tvaRate: Number(data.tvaRate), dueDate: data.dueDate || undefined, notes: data.notes || undefined } });
      setShowModal(false);
      reset({ type: "sale", currency: "MGA", tvaRate: 20 });
      refetch();
    } catch (e: any) { setError(e?.response?.data?.error ?? "Erreur"); }
  };

  const handleValidate = async (id: string) => {
    await validateInvoice.mutateAsync({ id });
    refetch();
  };

  const handlePay = async (id: string) => {
    await payInvoice.mutateAsync({ id });
    refetch();
  };

  const filtered = (invoices ?? []).filter(i => {
    if (filterType !== "all" && i.type !== filterType) return false;
    if (filterStatus !== "all" && i.status !== filterStatus) return false;
    return true;
  });

  const totalTTC = filtered.reduce((s, i) => s + i.amountTTC, 0);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Factures</h1>
          <p className="text-gray-500 text-sm mt-1">{filtered.length} facture(s) · Total TTC : <span className="font-semibold text-emerald-700">{fmt(totalTTC)} MGA</span></p>
        </div>
        <button onClick={() => { setError(""); reset({ type: "sale", currency: "MGA", tvaRate: 20 }); setShowModal(true); }} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium">
          + Nouvelle facture
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {[["all", "Toutes"], ["sale", "Ventes"], ["purchase", "Achats"]].map(([v, l]) => (
          <button key={v} onClick={() => setFilterType(v)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${filterType === v ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>{l}</button>
        ))}
        <span className="border-l border-gray-200 mx-1" />
        {[["all", "Tout statut"], ["draft", "Brouillon"], ["validated", "Validées"], ["paid", "Payées"]].map(([v, l]) => (
          <button key={v} onClick={() => setFilterStatus(v)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${filterStatus === v ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>{l}</button>
        ))}
      </div>

      {isLoading ? <div className="text-center py-16 text-gray-400">Chargement…</div> : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {["N° Facture", "Tiers", "Type", "Montant HT", "TVA", "Total TTC", "Échéance", "Statut", "Actions"].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-12 text-gray-400">Aucune facture</td></tr>
              ) : filtered.map(inv => {
                const st = STATUS_MAP[inv.status] ?? STATUS_MAP.draft;
                return (
                  <tr key={inv.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-700">{inv.invoiceNumber}</td>
                    <td className="px-4 py-3 text-gray-800">{(inv as any).partner?.name ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${inv.type === "sale" ? "bg-emerald-100 text-emerald-700" : "bg-orange-100 text-orange-700"}`}>
                        {inv.type === "sale" ? "Vente" : "Achat"}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{fmt(inv.amountHT)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{fmt(inv.tvaMontant)} ({inv.tvaRate}%)</td>
                    <td className="px-4 py-3 font-mono text-sm font-semibold text-gray-800">{fmt(inv.amountTTC)}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{inv.dueDate ? new Date(inv.dueDate).toLocaleDateString("fr-FR") : "—"}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${st.color}`}>{st.label}</span></td>
                    <td className="px-4 py-3 flex gap-1.5">
                      {inv.status === "draft" && (
                        <button onClick={() => handleValidate(inv.id)} className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium hover:bg-blue-200">Valider</button>
                      )}
                      {inv.status === "validated" && (
                        <button onClick={() => handlePay(inv.id)} className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded text-xs font-medium hover:bg-emerald-200">Payer</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <Modal title="Nouvelle facture" onClose={() => setShowModal(false)}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
            {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{error}</div>}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">N° Facture *</label>
                <input {...register("invoiceNumber", { required: true })} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
                {errors.invoiceNumber && <p className="text-red-500 text-xs mt-1">Requis</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
                <select {...register("type")} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none">
                  <option value="sale">Vente</option>
                  <option value="purchase">Achat</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Tiers *</label>
                <select {...register("partnerId", { required: true })} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none">
                  <option value="">— Sélectionner —</option>
                  {(partners ?? []).map(p => <option key={p.id} value={p.id}>{p.name} ({p.type === "client" ? "Client" : "Fournisseur"})</option>)}
                </select>
                {errors.partnerId && <p className="text-red-500 text-xs mt-1">Requis</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Montant HT *</label>
                <input type="number" step="1" {...register("amountHT", { required: true, min: 0 })} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Taux TVA (%)</label>
                <select {...register("tvaRate")} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none">
                  <option value={20}>20% (standard)</option>
                  <option value={0}>0% (export)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Devise</label>
                <select {...register("currency")} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none">
                  {["MGA", "USD", "EUR"].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Échéance</label>
                <input type="date" {...register("dueDate")} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
              </div>
            </div>
            {ttcPreview > 0 && (
              <div className="bg-gray-50 rounded-lg px-3 py-2 text-xs font-mono space-y-0.5">
                <div className="flex justify-between"><span className="text-gray-500">TVA ({watchRate}%) :</span><span>{fmt(tvaPreview)} MGA</span></div>
                <div className="flex justify-between font-semibold text-gray-800"><span>Total TTC :</span><span>{fmt(ttcPreview)} MGA</span></div>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea {...register("notes")} rows={2} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none resize-none" />
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Annuler</button>
              <button type="submit" disabled={createInvoice.isPending} className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
                Créer
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
