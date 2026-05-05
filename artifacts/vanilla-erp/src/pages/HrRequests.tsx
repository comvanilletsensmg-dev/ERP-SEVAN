import { useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import {
  FileText, Plus, CheckCircle2, XCircle, Clock, ChevronDown,
  Download, Eye, History, LayoutList, Settings2, X, User,
  AlertCircle, Banknote, CalendarDays, Briefcase, ClipboardList,
} from "lucide-react";

// ── API helpers ───────────────────────────────────────────────────────────────
const api = {
  get:  (url: string)              => fetch(url, { credentials: "include" }).then(r => r.json()),
  post: (url: string, body?: unknown) =>
    fetch(url, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined })
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error ?? "Erreur"); return d; }),
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface Employee { id: string; name: string; nom?: string; prenom?: string; email?: string; position?: string; matricule?: string; salary?: number; }
interface HrRequest {
  id: string; reference?: string; employeeId: string; type: string; reason?: string;
  startDate?: string; endDate?: string; amount?: number; status: string;
  managerId?: string; hrId?: string; managerComment?: string; hrComment?: string;
  createdAt: string; employee?: Employee; logs?: LogEntry[];
}
interface LogEntry { id: string; requestId: string; action: string; userId: string; userName?: string; comment?: string; createdAt: string; }
interface Stats { total: number; pending: number; managerApproved: number; hrApproved: number; rejected: number; }

// ── Constants ─────────────────────────────────────────────────────────────────
const TYPES: Record<string, { label: string; icon: React.ElementType; color: string; bg: string; desc: string }> = {
  leave:       { label: "Congé",                icon: CalendarDays,  color: "text-blue-700",   bg: "bg-blue-50 border-blue-200",   desc: "Demande d'absence ou de congé payé" },
  advance:     { label: "Avance sur salaire",   icon: Banknote,      color: "text-purple-700", bg: "bg-purple-50 border-purple-200", desc: "Avance sur le salaire du mois en cours" },
  attestation: { label: "Attestation travail",  icon: FileText,      color: "text-emerald-700",bg: "bg-emerald-50 border-emerald-200",desc: "Document officiel de travail" },
  mission:     { label: "Ordre de mission",     icon: Briefcase,     color: "text-orange-700", bg: "bg-orange-50 border-orange-200", desc: "Déplacement professionnel" },
  issue:       { label: "Réclamation",          icon: AlertCircle,   color: "text-red-700",    bg: "bg-red-50 border-red-200",      desc: "Signalement ou réclamation" },
};

const STATUSES: Record<string, { label: string; color: string; bg: string; dot: string; icon: React.ElementType }> = {
  pending:          { label: "En attente",      color: "text-amber-700",   bg: "bg-amber-50 border-amber-200",   dot: "bg-amber-400",   icon: Clock         },
  manager_approved: { label: "Validé Manager",  color: "text-blue-700",    bg: "bg-blue-50 border-blue-200",     dot: "bg-blue-500",    icon: CheckCircle2  },
  hr_approved:      { label: "Approuvé RH",     color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200",dot: "bg-emerald-500", icon: CheckCircle2  },
  rejected:         { label: "Rejeté",           color: "text-red-700",     bg: "bg-red-50 border-red-200",       dot: "bg-red-400",     icon: XCircle       },
};

const ACTION_LABELS: Record<string, string> = {
  created:          "Soumission de la demande",
  manager_approved: "Validation par le manager",
  hr_approved:      "Approbation par le service RH",
  rejected:         "Rejet de la demande",
};

function fmtDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function calcDays(start?: string, end?: string) {
  if (!start || !end) return null;
  return Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / 86400000);
}
function empName(e?: Employee) {
  if (!e) return "—";
  if (e.prenom && e.nom) return `${e.prenom} ${e.nom}`;
  return e.name ?? "—";
}

// ── Status Badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const s = STATUSES[status] ?? { label: status, color: "text-gray-700", bg: "bg-gray-50 border-gray-200", dot: "bg-gray-400", icon: Clock };
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${s.bg} ${s.color}`}>
      <Icon className="w-3 h-3" />
      {s.label}
    </span>
  );
}

// ── Type Badge ────────────────────────────────────────────────────────────────
function TypeBadge({ type }: { type: string }) {
  const t = TYPES[type] ?? { label: type, icon: FileText, color: "text-gray-700", bg: "bg-gray-50 border-gray-200" };
  const Icon = t.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${t.bg} ${t.color}`}>
      <Icon className="w-3 h-3" />
      {t.label}
    </span>
  );
}

// ── Workflow Action Modal ──────────────────────────────────────────────────────
function WorkflowModal({ request, action, onClose, onDone }: {
  request: HrRequest; action: "approve" | "reject"; onClose: () => void; onDone: () => void;
}) {
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setLoading(true);
    try {
      await api.post(`/api/hr-requests/${request.id}/${action}`, { comment: comment || undefined });
      toast.success(action === "approve" ? "Demande approuvée" : "Demande rejetée");
      onDone();
    } catch (e: any) {
      toast.error(e.message);
    } finally { setLoading(false); }
  }

  const isApprove = action === "approve";
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className={`p-5 rounded-t-2xl ${isApprove ? "bg-emerald-50" : "bg-red-50"}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isApprove
                ? <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                : <XCircle className="w-6 h-6 text-red-600" />}
              <h2 className={`text-lg font-semibold ${isApprove ? "text-emerald-800" : "text-red-800"}`}>
                {isApprove ? "Approuver la demande" : "Rejeter la demande"}
              </h2>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
          </div>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
            <div className="flex justify-between"><span className="text-gray-500">Réf.</span><span className="font-mono font-semibold">{request.reference}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Employé</span><span>{empName(request.employee)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Type</span><TypeBadge type={request.type} /></div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Commentaire {isApprove ? "(optionnel)" : "*"}
            </label>
            <textarea
              value={comment} onChange={e => setComment(e.target.value)}
              rows={3} placeholder={isApprove ? "Remarques éventuelles…" : "Motif du refus…"}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Annuler</button>
            <button
              onClick={handleSubmit} disabled={loading || (!isApprove && !comment.trim())}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 ${isApprove ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}`}
            >
              {loading ? "En cours…" : isApprove ? "Confirmer l'approbation" : "Confirmer le rejet"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Request Detail Panel ──────────────────────────────────────────────────────
function RequestDetail({ request, onClose, onAction }: {
  request: HrRequest; onClose: () => void; onAction: () => void;
}) {
  const { user } = useAuth();
  const canApprove = ["SUPER_ADMIN", "HR_MANAGER", "LOGISTICS_MANAGER"].includes(user?.role ?? "");
  const [workflow, setWorkflow] = useState<{ action: "approve"|"reject" } | null>(null);

  const days = calcDays(request.startDate, request.endDate);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-semibold text-primary">{request.reference}</span>
              <StatusBadge status={request.status} />
            </div>
            <p className="text-xs text-gray-400 mt-0.5">Soumis le {fmtDateTime(request.createdAt)}</p>
          </div>
          <button onClick={onClose} aria-label="Fermer" className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Employee */}
          <div className="bg-gray-50 rounded-xl p-4 flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <User className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-gray-800">{empName(request.employee)}</p>
              <p className="text-sm text-gray-500">{request.employee?.position ?? "—"}</p>
              <p className="text-xs text-gray-400">Matricule: {request.employee?.matricule ?? "—"}</p>
            </div>
          </div>

          {/* Type + details */}
          <div>
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Demande</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Type</p>
                <TypeBadge type={request.type} />
              </div>
              {request.type === "leave" && (
                <>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500 mb-1">Période</p>
                    <p className="text-sm font-medium">{fmtDate(request.startDate)} → {fmtDate(request.endDate)}</p>
                    {days && <p className="text-xs text-gray-400">{days} jour(s)</p>}
                  </div>
                </>
              )}
              {request.type === "advance" && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">Montant</p>
                  <p className="text-sm font-bold text-purple-700">{request.amount?.toLocaleString("fr-MG")} MGA</p>
                </div>
              )}
              {request.type === "mission" && request.startDate && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">Période mission</p>
                  <p className="text-sm font-medium">{fmtDate(request.startDate)} → {fmtDate(request.endDate)}</p>
                </div>
              )}
            </div>
            {request.reason && (
              <div className="mt-3 bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Motif</p>
                <p className="text-sm text-gray-700">{request.reason}</p>
              </div>
            )}
          </div>

          {/* Workflow timeline */}
          <div>
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Historique du workflow</h3>
            <div className="space-y-2">
              {(request.logs ?? []).map(l => (
                <div key={l.id} className="flex gap-3 items-start">
                  <div className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs
                    ${l.action === "rejected" ? "bg-red-100 text-red-600" : l.action === "created" ? "bg-gray-100 text-gray-500" : "bg-emerald-100 text-emerald-600"}`}>
                    {l.action === "rejected" ? "✕" : l.action === "created" ? "✦" : "✓"}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-800">{ACTION_LABELS[l.action] ?? l.action}</p>
                    <p className="text-xs text-gray-400">{l.userName} — {fmtDateTime(l.createdAt)}</p>
                    {l.comment && <p className="text-xs text-gray-600 italic mt-0.5">« {l.comment} »</p>}
                  </div>
                </div>
              ))}
              {(!request.logs || request.logs.length === 0) && (
                <p className="text-sm text-gray-400">Aucun historique</p>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-2 border-t">
            <button
              onClick={() => window.open(`/api/hr-requests/${request.id}/pdf`, "_blank")}
              className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
            >
              <Download className="w-4 h-4" /> Document PDF
            </button>
            {canApprove && ["pending","manager_approved"].includes(request.status) && (
              <>
                <button
                  onClick={() => setWorkflow({ action: "approve" })}
                  className="flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {request.status === "pending" ? "Validation Manager" : "Approbation RH"}
                </button>
                <button
                  onClick={() => setWorkflow({ action: "reject" })}
                  className="flex items-center gap-2 px-3 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700"
                >
                  <XCircle className="w-4 h-4" /> Rejeter
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {workflow && (
        <WorkflowModal
          request={request} action={workflow.action}
          onClose={() => setWorkflow(null)}
          onDone={() => { setWorkflow(null); onAction(); onClose(); }}
        />
      )}
    </div>
  );
}

// ── Create Request Form ───────────────────────────────────────────────────────
type FormData = {
  employeeId: string; type: string; reason: string;
  startDate: string; endDate: string; amount: string;
};

function CreateModal({ employees, onClose, onCreated }: {
  employees: Employee[]; onClose: () => void; onCreated: () => void;
}) {
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<FormData>({
    defaultValues: { type: "leave", startDate: "", endDate: "", amount: "", reason: "", employeeId: "" },
  });
  const [apiErr, setApiErr] = useState("");
  const selectedType = watch("type");
  const startDate    = watch("startDate");
  const endDate      = watch("endDate");
  const days = calcDays(startDate, endDate);

  const onSubmit = async (data: FormData) => {
    setApiErr("");
    try {
      const body: any = {
        employeeId: data.employeeId,
        type:       data.type,
        reason:     data.reason || null,
        startDate:  data.startDate || null,
        endDate:    data.endDate   || null,
        amount:     data.amount ? Number(data.amount) : null,
      };
      await api.post("/api/hr-requests", body);
      toast.success("Demande soumise avec succès");
      onCreated();
    } catch (e: any) { setApiErr(e.message); }
  };

  const t = TYPES[selectedType];
  const TypeIcon = t?.icon ?? FileText;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b">
          <div className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Nouvelle demande RH</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
          {apiErr && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{apiErr}</div>
          )}

          {/* Employé */}
          <div>
            <label htmlFor="field-employeeId" className="block text-sm font-medium text-gray-700 mb-1">Employé *</label>
            <select id="field-employeeId" data-testid="employee-select" {...register("employeeId", { required: "Requis" })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white">
              <option value="">— Sélectionner un employé —</option>
              {employees.map(e => <option key={e.id} value={e.id}>{empName(e)} {e.position ? `— ${e.position}` : ""}</option>)}
            </select>
            {errors.employeeId && <p className="text-red-500 text-xs mt-1">{errors.employeeId.message}</p>}
          </div>

          {/* Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Type de demande *</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {Object.entries(TYPES).map(([key, info]) => {
                const Icon = info.icon;
                return (
                  <label key={key} data-testid={`type-card-${key}`} className={`relative flex flex-col items-center gap-1 p-3 rounded-xl border-2 cursor-pointer transition-all text-center ${selectedType === key ? `${info.bg} border-current ${info.color}` : "border-gray-100 hover:border-gray-200"}`}>
                    <input type="radio" {...register("type")} value={key} className="sr-only" />
                    <Icon className="w-5 h-5" />
                    <span className="text-xs font-medium">{info.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Type-specific fields */}
          {(selectedType === "leave" || selectedType === "mission") && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="field-startDate" className="block text-sm font-medium text-gray-700 mb-1">Date de début *</label>
                <input id="field-startDate" type="date" {...register("startDate", { required: "Requis" })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                {errors.startDate && <p className="text-red-500 text-xs mt-1">{errors.startDate.message}</p>}
              </div>
              <div>
                <label htmlFor="field-endDate" className="block text-sm font-medium text-gray-700 mb-1">Date de fin *</label>
                <input id="field-endDate" type="date" {...register("endDate", { required: "Requis" })} min={startDate}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                {errors.endDate && <p className="text-red-500 text-xs mt-1">{errors.endDate.message}</p>}
              </div>
              {days && days > 0 && (
                <div className="col-span-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-sm text-blue-700 flex items-center gap-2">
                  <CalendarDays className="w-4 h-4" /> Durée : <strong>{days} jour(s)</strong>
                </div>
              )}
            </div>
          )}

          {selectedType === "advance" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Montant (MGA) *</label>
              <input type="number" {...register("amount", { required: "Requis", min: { value: 1, message: "Doit être positif" } })}
                placeholder="ex: 500000" min={0}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              {errors.amount && <p className="text-red-500 text-xs mt-1">{errors.amount.message}</p>}
            </div>
          )}

          {/* Reason */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {selectedType === "attestation" ? "Objet / Destination" : "Motif / Justification"} *
            </label>
            <textarea {...register("reason", { required: "Requis" })} rows={3}
              placeholder={
                selectedType === "leave"       ? "Vacances, événement familial…"        :
                selectedType === "advance"     ? "Frais médicaux, urgence personnelle…" :
                selectedType === "attestation" ? "Dossier bancaire, visa…"              :
                selectedType === "mission"     ? "Destination et objectif du déplacement…" :
                "Description de la réclamation…"
              }
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary" />
            {errors.reason && <p className="text-red-500 text-xs mt-1">{errors.reason.message}</p>}
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Annuler</button>
            <button type="submit" disabled={isSubmitting}
              className="flex-1 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">
              {isSubmitting ? "Soumission…" : "Soumettre la demande"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function HrRequestsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isAdmin = ["SUPER_ADMIN", "HR_MANAGER"].includes(user?.role ?? "");

  const [tab, setTab]               = useState<"mine" | "admin" | "history">(isAdmin ? "admin" : "mine");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedReq, setSelectedReq]   = useState<HrRequest | null>(null);

  const { data: requests = [], isLoading } = useQuery<HrRequest[]>({
    queryKey: ["hr-requests"],
    queryFn:  () => api.get("/api/hr-requests"),
    staleTime: 15_000,
  });

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ["employees"],
    queryFn:  () => api.get("/api/employees"),
    staleTime: 60_000,
  });

  const { data: stats } = useQuery<Stats>({
    queryKey: ["hr-requests-stats"],
    queryFn:  () => api.get("/api/hr-requests/stats"),
    staleTime: 15_000,
  });

  function refresh() {
    qc.invalidateQueries({ queryKey: ["hr-requests"] });
    qc.invalidateQueries({ queryKey: ["hr-requests-stats"] });
  }

  const filtered = useMemo(() => {
    return requests.filter(r => {
      if (filterType   !== "all" && r.type   !== filterType)   return false;
      if (filterStatus !== "all" && r.status !== filterStatus) return false;
      return true;
    });
  }, [requests, filterType, filterStatus]);

  const allLogs = useMemo(() => {
    const logs: (LogEntry & { reqRef?: string; reqType?: string })[] = [];
    requests.forEach(r => {
      (r.logs ?? []).forEach(l => logs.push({ ...l, reqRef: r.reference, reqType: r.type }));
    });
    return logs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [requests]);

  const TABS = [
    { key: "mine",    label: "Mes demandes",    icon: User,          count: requests.filter(r => r.status === "pending").length },
    { key: "admin",   label: "Administration",  icon: Settings2,     count: stats?.pending ?? 0, hidden: !isAdmin },
    { key: "history", label: "Historique",      icon: History,       count: 0 },
  ] as const;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif text-primary tracking-tight">Demandes RH</h1>
          <p className="text-muted-foreground text-sm mt-1">Gestion des demandes officielles — workflow de validation</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 text-sm font-semibold shadow-sm">
          <Plus className="w-4 h-4" /> Nouvelle demande
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total",         value: stats?.total         ?? 0, color: "bg-gray-50 border-gray-100",     text: "text-gray-700"   },
          { label: "En attente",    value: stats?.pending       ?? 0, color: "bg-amber-50 border-amber-100",   text: "text-amber-700"  },
          { label: "Approuvés RH",  value: stats?.hrApproved    ?? 0, color: "bg-emerald-50 border-emerald-100", text: "text-emerald-700" },
          { label: "Rejetés",       value: stats?.rejected      ?? 0, color: "bg-red-50 border-red-100",        text: "text-red-700"    },
        ].map(k => (
          <div key={k.label} className={`rounded-xl border p-4 ${k.color}`}>
            <p className={`text-2xl font-bold ${k.text}`}>{k.value}</p>
            <p className="text-xs text-gray-500 mt-1">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {TABS.filter(t => !t.hidden).map(t => {
          const Icon = t.icon;
          return (
            <button key={t.key} onClick={() => setTab(t.key as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.key ? "bg-white shadow text-primary" : "text-gray-600 hover:text-gray-800"}`}>
              <Icon className="w-4 h-4" />
              {t.label}
              {t.count > 0 && <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${tab === t.key ? "bg-amber-100 text-amber-700" : "bg-gray-200 text-gray-600"}`}>{t.count}</span>}
            </button>
          );
        })}
      </div>

      {/* ── Tab: Mes Demandes / Admin ── */}
      {(tab === "mine" || tab === "admin") && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-gray-500 font-medium">Type :</span>
            {["all", ...Object.keys(TYPES)].map(t => (
              <button key={t} onClick={() => setFilterType(t)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${filterType === t ? "bg-primary text-white border-primary" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>
                {t === "all" ? "Tous" : TYPES[t]?.label ?? t}
              </button>
            ))}
            <span className="text-xs text-gray-400 mx-1">|</span>
            <span className="text-xs text-gray-500 font-medium">Statut :</span>
            {["all", ...Object.keys(STATUSES)].map(s => (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${filterStatus === s ? "bg-primary text-white border-primary" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>
                {s === "all" ? "Tous" : STATUSES[s]?.label ?? s}
              </button>
            ))}
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="text-center py-16 text-gray-400">Chargement…</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <ClipboardList className="w-12 h-12 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-400">Aucune demande</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    <th className="px-4 py-3">Référence</th>
                    <th className="px-4 py-3">Employé</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Détails</th>
                    <th className="px-4 py-3">Statut</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map(r => {
                    const days = calcDays(r.startDate, r.endDate);
                    return (
                      <tr key={r.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs font-semibold text-primary">{r.reference ?? r.id.slice(0, 8)}</span>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-800">{empName(r.employee)}</p>
                          <p className="text-xs text-gray-400">{r.employee?.position ?? ""}</p>
                        </td>
                        <td className="px-4 py-3"><TypeBadge type={r.type} /></td>
                        <td className="px-4 py-3 text-gray-600 text-xs max-w-40">
                          {r.type === "leave"   && days ? <span>{fmtDate(r.startDate)} · {days}j</span> : null}
                          {r.type === "advance" && r.amount ? <span>{r.amount.toLocaleString("fr-MG")} MGA</span> : null}
                          {r.type === "mission" ? <span>{fmtDate(r.startDate)}</span> : null}
                          {r.reason && <p className="truncate text-gray-400 max-w-36">{r.reason}</p>}
                        </td>
                        <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                        <td className="px-4 py-3 text-gray-400 text-xs">{fmtDate(r.createdAt)}</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            <button onClick={() => setSelectedReq(r)}
                              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" title="Voir détails">
                              <Eye className="w-4 h-4" />
                            </button>
                            <button onClick={() => window.open(`/api/hr-requests/${r.id}/pdf`, "_blank")}
                              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" title="Document PDF">
                              <Download className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="px-4 py-3 bg-gray-50 border-t text-xs text-gray-400">
                {filtered.length} demande(s) affichée(s)
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Historique ── */}
      {tab === "history" && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b bg-gray-50">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
              <History className="w-4 h-4 text-primary" /> Journal des actions
            </h3>
          </div>
          {allLogs.length === 0 ? (
            <div className="text-center py-12 text-gray-400">Aucune action enregistrée</div>
          ) : (
            <div className="divide-y">
              {allLogs.slice(0, 50).map(l => (
                <div key={l.id} className="px-6 py-3 flex items-start gap-4 hover:bg-gray-50/50">
                  <div className={`mt-0.5 w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-sm
                    ${l.action === "rejected" ? "bg-red-100 text-red-600" : l.action === "created" ? "bg-gray-100 text-gray-500" : "bg-emerald-100 text-emerald-600"}`}>
                    {l.action === "rejected" ? "✕" : l.action === "created" ? "●" : "✓"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-800">{ACTION_LABELS[l.action] ?? l.action}</span>
                      {l.reqRef && <span className="font-mono text-xs text-primary">{l.reqRef}</span>}
                      {l.reqType && <TypeBadge type={l.reqType} />}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{l.userName} — {fmtDateTime(l.createdAt)}</p>
                    {l.comment && <p className="text-xs text-gray-600 italic mt-0.5">« {l.comment} »</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showCreate && (
        <CreateModal
          employees={employees}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); refresh(); }}
        />
      )}
      {selectedReq && (
        <RequestDetail
          request={selectedReq}
          onClose={() => setSelectedReq(null)}
          onAction={() => { refresh(); setSelectedReq(null); }}
        />
      )}
    </div>
  );
}
