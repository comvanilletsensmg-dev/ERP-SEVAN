import { useState } from "react";
import { useGetHrRequests, useCreateHrRequest, useUpdateHrRequest, useGetEmployees } from "@workspace/api-client-react";
import { CreateHrRequestBody } from "@workspace/api-zod";
import { useForm } from "react-hook-form";

const STATUS_COLORS: Record<string, string> = {
  pending:  "bg-yellow-100 text-yellow-700",
  approved: "bg-emerald-100 text-emerald-700",
};

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  leave:   { label: "Congé",   color: "bg-blue-100 text-blue-700" },
  advance: { label: "Avance",  color: "bg-purple-100 text-purple-700" },
  issue:   { label: "Problème", color: "bg-red-100 text-red-700" },
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

type FormData = { employeeId: string; type: string; description: string };

export default function HrRequestsPage() {
  const { data: requests, isLoading, refetch } = useGetHrRequests();
  const { data: employees } = useGetEmployees();
  const createRequest = useCreateHrRequest();
  const updateRequest = useUpdateHrRequest();
  const [showModal, setShowModal] = useState(false);
  const [filterType, setFilterType] = useState("all");

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>();

  const onSubmit = async (data: FormData) => {
    const body: CreateHrRequestBody = { employeeId: data.employeeId, type: data.type, description: data.description };
    await createRequest.mutateAsync({ data: body });
    setShowModal(false);
    reset();
    refetch();
  };

  const handleApprove = async (id: string) => {
    await updateRequest.mutateAsync({ id, data: { status: "approved" } });
    refetch();
  };

  const filtered = (requests ?? []).filter((r) => filterType === "all" || r.type === filterType);
  const pendingCount = (requests ?? []).filter((r) => r.status === "pending").length;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Demandes RH</h1>
          <p className="text-gray-500 text-sm mt-1">{pendingCount} demande(s) en attente</p>
        </div>
        <button onClick={() => { reset(); setShowModal(true); }} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium">
          + Nouvelle demande
        </button>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {["all", "leave", "advance", "issue"].map((t) => (
          <button
            key={t}
            onClick={() => setFilterType(t)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${filterType === t ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}
          >
            {t === "all" ? "Toutes" : TYPE_LABELS[t]?.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-gray-400">Chargement…</div>
      ) : (
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-gray-400">Aucune demande</div>
          ) : (
            filtered.map((req) => {
              const typeInfo = TYPE_LABELS[req.type] ?? { label: req.type, color: "bg-gray-100 text-gray-600" };
              const statusColor = STATUS_COLORS[req.status] ?? "bg-gray-100 text-gray-600";
              return (
                <div key={req.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${typeInfo.color}`}>{typeInfo.label}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor}`}>
                          {req.status === "pending" ? "En attente" : "Approuvé"}
                        </span>
                      </div>
                      <p className="font-medium text-gray-800">{req.employee?.name ?? req.employeeId}</p>
                      <p className="text-sm text-gray-600 mt-1">{req.description}</p>
                      <p className="text-xs text-gray-400 mt-2">{new Date(req.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</p>
                    </div>
                    {req.status === "pending" && (
                      <button onClick={() => handleApprove(req.id)} className="px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-medium hover:bg-emerald-200 whitespace-nowrap">
                        Approuver
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {showModal && (
        <Modal title="Nouvelle demande RH" onClose={() => setShowModal(false)}>
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
                <option value="leave">Congé</option>
                <option value="advance">Avance sur salaire</option>
                <option value="issue">Problème / réclamation</option>
              </select>
              {errors.type && <p className="text-red-500 text-xs mt-1">Requis</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
              <textarea
                {...register("description", { required: true })}
                rows={4}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none resize-none"
                placeholder="Décrivez votre demande…"
              />
              {errors.description && <p className="text-red-500 text-xs mt-1">Requis</p>}
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
                Annuler
              </button>
              <button type="submit" disabled={createRequest.isPending} className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
                Soumettre
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
