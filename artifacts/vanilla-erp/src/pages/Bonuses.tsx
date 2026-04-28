import { useState } from "react";
import { useGetBonuses, useCreateBonus, useGetEmployees } from "@workspace/api-client-react";
import { CreateBonusBody } from "@workspace/api-zod";
import { useForm } from "react-hook-form";

function formatMga(n: number) {
  return n.toLocaleString("fr-FR") + " MGA";
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex justify-between items-center p-5 border-b">
          <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

type FormData = { employeeId: string; lotId: string; quantity: number; rate: number };

export default function BonusesPage() {
  const { data: bonuses, isLoading, refetch } = useGetBonuses({});
  const { data: employees } = useGetEmployees();
  const createBonus = useCreateBonus();
  const [showModal, setShowModal] = useState(false);
  const [filterEmp, setFilterEmp] = useState("all");
  const [lotIdInput, setLotIdInput] = useState("");
  const [error, setError] = useState("");

  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<FormData>({
    defaultValues: { rate: 2000 },
  });

  const watchQty = watch("quantity");
  const watchRate = watch("rate");
  const previewAmount = (Number(watchQty) || 0) * (Number(watchRate) || 0);

  const onSubmit = async (data: FormData) => {
    setError("");
    try {
      await createBonus.mutateAsync({
        data: {
          employeeId: data.employeeId,
          lotId: data.lotId || lotIdInput,
          quantity: Number(data.quantity),
          rate: Number(data.rate),
        } as CreateBonusBody,
      });
      setShowModal(false);
      reset({ rate: 2000 });
      refetch();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? "Erreur");
    }
  };

  const filtered = (bonuses ?? []).filter((b) => filterEmp === "all" || b.employeeId === filterEmp);
  const totalBonus = filtered.reduce((a, b) => a + b.amount, 0);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Primes Production</h1>
          <p className="text-gray-500 text-sm mt-1">
            {filtered.length} prime(s) — Total : <span className="font-semibold text-emerald-700">{formatMga(totalBonus)}</span>
          </p>
        </div>
        <button onClick={() => { setError(""); reset({ rate: 2000 }); setShowModal(true); }} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium">
          + Attribuer une prime
        </button>
      </div>

      <div className="mb-4">
        <select value={filterEmp} onChange={(e) => setFilterEmp(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
          <option value="all">Tous les employés</option>
          {(employees ?? []).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-gray-400">Chargement…</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {["Employé", "Lot vanille", "Quantité traitée", "Taux MGA/kg", "Prime", "Date"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-gray-400">Aucune prime enregistrée</td></tr>
              ) : (
                filtered.map((b) => (
                  <tr key={b.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-800">{b.employee?.name ?? b.employeeId}</td>
                    <td className="px-4 py-3 font-mono text-xs text-blue-700">{(b.lot as any)?.code ?? b.lotId.slice(0, 8) + "…"}</td>
                    <td className="px-4 py-3 text-gray-700 font-mono">{b.quantity} kg</td>
                    <td className="px-4 py-3 text-gray-600 font-mono text-xs">{formatMga(b.rate)}</td>
                    <td className="px-4 py-3 text-emerald-700 font-bold font-mono text-xs">{formatMga(b.amount)}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{new Date(b.createdAt).toLocaleDateString("fr-FR")}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <Modal title="Attribuer une prime production" onClose={() => setShowModal(false)}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{error}</div>}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Employé *</label>
              <select {...register("employeeId", { required: true })} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none">
                <option value="">— Sélectionner —</option>
                {(employees ?? []).filter(e => e.isActive).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
              {errors.employeeId && <p className="text-red-500 text-xs mt-1">Requis</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ID du lot vanille *</label>
              <input {...register("lotId", { required: true })} placeholder="UUID du lot traité" className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none font-mono" />
              {errors.lotId && <p className="text-red-500 text-xs mt-1">Requis</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quantité (kg) *</label>
                <input type="number" step="0.1" {...register("quantity", { required: true, min: 0.1 })} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
                {errors.quantity && <p className="text-red-500 text-xs mt-1">Requis</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Taux (MGA/kg) *</label>
                <input type="number" {...register("rate", { required: true, min: 1 })} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
                {errors.rate && <p className="text-red-500 text-xs mt-1">Requis</p>}
              </div>
            </div>
            {previewAmount > 0 && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-sm text-emerald-700 font-medium text-center">
                Prime calculée : {formatMga(previewAmount)}
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
                Annuler
              </button>
              <button type="submit" disabled={createBonus.isPending} className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
                Attribuer
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
