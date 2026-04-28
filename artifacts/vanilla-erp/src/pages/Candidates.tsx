import { useState } from "react";
import {
  useGetCandidates, useCreateCandidate, useUpdateCandidate,
  useGetOnboardingTasks, useCreateOnboardingTask, useUpdateOnboardingTask,
  useGetEmployees,
} from "@workspace/api-client-react";
import { CreateCandidateBody, Candidate, OnboardingTask } from "@workspace/api-zod";
import { useForm } from "react-hook-form";

const STATUS_MAP: Record<string, { label: string; color: string; next?: string; nextLabel?: string }> = {
  new:       { label: "Nouveau",      color: "bg-blue-100 text-blue-700",    next: "interview", nextLabel: "→ Entretien" },
  interview: { label: "Entretien",    color: "bg-yellow-100 text-yellow-700", next: "hired",     nextLabel: "→ Recruté" },
  hired:     { label: "Recruté",      color: "bg-emerald-100 text-emerald-700" },
  rejected:  { label: "Rejeté",       color: "bg-red-100 text-red-700" },
};

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

type CandidateForm = { name: string; position: string; phone: string; notes: string };
type OnboardingForm = { employeeId: string; title: string };

export default function CandidatesPage() {
  const [activeTab, setActiveTab] = useState<"recruitment" | "onboarding">("recruitment");
  const { data: candidates, refetch: refetchCandidates } = useGetCandidates();
  const { data: onboardingTasks, refetch: refetchOnboarding } = useGetOnboardingTasks({});
  const { data: employees } = useGetEmployees();
  const createCandidate = useCreateCandidate();
  const updateCandidate = useUpdateCandidate();
  const createTask = useCreateOnboardingTask();
  const updateTask = useUpdateOnboardingTask();
  const [showCandidateModal, setShowCandidateModal] = useState(false);
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);

  const { register: regC, handleSubmit: hsC, reset: resetC, formState: { errors: errC } } = useForm<CandidateForm>();
  const { register: regO, handleSubmit: hsO, reset: resetO, formState: { errors: errO } } = useForm<OnboardingForm>();

  const onSubmitCandidate = async (data: CandidateForm) => {
    await createCandidate.mutateAsync({ data: { name: data.name, position: data.position, phone: data.phone || null, notes: data.notes || null } });
    setShowCandidateModal(false);
    resetC();
    refetchCandidates();
  };

  const advanceStatus = async (c: Candidate) => {
    const next = STATUS_MAP[c.status]?.next;
    if (!next) return;
    await updateCandidate.mutateAsync({ id: c.id, data: { status: next } });
    refetchCandidates();
  };

  const rejectCandidate = async (id: string) => {
    await updateCandidate.mutateAsync({ id, data: { status: "rejected" } });
    refetchCandidates();
  };

  const onSubmitOnboarding = async (data: OnboardingForm) => {
    await createTask.mutateAsync({ data: { employeeId: data.employeeId, title: data.title } });
    setShowOnboardingModal(false);
    resetO();
    refetchOnboarding();
  };

  const toggleTask = async (task: OnboardingTask) => {
    const newStatus = task.status === "done" ? "pending" : "done";
    await updateTask.mutateAsync({ id: task.id, data: { status: newStatus } });
    refetchOnboarding();
  };

  const pipeline = ["new", "interview", "hired", "rejected"];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Recrutement & Onboarding</h1>
        {activeTab === "recruitment" ? (
          <button onClick={() => { resetC(); setShowCandidateModal(true); }} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium">
            + Nouveau candidat
          </button>
        ) : (
          <button onClick={() => { resetO(); setShowOnboardingModal(true); }} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium">
            + Nouvelle tâche
          </button>
        )}
      </div>

      <div className="flex border-b border-gray-200 mb-6">
        {[{ id: "recruitment", label: "Pipeline recrutement" }, { id: "onboarding", label: "Onboarding" }].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === tab.id ? "border-emerald-600 text-emerald-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "recruitment" && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {pipeline.map((status) => {
            const cols = (candidates ?? []).filter((c) => c.status === status);
            const info = STATUS_MAP[status];
            return (
              <div key={status} className="bg-gray-50 rounded-xl p-3 border border-gray-200">
                <div className="flex items-center gap-2 mb-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${info.color}`}>{info.label}</span>
                  <span className="text-xs text-gray-400 ml-auto">{cols.length}</span>
                </div>
                <div className="space-y-2">
                  {cols.length === 0 && <div className="text-xs text-gray-400 text-center py-4">Aucun</div>}
                  {cols.map((c) => (
                    <div key={c.id} className="bg-white rounded-lg p-3 border border-gray-200 shadow-sm">
                      <p className="font-medium text-gray-800 text-sm">{c.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{c.position}</p>
                      {c.phone && <p className="text-xs text-gray-400 mt-0.5">{c.phone}</p>}
                      {c.notes && <p className="text-xs text-gray-500 mt-1 italic">{c.notes}</p>}
                      <p className="text-xs text-gray-400 mt-1">{new Date(c.createdAt).toLocaleDateString("fr-FR")}</p>
                      {info.next && (
                        <div className="flex gap-1 mt-2">
                          <button onClick={() => advanceStatus(c)} className="flex-1 px-2 py-1 bg-emerald-100 text-emerald-700 rounded text-xs font-medium hover:bg-emerald-200">
                            {info.nextLabel}
                          </button>
                          <button onClick={() => rejectCandidate(c.id)} className="px-2 py-1 bg-red-100 text-red-600 rounded text-xs hover:bg-red-200">✕</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {activeTab === "onboarding" && (
        <div className="space-y-3">
          {(employees ?? []).map((emp) => {
            const tasks = (onboardingTasks ?? []).filter((t) => t.employeeId === emp.id);
            if (tasks.length === 0) return null;
            const done = tasks.filter((t) => t.status === "done").length;
            return (
              <div key={emp.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-semibold text-gray-800">{emp.name}</p>
                    <p className="text-xs text-gray-500">{emp.position}</p>
                  </div>
                  <div className="text-xs text-gray-500">{done}/{tasks.length} tâches</div>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5 mb-3">
                  <div className="bg-emerald-500 h-1.5 rounded-full transition-all" style={{ width: `${tasks.length ? (done / tasks.length) * 100 : 0}%` }} />
                </div>
                <div className="space-y-1.5">
                  {tasks.map((t) => (
                    <label key={t.id} className="flex items-center gap-2.5 cursor-pointer hover:bg-gray-50 rounded-lg px-2 py-1.5 transition-colors">
                      <input type="checkbox" checked={t.status === "done"} onChange={() => toggleTask(t)} className="w-4 h-4 accent-emerald-600 cursor-pointer" />
                      <span className={`text-sm ${t.status === "done" ? "line-through text-gray-400" : "text-gray-700"}`}>{t.title}</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
          {(onboardingTasks ?? []).length === 0 && (
            <div className="text-center py-16 text-gray-400">Aucune tâche d'onboarding créée</div>
          )}
        </div>
      )}

      {showCandidateModal && (
        <Modal title="Nouveau candidat" onClose={() => setShowCandidateModal(false)}>
          <form onSubmit={hsC(onSubmitCandidate)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
              <input {...regC("name", { required: true })} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
              {errC.name && <p className="text-red-500 text-xs mt-1">Requis</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Poste recherché *</label>
              <input {...regC("position", { required: true })} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
              {errC.position && <p className="text-red-500 text-xs mt-1">Requis</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone</label>
              <input {...regC("phone")} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea {...regC("notes")} rows={2} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none resize-none" />
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowCandidateModal(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Annuler</button>
              <button type="submit" disabled={createCandidate.isPending} className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">Ajouter</button>
            </div>
          </form>
        </Modal>
      )}

      {showOnboardingModal && (
        <Modal title="Nouvelle tâche d'onboarding" onClose={() => setShowOnboardingModal(false)}>
          <form onSubmit={hsO(onSubmitOnboarding)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Employé *</label>
              <select {...regO("employeeId", { required: true })} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none">
                <option value="">— Sélectionner —</option>
                {(employees ?? []).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
              {errO.employeeId && <p className="text-red-500 text-xs mt-1">Requis</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Titre de la tâche *</label>
              <input {...regO("title", { required: true })} placeholder="Ex: Remise du badge, Formation sécurité…" className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
              {errO.title && <p className="text-red-500 text-xs mt-1">Requis</p>}
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowOnboardingModal(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Annuler</button>
              <button type="submit" disabled={createTask.isPending} className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">Créer</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
