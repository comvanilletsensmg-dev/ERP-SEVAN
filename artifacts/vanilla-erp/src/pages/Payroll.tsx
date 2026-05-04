import { useState } from "react";
import { useGetPayrolls, useGeneratePayroll, useGetEmployees } from "@workspace/api-client-react";
import { PayrollRecord } from "@workspace/api-zod";
import { useForm } from "react-hook-form";
import { FileText, Download, RefreshCw } from "lucide-react";

const MONTHS = Array.from({ length: 12 }, (_, i) => {
  const d = new Date(2026, i, 1);
  return { value: `2026-${String(i + 1).padStart(2, "0")}`, label: d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }) };
});

function formatMga(n: number) { return Math.round(n).toLocaleString("fr-FR") + " MGA"; }

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

type FormData = { employeeId: string; month: string; heuresSup: number };

export default function PayrollPage() {
  const [filterMonth, setFilterMonth] = useState(MONTHS[3].value);
  const { data: payrolls, isLoading, refetch } = useGetPayrolls({ month: filterMonth });
  const { data: employees } = useGetEmployees();
  const generatePayroll = useGeneratePayroll();
  const [showModal, setShowModal] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [error, setError] = useState("");

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    defaultValues: { month: filterMonth, heuresSup: 0 },
  });

  const totalNet = (payrolls ?? []).reduce((a, p) => a + p.netSalary, 0);
  const totalCnaps = (payrolls ?? []).reduce((a, p) => a + (p.cnapsEmp ?? 0), 0);
  const totalOstie = (payrolls ?? []).reduce((a, p) => a + (p.ostieEmp ?? 0), 0);
  const totalIrsa = (payrolls ?? []).reduce((a, p) => a + (p.irsa ?? 0), 0);

  const onSubmit = async (data: FormData) => {
    setError("");
    try {
      await fetch("/api/payroll", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: data.employeeId, month: data.month, heuresSup: Number(data.heuresSup ?? 0) }),
      }).then(async (r) => {
        if (!r.ok) { const j = await r.json(); throw new Error(j.error); }
        return r.json();
      });
      setShowModal(false);
      setFilterMonth(data.month);
      refetch();
    } catch (e: any) {
      setError(e?.message ?? "Erreur lors de la génération");
    }
  };

  const handleBatch = async () => {
    setBatchLoading(true);
    setError("");
    try {
      const r = await fetch("/api/payroll/batch", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: filterMonth }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      refetch();
      alert(`Paie batch : ${j.created} créée(s), ${j.skipped} ignorée(s)`);
    } catch (e: any) {
      setError(e?.message ?? "Erreur batch");
    } finally {
      setBatchLoading(false);
    }
  };

  const openPdf = (id: string) => {
    window.open(`/api/payroll/${id}/pdf`, "_blank");
  };

  const exportDeclaration = (type: "cnaps" | "ostie" | "irsa") => {
    window.open(`/api/hr/declarations/${type}?month=${filterMonth}`, "_blank");
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Fiche de Paie Madagascar</h1>
          <p className="text-gray-500 text-sm mt-1">
            {payrolls?.length ?? 0} fiche(s) — Net total : <span className="font-semibold text-emerald-700">{formatMga(totalNet)}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
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
          <button onClick={handleBatch} disabled={batchLoading} className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 flex items-center gap-1 disabled:opacity-50">
            {batchLoading ? <RefreshCw className="h-3 w-3 animate-spin" /> : null} Batch tous actifs
          </button>
        </div>
      </div>

      {/* Résumé charges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
        {[
          { label: "Salaires de base", value: formatMga((payrolls ?? []).reduce((a, p) => a + p.salaryBase, 0)) },
          { label: "CNAPS salarié (1%)", value: formatMga(totalCnaps), color: "text-orange-600" },
          { label: "OSTIE salarié (1%)", value: formatMga(totalOstie), color: "text-orange-600" },
          { label: "IRSA", value: formatMga(totalIrsa), color: "text-red-600" },
        ].map((c) => (
          <div key={c.label} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <div className={`text-base font-semibold ${c.color ?? "text-gray-800"}`}>{c.value}</div>
            <div className="text-xs text-gray-500 mt-1">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Déclarations export */}
      <div className="flex flex-wrap gap-2 mb-5">
        <span className="text-sm text-gray-500 self-center">Déclarations :</span>
        {(["cnaps", "ostie", "irsa"] as const).map((t) => (
          <button key={t} onClick={() => exportDeclaration(t)}
            className="flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 font-medium uppercase">
            <Download className="h-3 w-3" /> {t.toUpperCase()} CSV
          </button>
        ))}
      </div>

      {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}

      {isLoading ? (
        <div className="text-center py-16 text-gray-400">Chargement…</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {["Employé", "Matricule", "Base", "Primes", "Hres Sup", "CNAPS", "OSTIE", "IRSA", "Déductions", "Net à payer", "Bulletin"].map((h) => (
                  <th key={h} className="text-left px-3 py-3 font-medium text-gray-600 text-xs uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(payrolls ?? []).length === 0 ? (
                <tr><td colSpan={11} className="text-center py-12 text-gray-400">Aucune fiche de paie pour ce mois</td></tr>
              ) : (
                (payrolls ?? []).map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-3 font-medium text-gray-800">{p.employee?.name ?? p.employeeId}</td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-500">{(p.employee as any)?.matricule ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{formatMga(p.salaryBase)}</td>
                    <td className="px-3 py-2 text-emerald-600 font-mono text-xs">{p.bonus > 0 ? "+"+formatMga(p.bonus) : "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs text-blue-600">{(p as any).heuresSup > 0 ? "+"+formatMga((p as any).heuresSup) : "—"}</td>
                    <td className="px-3 py-2 text-orange-500 font-mono text-xs">{formatMga((p as any).cnapsEmp ?? 0)}</td>
                    <td className="px-3 py-2 text-orange-500 font-mono text-xs">{formatMga((p as any).ostieEmp ?? 0)}</td>
                    <td className="px-3 py-2 text-red-500 font-mono text-xs">{formatMga((p as any).irsa ?? 0)}</td>
                    <td className="px-3 py-2 text-red-400 font-mono text-xs">{p.deductions > 0 ? formatMga(p.deductions) : "—"}</td>
                    <td className="px-3 py-2 text-emerald-700 font-bold font-mono text-xs">{formatMga(p.netSalary)}</td>
                    <td className="px-3 py-2">
                      <button onClick={() => openPdf(p.id)}
                        className="flex items-center gap-1 px-2 py-1 text-xs border rounded hover:bg-gray-50">
                        <FileText className="h-3 w-3" /> PDF
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Total net */}
      {(payrolls ?? []).length > 0 && (
        <div className="mt-4 flex justify-end">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-6 py-3 text-right">
            <div className="text-xs text-gray-500">Total net à payer</div>
            <div className="text-xl font-bold text-emerald-700">{formatMga(totalNet)}</div>
          </div>
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
                {(employees ?? []).filter(e => e.isActive).map((e) => <option key={e.id} value={e.id}>{(e as any).matricule ? `[${(e as any).matricule}] ` : ""}{e.name}</option>)}
              </select>
              {errors.employeeId && <p className="text-red-500 text-xs mt-1">Requis</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mois *</label>
              <select {...register("month", { required: true })} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none">
                {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Heures supplémentaires (MGA)</label>
              <input type="number" min={0} {...register("heuresSup")} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" placeholder="0" />
            </div>
            <div className="bg-blue-50 rounded-lg px-3 py-2 text-xs text-blue-700 space-y-1">
              <p>• CNAPS salarié : 1% du brut</p>
              <p>• OSTIE salarié : 1% du brut</p>
              <p>• IRSA : barème progressif DGI Madagascar</p>
              <p>• Absences déduites automatiquement (pointage)</p>
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
                Annuler
              </button>
              <button type="submit" className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700">
                Générer
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
