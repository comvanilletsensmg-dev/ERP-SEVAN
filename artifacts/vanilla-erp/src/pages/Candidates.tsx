import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  Users, Upload, FileText, Briefcase, CheckCircle2, XCircle, ChevronRight,
  Star, Phone, Mail, MapPin, Sparkles, Eye, Trash2, UserCheck,
  GraduationCap, Layers, Clock, Plus, Search, Filter, X, Download,
  ArrowRight, AlertCircle, RotateCcw,
} from "lucide-react";
import { useGetOnboardingTasks, useUpdateOnboardingTask, useGetEmployees } from "@workspace/api-client-react";

// ── Types ──────────────────────────────────────────────────────────────────────
interface Candidate {
  id: string; name: string; firstName?: string; lastName?: string;
  position: string; email?: string; phone?: string; status: string;
  skills: string[]; experience?: string; education?: string;
  cvUrl?: string; score?: number; source?: string; notes?: string;
  createdAt: string; updatedAt: string;
}

// ── Pipeline config ────────────────────────────────────────────────────────────
const STAGES: Record<string, { label: string; color: string; bg: string; border: string; icon: React.ElementType }> = {
  applied:   { label: "Candidature",   color: "text-blue-700",   bg: "bg-blue-50",   border: "border-blue-200",  icon: Users },
  screening: { label: "Pré-sélection", color: "text-amber-700",  bg: "bg-amber-50",  border: "border-amber-200", icon: Filter },
  interview: { label: "Entretien",     color: "text-purple-700", bg: "bg-purple-50", border: "border-purple-200",icon: Briefcase },
  offer:     { label: "Offre",         color: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200",icon: FileText },
  hired:     { label: "Recruté",       color: "text-green-700",  bg: "bg-green-50",  border: "border-green-200", icon: CheckCircle2 },
  rejected:  { label: "Rejeté",        color: "text-red-700",    bg: "bg-red-50",    border: "border-red-200",   icon: XCircle },
  new:       { label: "Nouveau",       color: "text-blue-700",   bg: "bg-blue-50",   border: "border-blue-200",  icon: Users },
};

const PIPELINE_ORDER = ["applied", "screening", "interview", "offer", "hired"];

const SOURCES = ["LinkedIn", "Site web", "Candidature directe", "Cooptation", "Agence", "Autre"];

// ── Helpers ────────────────────────────────────────────────────────────────────
const api = async (path: string, opts?: RequestInit) => {
  const r = await fetch(`/api${path}`, { credentials: "include", ...opts });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: r.statusText }));
    throw new Error(err.error ?? "Erreur serveur");
  }
  return r.json();
};

function ScoreBadge({ score = 0 }: { score?: number }) {
  const color = score >= 70 ? "text-green-600 bg-green-50 border-green-200"
    : score >= 40 ? "text-amber-600 bg-amber-50 border-amber-200"
    : "text-gray-400 bg-gray-50 border-gray-200";
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full border ${color}`}>
      <Star className="w-3 h-3" />{score}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = STAGES[status] ?? STAGES.applied;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${s.bg} ${s.color} border ${s.border}`}>
      {s.label}
    </span>
  );
}

// ── CV Upload Zone ──────────────────────────────────────────────────────────────
function CvUploadZone({ onParsed }: { onParsed: (data: Partial<Candidate> & { skills: string[] }) => void }) {
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setFileName(file.name);
    setLoading(true);
    try {
      const form = new FormData();
      form.append("cv", file);
      const r = await fetch("/api/recruitment/upload-cv", {
        method: "POST", credentials: "include", body: form,
      });
      if (!r.ok) throw new Error("Erreur upload");
      const data = await r.json();
      onParsed(data);
      toast.success("CV analysé — formulaire pré-rempli !");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'analyse");
    } finally {
      setLoading(false);
    }
  }, [onParsed]);

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
      onClick={() => inputRef.current?.click()}
      className={`relative border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
        dragging ? "border-primary bg-primary/5 scale-[1.01]" : "border-gray-200 hover:border-primary/50 hover:bg-gray-50/50"
      }`}
    >
      <input ref={inputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
      {loading ? (
        <div className="flex flex-col items-center gap-2 py-2">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Analyse du CV en cours…</p>
        </div>
      ) : fileName ? (
        <div className="flex items-center justify-center gap-2 py-1">
          <FileText className="w-5 h-5 text-primary" />
          <span className="text-sm font-medium text-gray-700 truncate max-w-[200px]">{fileName}</span>
          <CheckCircle2 className="w-4 h-4 text-green-500" />
        </div>
      ) : (
        <div className="flex flex-col items-center gap-1.5 py-1">
          <Upload className="w-7 h-7 text-gray-300" />
          <p className="text-sm font-medium text-gray-600">Glisser le CV ici</p>
          <p className="text-xs text-gray-400">PDF, JPG, PNG · max 10 Mo</p>
          <div className="mt-1 inline-flex items-center gap-1.5 bg-primary/10 text-primary text-xs font-semibold px-3 py-1 rounded-full">
            <Sparkles className="w-3 h-3" />Analyser le CV
          </div>
        </div>
      )}
    </div>
  );
}

// ── Create/Edit Modal ──────────────────────────────────────────────────────────
type CandidateForm = {
  firstName: string; lastName: string; position: string; email: string;
  phone: string; source: string; skillsInput: string; experience: string;
  education: string; notes: string; cvUrl: string;
};

function CandidateModal({ candidate, onClose, onSave }: {
  candidate?: Candidate; onClose: () => void; onSave: () => void;
}) {
  const isEdit = !!candidate;
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);
  const { register, handleSubmit, setValue, watch, formState: { isSubmitting } } = useForm<CandidateForm>({
    defaultValues: {
      firstName:  candidate?.firstName ?? "",
      lastName:   candidate?.lastName  ?? "",
      position:   candidate?.position  ?? "",
      email:      candidate?.email     ?? "",
      phone:      candidate?.phone     ?? "",
      source:     candidate?.source    ?? "",
      skillsInput: (candidate?.skills ?? []).join(", "),
      experience: candidate?.experience ?? "",
      education:  candidate?.education  ?? "",
      notes:      candidate?.notes      ?? "",
      cvUrl:      candidate?.cvUrl      ?? "",
    },
  });

  const cvUrl = watch("cvUrl");

  const handleParsed = (data: Partial<Candidate> & { skills: string[] }) => {
    if (data.firstName)  setValue("firstName",  data.firstName);
    if (data.lastName)   setValue("lastName",   data.lastName);
    if (data.email)      setValue("email",      data.email);
    if (data.phone)      setValue("phone",      data.phone);
    if (data.experience) setValue("experience", data.experience);
    if (data.education)  setValue("education",  data.education);
    if (data.skills?.length) setValue("skillsInput", data.skills.join(", "));
    if (data.cvUrl)      setValue("cvUrl",      data.cvUrl);
  };

  const onSubmit = async (d: CandidateForm) => {
    const skills = d.skillsInput.split(",").map(s => s.trim()).filter(Boolean);
    const name   = [d.firstName, d.lastName].filter(Boolean).join(" ") || d.lastName || d.firstName || "Sans nom";
    const body   = { firstName: d.firstName, lastName: d.lastName, name, position: d.position,
      email: d.email || null, phone: d.phone || null, source: d.source || null, skills,
      experience: d.experience || null, education: d.education || null,
      notes: d.notes || null, cvUrl: d.cvUrl || null };
    try {
      if (isEdit) {
        await api(`/recruitment/candidates/${candidate.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
        toast.success("Candidat mis à jour");
      } else {
        await api("/recruitment/candidates", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
        toast.success("Candidat ajouté");
      }
      onSave();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <h2 className="text-lg font-semibold text-gray-900">
            {isEdit ? "Modifier le candidat" : "Nouveau candidat"}
          </h2>
          <button onClick={onClose} aria-label="Fermer" data-testid="modal-close"
            className="text-gray-400 hover:text-gray-600 p-2 rounded-lg hover:bg-gray-100 z-10 relative">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-5">
          {/* CV Upload */}
          {!isEdit && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-primary" />Analyser le CV (auto-remplissage)
              </p>
              <CvUploadZone onParsed={handleParsed} />
              {cvUrl && (
                <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />CV uploadé avec succès
                </p>
              )}
            </div>
          )}

          {/* Name */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="field-firstName" className="block text-sm font-medium text-gray-700 mb-1">Prénom</label>
              <input id="field-firstName" data-testid="field-firstName" {...register("firstName")} placeholder="Jean"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label htmlFor="field-lastName" className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
              <input id="field-lastName" data-testid="field-lastName" {...register("lastName", { required: "Nom requis" })} placeholder="RAKOTO"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          </div>

          {/* Position */}
          <div>
            <label htmlFor="field-position" className="block text-sm font-medium text-gray-700 mb-1">Poste recherché *</label>
            <input id="field-position" data-testid="field-position" {...register("position", { required: "Poste requis" })} placeholder="Ex: Responsable logistique"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>

          {/* Email + Phone */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input {...register("email")} type="email" placeholder="candidat@email.com"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone</label>
              <input {...register("phone")} placeholder="034 XX XXX XX"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          </div>

          {/* Source */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
            <select {...register("source")}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white">
              <option value="">— Sélectionner —</option>
              {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Skills */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Compétences <span className="text-gray-400 font-normal">(séparées par des virgules)</span>
            </label>
            <input {...register("skillsInput")} placeholder="Excel, Logistique, Anglais, SAP…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>

          {/* Experience */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Expérience professionnelle</label>
            <textarea {...register("experience")} rows={3}
              placeholder="Décrivez l'expérience du candidat…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>

          {/* Education */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Formation / Diplôme</label>
            <textarea {...register("education")} rows={2}
              placeholder="Diplôme, université, année…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes internes</label>
            <textarea {...register("notes")} rows={2}
              placeholder="Observations, commentaires recruteur…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Annuler</button>
            <button type="submit" disabled={isSubmitting}
              className="flex-1 py-2.5 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">
              {isSubmitting ? "Sauvegarde…" : isEdit ? "Enregistrer" : "Ajouter le candidat"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Candidate Detail Panel ─────────────────────────────────────────────────────
function CandidateDetail({ candidate, onClose, onRefresh }: {
  candidate: Candidate; onClose: () => void; onRefresh: () => void;
}) {
  const [hiring, setHiring] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const NEXT_STAGE: Record<string, string> = {
    applied: "screening", screening: "interview", interview: "offer", offer: "hired",
  };

  const advance = async () => {
    const next = NEXT_STAGE[candidate.status];
    if (!next) return;
    try {
      await api(`/recruitment/candidates/${candidate.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      toast.success(`Candidat avancé → ${STAGES[next]?.label ?? next}`);
      onRefresh();
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Erreur"); }
  };

  const reject = async () => {
    if (!confirm(`Rejeter ${candidate.name} ?`)) return;
    try {
      await api(`/recruitment/candidates/${candidate.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "rejected" }),
      });
      toast.success("Candidat rejeté");
      onRefresh(); onClose();
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Erreur"); }
  };

  const restore = async () => {
    try {
      await api(`/recruitment/candidates/${candidate.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "applied" }),
      });
      toast.success("Candidat remis dans le pipeline");
      onRefresh();
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Erreur"); }
  };

  const hire = async () => {
    if (!confirm(`Recruter ${candidate.name} et créer son dossier employé ?`)) return;
    setHiring(true);
    try {
      await api(`/recruitment/candidates/${candidate.id}/hire`, { method: "POST" });
      toast.success(`${candidate.name} recruté — dossier employé créé !`);
      onRefresh(); onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erreur recrutement");
    } finally { setHiring(false); }
  };

  const deleteCand = async () => {
    if (!confirm(`Supprimer définitivement ${candidate.name} ?`)) return;
    try {
      await api(`/recruitment/candidates/${candidate.id}`, { method: "DELETE" });
      toast.success("Candidat supprimé");
      onRefresh(); onClose();
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Erreur"); }
  };

  const stage = STAGES[candidate.status] ?? STAGES.applied;
  const nextStage = NEXT_STAGE[candidate.status];

  if (editing) {
    return <CandidateModal candidate={candidate} onClose={() => setEditing(false)}
      onSave={() => { setEditing(false); onRefresh(); }} />;
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-start justify-between rounded-t-2xl">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{candidate.name}</h2>
            <p className="text-sm text-gray-500">{candidate.position}</p>
            <div className="flex items-center gap-2 mt-1">
              <StatusBadge status={candidate.status} />
              {candidate.score != null && candidate.score > 0 && <ScoreBadge score={candidate.score} />}
            </div>
          </div>
          <button onClick={onClose} aria-label="Fermer" data-testid="detail-close"
            className="text-gray-400 hover:text-gray-600 p-2 rounded-lg hover:bg-gray-100 z-10 relative">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Contact */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-2">
            {candidate.email && (
              <div className="flex items-center gap-2 text-sm">
                <Mail className="w-4 h-4 text-gray-400 shrink-0" />
                <a href={`mailto:${candidate.email}`} className="text-primary hover:underline">{candidate.email}</a>
              </div>
            )}
            {candidate.phone && (
              <div className="flex items-center gap-2 text-sm">
                <Phone className="w-4 h-4 text-gray-400 shrink-0" />
                <span className="text-gray-700">{candidate.phone}</span>
              </div>
            )}
            {candidate.source && (
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
                <span className="text-gray-600">Source : {candidate.source}</span>
              </div>
            )}
          </div>

          {/* Skills */}
          {candidate.skills.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Compétences</p>
              <div className="flex flex-wrap gap-1.5">
                {candidate.skills.map(s => (
                  <span key={s} className="bg-primary/10 text-primary text-xs font-medium px-2 py-0.5 rounded-full">{s}</span>
                ))}
              </div>
            </div>
          )}

          {/* Experience */}
          {candidate.experience && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Briefcase className="w-3.5 h-3.5" />Expérience
              </p>
              <p className="text-sm text-gray-700 whitespace-pre-line bg-gray-50 rounded-lg p-3">{candidate.experience}</p>
            </div>
          )}

          {/* Education */}
          {candidate.education && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <GraduationCap className="w-3.5 h-3.5" />Formation
              </p>
              <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">{candidate.education}</p>
            </div>
          )}

          {/* Notes */}
          {candidate.notes && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Notes</p>
              <p className="text-sm text-gray-600 italic bg-amber-50 border border-amber-100 rounded-lg p-3">{candidate.notes}</p>
            </div>
          )}

          {/* CV Link */}
          {candidate.cvUrl && (
            <a href={candidate.cvUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-primary hover:underline bg-primary/5 rounded-lg px-3 py-2">
              <Download className="w-4 h-4" />Télécharger le CV
            </a>
          )}

          {/* Date */}
          <p className="text-xs text-gray-400">
            Candidat depuis le {new Date(candidate.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}
          </p>

          {/* Actions */}
          <div className="border-t pt-4 space-y-2">
            {candidate.status !== "hired" && candidate.status !== "rejected" && (
              <>
                {nextStage && (
                  <button onClick={advance}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90">
                    <ArrowRight className="w-4 h-4" />
                    Avancer → {STAGES[nextStage]?.label}
                  </button>
                )}
                {candidate.status === "offer" && (
                  <button onClick={hire} disabled={hiring}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50">
                    <UserCheck className="w-4 h-4" />
                    {hiring ? "Recrutement…" : "Recruter — Créer le dossier employé"}
                  </button>
                )}
                <div className="flex gap-2">
                  <button onClick={() => setEditing(true)}
                    className="flex-1 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 flex items-center justify-center gap-1.5">
                    <Eye className="w-4 h-4" />Modifier
                  </button>
                  <button onClick={reject}
                    className="flex-1 py-2 border border-red-200 text-red-600 rounded-lg text-sm hover:bg-red-50 flex items-center justify-center gap-1.5">
                    <XCircle className="w-4 h-4" />Rejeter
                  </button>
                </div>
              </>
            )}
            {candidate.status === "rejected" && (
              <button onClick={restore}
                className="w-full flex items-center justify-center gap-2 py-2.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">
                <RotateCcw className="w-4 h-4" />Remettre dans le pipeline
              </button>
            )}
            {candidate.status === "hired" && (
              <div className="flex items-center justify-center gap-2 py-3 bg-green-50 rounded-lg text-green-700 text-sm font-medium">
                <CheckCircle2 className="w-4 h-4" />Recruté — dossier employé créé
              </div>
            )}
            <button onClick={deleteCand}
              className="w-full flex items-center justify-center gap-1.5 py-2 text-red-500 hover:text-red-700 text-xs">
              <Trash2 className="w-3.5 h-3.5" />Supprimer définitivement
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Kanban Card ────────────────────────────────────────────────────────────────
function KanbanCard({ candidate, onClick }: { candidate: Candidate; onClick: () => void }) {
  return (
    <div onClick={onClick}
      className="bg-white rounded-xl border border-gray-200 p-3 shadow-sm hover:shadow-md hover:border-primary/30 cursor-pointer transition-all group">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 text-sm truncate group-hover:text-primary transition-colors">{candidate.name}</p>
          <p className="text-xs text-gray-500 truncate mt-0.5">{candidate.position}</p>
        </div>
        {candidate.score != null && candidate.score > 0 && <ScoreBadge score={candidate.score} />}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {candidate.skills.slice(0, 3).map(s => (
          <span key={s} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">{s}</span>
        ))}
        {candidate.skills.length > 3 && (
          <span className="text-[10px] text-gray-400">+{candidate.skills.length - 3}</span>
        )}
      </div>
      {candidate.email && (
        <div className="mt-2 flex items-center gap-1 text-xs text-gray-400">
          <Mail className="w-3 h-3" /><span className="truncate">{candidate.email}</span>
        </div>
      )}
      {candidate.cvUrl && (
        <div className="mt-1 flex items-center gap-1 text-xs text-primary/70">
          <FileText className="w-3 h-3" />CV disponible
        </div>
      )}
      <p className="mt-1.5 text-[10px] text-gray-400">
        {new Date(candidate.createdAt).toLocaleDateString("fr-FR")}
      </p>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function CandidatesPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"pipeline" | "list" | "onboarding">("pipeline");
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected]     = useState<Candidate | null>(null);
  const [search, setSearch]         = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  // Candidates
  const { data: candidates = [], isLoading } = useQuery<Candidate[]>({
    queryKey: ["recruitment-candidates"],
    queryFn: () => api("/recruitment/candidates"),
  });

  // Stats
  const { data: stats } = useQuery<{ total: number; byStatus: Record<string, number>; thisMonth: number }>({
    queryKey: ["recruitment-stats"],
    queryFn: () => api("/recruitment/stats"),
  });

  // Onboarding
  const { data: onboardingTasks, refetch: refetchOnboarding } = useGetOnboardingTasks({});
  const { data: employees } = useGetEmployees();
  const updateTask = useUpdateOnboardingTask();

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["recruitment-candidates"] });
    qc.invalidateQueries({ queryKey: ["recruitment-stats"] });
  };

  const toggleTask = async (task: { id: string; status: string }) => {
    const newStatus = task.status === "done" ? "pending" : "done";
    await updateTask.mutateAsync({ id: task.id, data: { status: newStatus } });
    refetchOnboarding();
  };

  // Filtered candidates for list view
  const filtered = candidates.filter(c => {
    const matchSearch = !search || [c.name, c.email, c.phone, c.position]
      .some(f => f?.toLowerCase().includes(search.toLowerCase()));
    const matchStatus = filterStatus === "all" || c.status === filterStatus;
    return matchSearch && matchStatus;
  });

  // KPI
  const total     = stats?.total ?? candidates.length;
  const pending   = (stats?.byStatus?.applied ?? 0) + (stats?.byStatus?.screening ?? 0) + (stats?.byStatus?.interview ?? 0) + (stats?.byStatus?.offer ?? 0);
  const hired     = stats?.byStatus?.hired ?? 0;
  const thisMonth = stats?.thisMonth ?? 0;
  const hiringRate = total > 0 ? Math.round((hired / total) * 100) : 0;

  const kpis = [
    { label: "Total candidats",   value: total,       icon: Users,        color: "text-blue-600",  bg: "bg-blue-50"  },
    { label: "En cours",          value: pending,      icon: Clock,        color: "text-amber-600", bg: "bg-amber-50" },
    { label: "Recrutés",          value: hired,        icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50" },
    { label: "Taux admission",    value: `${hiringRate}%`, icon: Star,     color: "text-purple-600",bg: "bg-purple-50"},
  ];

  return (
    <div className="p-6 max-w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ATS — Recrutement & Onboarding</h1>
          <p className="text-sm text-gray-500 mt-0.5">{thisMonth} nouvelle(s) candidature(s) ce mois · {total} total</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 shadow-sm">
          <Plus className="w-4 h-4" />Nouveau candidat
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {kpis.map(k => (
          <div key={k.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${k.bg} flex items-center justify-center shrink-0`}>
              <k.icon className={`w-5 h-5 ${k.color}`} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 leading-tight">{k.value}</p>
              <p className="text-xs text-gray-500">{k.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6 w-fit">
        {[
          { key: "pipeline", label: "Pipeline", icon: Layers },
          { key: "list",     label: "Candidats",  icon: Users },
          { key: "onboarding", label: "Onboarding", icon: UserCheck },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as typeof tab)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.key ? "bg-white text-primary shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}>
            <t.icon className="w-4 h-4" />{t.label}
          </button>
        ))}
      </div>

      {/* Pipeline Kanban */}
      {tab === "pipeline" && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {PIPELINE_ORDER.map(stageKey => {
            const s = STAGES[stageKey];
            const cols = candidates.filter(c => c.status === stageKey || (stageKey === "applied" && c.status === "new"));
            const StageIcon = s.icon;
            return (
              <div key={stageKey} className="flex-shrink-0 w-72">
                <div className={`flex items-center gap-2 mb-3 px-3 py-2 rounded-xl ${s.bg} border ${s.border}`}>
                  <StageIcon className={`w-4 h-4 ${s.color}`} />
                  <span className={`text-sm font-semibold ${s.color}`}>{s.label}</span>
                  <span className={`ml-auto text-xs font-bold px-1.5 py-0.5 rounded-full bg-white/80 ${s.color}`}>
                    {cols.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {cols.length === 0 && (
                    <div className="bg-gray-50/70 border border-dashed border-gray-200 rounded-xl p-6 text-center">
                      <p className="text-xs text-gray-400">Aucun candidat</p>
                    </div>
                  )}
                  {cols.map(c => (
                    <KanbanCard key={c.id} candidate={c} onClick={() => setSelected(c)} />
                  ))}
                </div>
              </div>
            );
          })}

          {/* Rejected column */}
          <div className="flex-shrink-0 w-72">
            <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-xl bg-red-50 border border-red-200">
              <XCircle className="w-4 h-4 text-red-600" />
              <span className="text-sm font-semibold text-red-700">Rejeté</span>
              <span className="ml-auto text-xs font-bold px-1.5 py-0.5 rounded-full bg-white/80 text-red-600">
                {candidates.filter(c => c.status === "rejected").length}
              </span>
            </div>
            <div className="space-y-2">
              {candidates.filter(c => c.status === "rejected").length === 0 && (
                <div className="bg-gray-50/70 border border-dashed border-gray-200 rounded-xl p-6 text-center">
                  <p className="text-xs text-gray-400">Aucun</p>
                </div>
              )}
              {candidates.filter(c => c.status === "rejected").map(c => (
                <KanbanCard key={c.id} candidate={c} onClick={() => setSelected(c)} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Candidats List */}
      {tab === "list" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {/* Search + Filter */}
          <div className="p-4 border-b flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher par nom, email, poste…"
                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white">
              <option value="all">Tous les statuts</option>
              {Object.entries(STAGES).filter(([k]) => k !== "new").map(([k, s]) => (
                <option key={k} value={k}>{s.label}</option>
              ))}
            </select>
          </div>

          {isLoading ? (
            <div className="p-12 text-center text-gray-400">Chargement…</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <AlertCircle className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500">Aucun candidat trouvé</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Candidat</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Poste</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">Contact</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Statut</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden lg:table-cell">Score</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => setSelected(c)}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900">{c.name}</p>
                      {c.skills.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {c.skills.slice(0, 2).map(s => (
                            <span key={s} className="text-[10px] bg-primary/10 text-primary px-1.5 rounded-full">{s}</span>
                          ))}
                          {c.skills.length > 2 && <span className="text-[10px] text-gray-400">+{c.skills.length - 2}</span>}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{c.position}</td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {c.email && <p className="text-gray-500 text-xs">{c.email}</p>}
                      {c.phone && <p className="text-gray-500 text-xs">{c.phone}</p>}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {c.score != null && c.score > 0 ? <ScoreBadge score={c.score} /> : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                      {new Date(c.createdAt).toLocaleDateString("fr-FR")}
                    </td>
                    <td className="px-4 py-3">
                      <button className="text-gray-400 hover:text-primary p-1 rounded">
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Onboarding Tab */}
      {tab === "onboarding" && (
        <div className="space-y-4">
          {(employees ?? []).map(emp => {
            const tasks = (onboardingTasks ?? []).filter(t => t.employeeId === emp.id);
            if (tasks.length === 0) return null;
            const done = tasks.filter(t => t.status === "done").length;
            const pct  = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
            return (
              <div key={emp.id} className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-semibold text-gray-900">{emp.name}</p>
                    <p className="text-xs text-gray-500">{emp.position}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-gray-900">{pct}%</p>
                    <p className="text-xs text-gray-400">{done}/{tasks.length} tâches</p>
                  </div>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2 mb-3">
                  <div className="bg-green-500 h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
                <div className="space-y-1.5">
                  {tasks.map(t => (
                    <label key={t.id} className="flex items-center gap-2.5 cursor-pointer hover:bg-gray-50 rounded-lg px-2 py-1.5 transition-colors">
                      <input type="checkbox" checked={t.status === "done"} onChange={() => toggleTask(t)}
                        className="w-4 h-4 accent-green-600 cursor-pointer" />
                      <span className={`text-sm ${t.status === "done" ? "line-through text-gray-400" : "text-gray-700"}`}>{t.title}</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
          {!(onboardingTasks ?? []).length && (
            <div className="text-center py-16 text-gray-400">
              <UserCheck className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>Aucune tâche d'onboarding</p>
              <p className="text-sm mt-1">Elles sont créées automatiquement lors du recrutement d'un candidat</p>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showCreate && (
        <CandidateModal onClose={() => setShowCreate(false)} onSave={() => { setShowCreate(false); refresh(); }} />
      )}
      {selected && (
        <CandidateDetail candidate={selected} onClose={() => setSelected(null)}
          onRefresh={() => { refresh(); setSelected(null); }} />
      )}
    </div>
  );
}
