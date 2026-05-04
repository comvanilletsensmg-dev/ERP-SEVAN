import { useState } from "react";
import { useGetPayrolls, useGetEmployees } from "@workspace/api-client-react";
import { useForm } from "react-hook-form";
import { FileText, Download, RefreshCw, Trash2, X, ExternalLink, Printer } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

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

// ── Bulletin preview modal ────────────────────────────────────────────────────
function BulletinModal({ payrollId, employeeName, month, onClose }: {
  payrollId: string; employeeName: string; month: string; onClose: () => void;
}) {
  const pdfUrl = `/api/payroll/${payrollId}/pdf`;
  return (
    <div className="fixed inset-0 bg-black/60 flex flex-col z-50">
      {/* Top bar */}
      <div className="bg-gray-900 text-white flex items-center justify-between px-5 py-3 shrink-0 gap-4">
        <div>
          <div className="font-semibold text-sm">{employeeName}</div>
          <div className="text-xs text-gray-400">{month} — Bulletin de paie</div>
        </div>
        <div className="flex items-center gap-2">
          <a href={pdfUrl} target="_blank" rel="noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-medium transition-colors">
            <ExternalLink className="w-3.5 h-3.5" /> Ouvrir onglet
          </a>
          <button
            onClick={() => {
              const iframe = document.getElementById("payslip-iframe") as HTMLIFrameElement | null;
              iframe?.contentWindow?.print();
            }}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-xs font-semibold transition-colors">
            <Printer className="w-3.5 h-3.5" /> Imprimer / PDF
          </button>
          <button onClick={onClose}
            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      {/* iframe */}
      <div className="flex-1 overflow-hidden bg-gray-100">
        <iframe
          id="payslip-iframe"
          src={pdfUrl}
          className="w-full h-full border-0"
          title={`Bulletin ${employeeName} ${month}`}
        />
      </div>
    </div>
  );
}

type FormData = { employeeId: string; month: string; heuresSup: number };

async function apiFetch(url: string, opts?: RequestInit) {
  const r = await fetch(url, { credentials: "include", ...opts });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as any).error ?? r.statusText);
  return j;
}

export default function PayrollPage() {
  const qc = useQueryClient();
  const [filterMonth, setFilterMonth] = useState(MONTHS[3].value);
  const { data: payrolls, isLoading, refetch } = useGetPayrolls({ month: filterMonth });
  const { data: employees } = useGetEmployees();
  const [showModal, setShowModal] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string; month: string } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [previewEntry, setPreviewEntry] = useState<{ id: string; name: string; month: string } | null>(null);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    defaultValues: { month: filterMonth, heuresSup: 0 },
  });

  const totalNet   = (payrolls ?? []).reduce((a, p) => a + p.netSalary, 0);
  const totalBrut  = (payrolls ?? []).reduce((a, p) => a + p.salaryBase + p.bonus + ((p as any).heuresSup ?? 0), 0);
  const totalCnaps = (payrolls ?? []).reduce((a, p) => a + ((p as any).cnapsEmp ?? 0), 0);
  const totalOstie = (payrolls ?? []).reduce((a, p) => a + ((p as any).ostieEmp ?? 0), 0);
  const totalIrsa  = (payrolls ?? []).reduce((a, p) => a + ((p as any).irsa ?? 0), 0);

  const onSubmit = async (data: FormData) => {
    setError("");
    try {
      await apiFetch("/api/payroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: data.employeeId, month: data.month, heuresSup: Number(data.heuresSup ?? 0) }),
      });
      setShowModal(false);
      setFilterMonth(data.month);
      refetch();
      toast.success("Fiche de paie générée");
    } catch (e: any) {
      setError(e?.message ?? "Erreur lors de la génération");
    }
  };

  const handleBatch = async () => {
    setBatchLoading(true);
    setError("");
    try {
      const j = await apiFetch("/api/payroll/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: filterMonth }),
      });
      refetch();
      toast.success(`Batch paie : ${j.created} créée(s), ${j.skipped} déjà existante(s)`);
    } catch (e: any) {
      setError(e?.message ?? "Erreur batch");
    } finally {
      setBatchLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleteLoading(true);
    try {
      await apiFetch(`/api/payroll/${confirmDelete.id}`, { method: "DELETE" });
      setConfirmDelete(null);
      refetch();
      toast.success(`Fiche supprimée — ${confirmDelete.name} (${confirmDelete.month})`);
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur lors de la suppression");
    } finally {
      setDeleteLoading(false);
    }
  };

  const exportDeclaration = (type: "cnaps" | "ostie" | "irsa") =>
    window.open(`/api/hr/declarations/${type}?month=${filterMonth}`, "_blank");

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Fiches de Paie</h1>
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
          <button onClick={() => setShowModal(true)}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium">
            + Générer paie
          </button>
          <button onClick={handleBatch} disabled={batchLoading}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 flex items-center gap-1 disabled:opacity-50">
            {batchLoading ? <RefreshCw className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Batch tous actifs
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
        {[
          { label: "Salaire brut", value: formatMga(totalBrut), color: "text-gray-800" },
          { label: "CNAPS (1%)", value: formatMga(totalCnaps), color: "text-orange-600" },
          { label: "OSTIE (1%)", value: formatMga(totalOstie), color: "text-orange-600" },
          { label: "IRSA", value: formatMga(totalIrsa), color: "text-red-600" },
          { label: "Net à payer", value: formatMga(totalNet), color: "text-emerald-700 text-base" },
        ].map((c) => (
          <div key={c.label} className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
            <div className={`font-semibold ${c.color}`}>{c.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Declarations */}
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

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-16 text-gray-400">Chargement…</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {["Employé", "Matricule", "Base", "Primes", "Hres Sup", "CNAPS", "OSTIE", "IRSA", "Déductions", "Net à payer", "Actions"].map((h) => (
                  <th key={h} className="text-left px-3 py-3 font-medium text-gray-600 text-xs uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(payrolls ?? []).length === 0 ? (
                <tr><td colSpan={11} className="text-center py-12 text-gray-400">
                  Aucune fiche de paie pour ce mois — cliquez "Batch tous actifs" pour en générer
                </td></tr>
              ) : (
                (payrolls ?? []).map((p) => {
                  const empName = (p.employee as any)?.name ?? p.employeeId;
                  return (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-3 font-medium text-gray-800">{empName}</td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-500">{(p.employee as any)?.matricule ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{formatMga(p.salaryBase)}</td>
                    <td className="px-3 py-2 text-emerald-600 font-mono text-xs">{p.bonus > 0 ? "+" + formatMga(p.bonus) : "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs text-blue-600">{(p as any).heuresSup > 0 ? "+" + formatMga((p as any).heuresSup) : "—"}</td>
                    <td className="px-3 py-2 text-orange-500 font-mono text-xs">{formatMga((p as any).cnapsEmp ?? 0)}</td>
                    <td className="px-3 py-2 text-orange-500 font-mono text-xs">{formatMga((p as any).ostieEmp ?? 0)}</td>
                    <td className="px-3 py-2 text-red-500 font-mono text-xs">{formatMga((p as any).irsa ?? 0)}</td>
                    <td className="px-3 py-2 text-red-400 font-mono text-xs">{p.deductions > 0 ? formatMga(p.deductions) : "—"}</td>
                    <td className="px-3 py-2 text-emerald-700 font-bold font-mono text-xs">{formatMga(p.netSalary)}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        {/* Preview bulletin */}
                        <button
                          onClick={() => setPreviewEntry({ id: p.id, name: empName, month: p.month })}
                          className="flex items-center gap-1 px-2 py-1.5 text-xs bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium"
                          title="Prévisualiser le bulletin de paie">
                          <FileText className="h-3 w-3" /> Bulletin
                        </button>
                        {/* Open in new tab */}
                        <a href={`/api/payroll/${p.id}/pdf`} target="_blank" rel="noreferrer"
                          className="flex items-center gap-1 px-2 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                          title="Ouvrir dans un nouvel onglet">
                          <ExternalLink className="h-3 w-3" />
                        </a>
                        {/* Delete */}
                        <button
                          onClick={() => setConfirmDelete({ id: p.id, name: empName, month: p.month })}
                          className="flex items-center gap-1 px-2 py-1.5 text-xs border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                          title="Supprimer cette fiche de paie">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })
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

      {/* ── Bulletin preview modal ── */}
      {previewEntry && (
        <BulletinModal
          payrollId={previewEntry.id}
          employeeName={previewEntry.name}
          month={previewEntry.month}
          onClose={() => setPreviewEntry(null)}
        />
      )}

      {/* ── Generate payroll modal ── */}
      {showModal && (
        <Modal title="Générer une fiche de paie" onClose={() => { setShowModal(false); setError(""); }}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{error}</div>}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Employé *</label>
              <select {...register("employeeId", { required: true })} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none">
                <option value="">— Sélectionner —</option>
                {(employees ?? []).filter(e => e.isActive).map((e) => (
                  <option key={e.id} value={e.id}>
                    {(e as any).matricule ? `[${(e as any).matricule}] ` : ""}{e.name}
                  </option>
                ))}
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
              <button type="button" onClick={() => { setShowModal(false); setError(""); }} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
                Annuler
              </button>
              <button type="submit" className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700">
                Générer
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Confirm delete modal ── */}
      {confirmDelete && (
        <Modal title="Supprimer la fiche de paie ?" onClose={() => setConfirmDelete(null)}>
          <div className="space-y-4">
            <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-3 text-sm text-red-800">
              <p className="font-medium mb-1">Cette action est irréversible.</p>
              <p>Fiche de <strong>{confirmDelete.name}</strong> pour le mois de <strong>{confirmDelete.month}</strong> sera définitivement supprimée.</p>
            </div>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setConfirmDelete(null)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 font-medium">
                Annuler
              </button>
              <button onClick={handleDelete} disabled={deleteLoading}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {deleteLoading ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                Supprimer définitivement
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
