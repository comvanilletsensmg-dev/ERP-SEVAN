import { useState } from "react";
import { useGetPayrolls, useGeneratePayroll, useGetEmployees } from "@workspace/api-client-react";
import { PayrollRecord } from "@workspace/api-zod";
import { useForm } from "react-hook-form";

const MONTHS = Array.from({ length: 12 }, (_, i) => {
  const d = new Date(2026, i, 1);
  return { value: `2026-${String(i + 1).padStart(2, "0")}`, label: d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }) };
});

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

type FormData = { employeeId: string; month: string };

export default function PayrollPage() {
  const [filterMonth, setFilterMonth] = useState(MONTHS[3].value);
  const { data: payrolls, isLoading, refetch } = useGetPayrolls({ month: filterMonth });
  const { data: employees } = useGetEmployees();
  const generatePayroll = useGeneratePayroll();
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState("");

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    defaultValues: { month: filterMonth },
  });

  const totalNet = (payrolls ?? []).reduce((a, p) => a + p.netSalary, 0);

  const onSubmit = async (data: FormData) => {
    setError("");
    try {
      await generatePayroll.mutateAsync({ data: { employeeId: data.employeeId, month: data.month } });
      setShowModal(false);
      setFilterMonth(data.month);
      refetch();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? "Erreur lors de la génération");
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Fiche de Paie</h1>
          <p className="text-gray-500 text-sm mt-1">
            {payrolls?.length ?? 0} fiche(s) — Total net : <span className="font-semibold text-emerald-700">{formatMga(totalNet)}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <select
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <button onClick={() => setShowModal(true)} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium">
            + Générer paie
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total salaires de base", value: formatMga((payrolls ?? []).reduce((a, p) => a + p.salaryBase, 0)) },
          { label: "Total primes production", value: formatMga((payrolls ?? []).reduce((a, p) => a + p.bonus, 0)), color: "text-emerald-600" },
          { label: "Total déductions", value: formatMga((payrolls ?? []).reduce((a, p) => a + p.deductions, 0)), color: "text-red-500" },
          { label: "Total net à payer", value: formatMga(totalNet), color: "text-emerald-700 font-bold" },
        ].map((c) => (
          <div key={c.label} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <div className={`text-lg font-semibold ${c.color ?? "text-gray-800"}`}>{c.value}</div>
            <div className="text-xs text-gray-500 mt-1">{c.label}</div>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-gray-400">Chargement…</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {["Employé", "Salaire base", "Primes", "Déductions", "Charges (CNAPS+OSTIE)", "Net à payer"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(payrolls ?? []).length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-gray-400">Aucune fiche de paie pour ce mois</td></tr>
              ) : (
                (payrolls ?? []).map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-800">{p.employee?.name ?? p.employeeId}</td>
                    <td className="px-4 py-3 text-gray-700 font-mono text-xs">{formatMga(p.salaryBase)}</td>
                    <td className="px-4 py-3 text-emerald-600 font-mono text-xs font-medium">{p.bonus > 0 ? "+"+formatMga(p.bonus) : "—"}</td>
                    <td className="px-4 py-3 text-red-500 font-mono text-xs">{p.deductions > 0 ? "-"+formatMga(p.deductions) : "—"}</td>
                    <td className="px-4 py-3 text-orange-500 font-mono text-xs">-{formatMga(p.charges)}</td>
                    <td className="px-4 py-3 text-emerald-700 font-bold font-mono text-xs">{formatMga(p.netSalary)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <Modal title="Générer une fiche de paie" onClose={() => setShowModal(false)}>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Mois *</label>
              <select {...register("month", { required: true })} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none">
                {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <p className="text-xs text-gray-500 bg-blue-50 rounded-lg px-3 py-2">
              Le calcul inclut : salaire de base + primes production du mois − absences − CNAPS/OSTIE (2%)
            </p>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
                Annuler
              </button>
              <button type="submit" disabled={generatePayroll.isPending} className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
                {generatePayroll.isPending ? "Calcul…" : "Générer"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
