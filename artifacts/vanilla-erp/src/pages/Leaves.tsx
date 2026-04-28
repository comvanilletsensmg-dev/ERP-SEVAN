import { useState } from "react";
import { useGetLeaves, useCreateLeave, useApproveLeave, useGetEmployees } from "@workspace/api-client-react";
import { CreateLeaveBody } from "@workspace/api-zod";
import { useForm } from "react-hook-form";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:  { label: "En attente",  color: "bg-yellow-100 text-yellow-700" },
  approved: { label: "Approuvé",    color: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "Rejeté",      color: "bg-red-100 text-red-700" },
};

const TYPE_LABELS: Record<string, string> = {
  vacation: "Congé annuel",
  sick:     "Congé maladie",
};

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

type FormData = { employeeId: string; type: string; startDate: string; endDate: string };

export default function LeavesPage() {
  const { data: leaves, isLoading, refetch } = useGetLeaves();
  const { data: employees } = useGetEmployees();
  const createLeave = useCreateLeave();
  const approveLeave = useApproveLeave();
  const [showModal, setShowModal] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>();

  const onSubmit = async (data: FormData) => {
    const body: CreateLeaveBody = { employeeId: data.employeeId, type: data.type, startDate: data.startDate, endDate: data.endDate };
    await createLeave.mutateAsync({ data: body });
    setShowModal(false);
    reset();
    refetch();
  };

  const handleApprove = async (id: string, status: "approved" | "rejected") => {
    await approveLeave.mutateAsync({ id, data: { status } });
    refetch();
  };

  const filtered = (leaves ?? []).filter((l) => filterStatus === "all" || l.status === filterStatus);
  const pendingCount = (leaves ?? []).filter((l) => l.status === "pending").length;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Congés</h1>
          <p className="text-gray-500 text-sm mt-1">{pendingCount} demande(s) en attente</p>
        </div>
        <button onClick={() => { reset(); setShowModal(true); }} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium">
          + Demander un congé
        </button>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {["all", "pending", "approved", "rejected"].map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${filterStatus === s ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}
          >
            {s === "all" ? "Tous" : STATUS_LABELS[s]?.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-gray-400">Chargement…</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {["Employé", "Type", "Du", "Au", "Durée", "Statut", "Actions"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-gray-400">Aucune demande</td></tr>
              ) : (
                filtered.map((leave) => {
                  const start = new Date(leave.startDate);
                  const end = new Date(leave.endDate);
                  const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
                  const info = STATUS_LABELS[leave.status] ?? { label: leave.status, color: "bg-gray-100 text-gray-600" };
                  return (
                    <tr key={leave.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-800">{leave.employee?.name ?? leave.employeeId}</td>
                      <td className="px-4 py-3 text-gray-600">{TYPE_LABELS[leave.type] ?? leave.type}</td>
                      <td className="px-4 py-3 text-gray-600">{start.toLocaleDateString("fr-FR")}</td>
                      <td className="px-4 py-3 text-gray-600">{end.toLocaleDateString("fr-FR")}</td>
                      <td className="px-4 py-3 text-gray-500">{days}j</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${info.color}`}>{info.label}</span>
                      </td>
                      <td className="px-4 py-3">
                        {leave.status === "pending" && (
                          <div className="flex gap-1">
                            <button onClick={() => handleApprove(leave.id, "approved")} className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded text-xs font-medium hover:bg-emerald-200">
                              Approuver
                            </button>
                            <button onClick={() => handleApprove(leave.id, "rejected")} className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-medium hover:bg-red-200">
                              Rejeter
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <Modal title="Demande de congé" onClose={() => setShowModal(false)}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Employé *</label>
              <select {...register("employeeId", { required: true })} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none">
                <option value="">— Sélectionner —</option>
                {(employees ?? []).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
              {errors.employeeId && <p className="text-red-500 text-xs mt-1">Requis</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
              <select {...register("type", { required: true })} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none">
                <option value="">— Sélectionner —</option>
                <option value="vacation">Congé annuel</option>
                <option value="sick">Congé maladie</option>
              </select>
              {errors.type && <p className="text-red-500 text-xs mt-1">Requis</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date début *</label>
                <input type="date" {...register("startDate", { required: true })} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
                {errors.startDate && <p className="text-red-500 text-xs mt-1">Requis</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date fin *</label>
                <input type="date" {...register("endDate", { required: true })} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
                {errors.endDate && <p className="text-red-500 text-xs mt-1">Requis</p>}
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
                Annuler
              </button>
              <button type="submit" disabled={createLeave.isPending} className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
                Soumettre
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
