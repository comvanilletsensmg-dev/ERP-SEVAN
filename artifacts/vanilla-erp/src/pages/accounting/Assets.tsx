import { useState } from "react";
import { useGetAssets, useCreateAsset, useDepreciateAsset } from "@workspace/api-client-react";
import { useForm } from "react-hook-form";

type AssetForm = { name: string; category: string; value: number; residualValue: number; startDate: string; durationMonths: number; currency: string; notes: string };

const CATEGORIES: Record<string, string> = { equipment: "Équipement", vehicle: "Véhicule", building: "Bâtiment", other: "Autre" };

function formatMga(n: number) { return n.toLocaleString("fr-FR"); }

export default function AssetsPage() {
  const { data: assets, refetch } = useGetAssets();
  const createAsset = useCreateAsset();
  const depreciateAsset = useDepreciateAsset();
  const [showModal, setShowModal] = useState(false);
  const [depreciating, setDepreciating] = useState<string | null>(null);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<AssetForm>({ defaultValues: { currency: "MGA", residualValue: 0, category: "equipment" } });

  const onSubmit = async (data: AssetForm) => {
    await createAsset.mutateAsync({ data: { name: data.name, category: data.category, value: Number(data.value), residualValue: Number(data.residualValue ?? 0), startDate: data.startDate, durationMonths: Number(data.durationMonths), currency: data.currency, notes: data.notes || undefined, status: "active" } });
    setShowModal(false);
    reset({ currency: "MGA", residualValue: 0, category: "equipment" });
    refetch();
  };

  const handleDepreciate = async (id: string) => {
    setDepreciating(id);
    try {
      await depreciateAsset.mutateAsync({ id });
      refetch();
    } finally { setDepreciating(null); }
  };

  const totalNetValue = (assets ?? []).reduce((s, a) => s + (a.value - a.accumulatedDepreciation), 0);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Immobilisations</h1>
          <p className="text-gray-500 text-sm mt-1">Valeur nette totale : <span className="font-semibold text-emerald-700">{formatMga(totalNetValue)} MGA</span></p>
        </div>
        <button onClick={() => { reset({ currency: "MGA", residualValue: 0, category: "equipment" }); setShowModal(true); }} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium">
          + Nouvel actif
        </button>
      </div>

      <div className="grid gap-4">
        {(assets ?? []).length === 0 && (
          <div className="text-center py-16 text-gray-400 bg-white border border-gray-200 rounded-xl">Aucune immobilisation enregistrée</div>
        )}
        {(assets ?? []).map(a => {
          const netValue = a.value - a.accumulatedDepreciation;
          const pctDepreciated = a.value > 0 ? (a.accumulatedDepreciation / a.value) * 100 : 0;
          const monthlyRate = a.value > 0 ? ((a.value - a.residualValue) / a.durationMonths) : 0;
          return (
            <div key={a.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-semibold text-gray-800">{a.name}</p>
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{CATEGORIES[a.category] ?? a.category}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${a.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                      {a.status === "active" ? "Actif" : a.status === "fully_depreciated" ? "Amorti" : "Cédé"}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2 text-xs">
                    <div><span className="text-gray-500">Valeur acquis. :</span><br/><span className="font-mono font-medium">{formatMga(a.value)} {a.currency}</span></div>
                    <div><span className="text-gray-500">Amort. cumulé :</span><br/><span className="font-mono font-medium text-orange-600">{formatMga(a.accumulatedDepreciation)} {a.currency}</span></div>
                    <div><span className="text-gray-500">Valeur nette :</span><br/><span className="font-mono font-bold text-emerald-700">{formatMga(netValue)} {a.currency}</span></div>
                    <div><span className="text-gray-500">Durée / Mensuel :</span><br/><span className="font-mono">{a.durationMonths} mois · {formatMga(monthlyRate)}</span></div>
                  </div>
                  <div className="mt-2">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>Progression amortissement</span><span>{pctDepreciated.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div className="bg-orange-400 h-1.5 rounded-full transition-all" style={{ width: `${Math.min(100, pctDepreciated)}%` }} />
                    </div>
                  </div>
                </div>
                {a.status === "active" && (
                  <button onClick={() => handleDepreciate(a.id)} disabled={depreciating === a.id}
                    className="shrink-0 px-3 py-2 bg-orange-100 text-orange-700 rounded-lg text-xs font-medium hover:bg-orange-200 disabled:opacity-50 whitespace-nowrap">
                    {depreciating === a.id ? "…" : "Dotation mensuelle"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
            <div className="flex justify-between items-center p-5 border-b">
              <h2 className="text-lg font-semibold text-gray-800">Nouvelle immobilisation</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Désignation *</label>
                <input {...register("name", { required: true })} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
                {errors.name && <p className="text-red-500 text-xs mt-1">Requis</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Catégorie</label>
                  <select {...register("category")} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none">
                    {Object.entries(CATEGORIES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Devise</label>
                  <select {...register("currency")} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none">
                    {["MGA", "USD", "EUR"].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Valeur d'acquisition *</label>
                  <input type="number" step="1" {...register("value", { required: true, min: 1 })} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
                  {errors.value && <p className="text-red-500 text-xs mt-1">Requis</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Valeur résiduelle</label>
                  <input type="number" step="1" {...register("residualValue")} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date de mise en service *</label>
                  <input type="date" {...register("startDate", { required: true })} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
                  {errors.startDate && <p className="text-red-500 text-xs mt-1">Requis</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Durée (mois) *</label>
                  <input type="number" {...register("durationMonths", { required: true, min: 1 })} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
                  {errors.durationMonths && <p className="text-red-500 text-xs mt-1">Requis</p>}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea {...register("notes")} rows={2} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none resize-none" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Annuler</button>
                <button type="submit" className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700">Créer</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
