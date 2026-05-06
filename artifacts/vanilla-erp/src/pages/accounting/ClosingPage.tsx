/**
 * Clôture Mensuelle — /accounting/closing
 * Full monthly close workflow: checklist → generate entries → lock → snapshot
 */
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  LockKeyhole, Unlock, CheckCircle2, XCircle, AlertTriangle, Clock,
  FileSpreadsheet, FileText, RefreshCw, ChevronRight, Calendar,
  TrendingUp, Shield, History, Loader2,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
type PeriodStatus = "open" | "closing" | "closed";
interface Period {
  id: string; year: string; month: string; status: PeriodStatus;
  closedAt: string | null; closedBy: string | null; createdAt: string;
}
interface CheckItem { id: string; label: string; ok: boolean; detail: string }
interface Checklist { valid: boolean; checks: CheckItem[]; errors: string[]; blockingErrors: string[] }
interface ClosingLog { id: string; action: string; details: Record<string, unknown>; userEmail: string | null; createdAt: string }

// ── Helpers ───────────────────────────────────────────────────────────────────
const MONTH_NAMES = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
const fmtMonth = (m: string, y: string) => `${MONTH_NAMES[parseInt(m) - 1]} ${y}`;
const fmtDate  = (d: string) => new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

const ACTION_LABELS: Record<string, string> = {
  check: "Checklist exécutée",
  close: "Période clôturée",
  reopen: "Période réouverte",
  generate_entries: "Écritures générées",
};

function StatusBadge({ status }: { status: PeriodStatus }) {
  if (status === "closed")
    return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800"><LockKeyhole className="w-3 h-3" />Clôturée</span>;
  if (status === "closing")
    return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800"><Loader2 className="w-3 h-3 animate-spin" />En cours</span>;
  return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800"><Unlock className="w-3 h-3" />Ouverte</span>;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ClosingPage() {
  const qc = useQueryClient();
  const now = new Date();
  const [selYear,  setSelYear]  = useState(String(now.getFullYear()));
  const [selMonth, setSelMonth] = useState(String(now.getMonth() + 1).padStart(2, "0"));
  const [selPeriodId, setSelPeriodId] = useState<string | null>(null);
  const [reopenReason, setReopenReason] = useState("");
  const [showReopenModal, setShowReopenModal] = useState(false);

  // ── Periods list ─────────────────────────────────────────────────────────────
  const { data: periods = [], isLoading: periodsLoading } = useQuery<Period[]>({
    queryKey: ["accounting-periods"],
    queryFn: () => fetch("/api/accounting/periods", { credentials: "include" }).then(r => r.json()),
  });

  // Auto-select the first period or the one matching current month
  useEffect(() => {
    if (periods.length > 0 && !selPeriodId) {
      const current = periods.find(p => p.year === selYear && p.month === selMonth);
      setSelPeriodId(current?.id ?? periods[0].id);
    }
  }, [periods]);

  const activePeriod = periods.find(p => p.id === selPeriodId) ?? null;

  // ── Checklist ─────────────────────────────────────────────────────────────────
  const { data: checklist, isFetching: checklistLoading, refetch: refetchChecklist } = useQuery<Checklist>({
    queryKey: ["closing-checklist", selPeriodId],
    queryFn: () => fetch(`/api/accounting/periods/${selPeriodId}/checklist`, { credentials: "include" }).then(r => r.json()),
    enabled: !!selPeriodId && activePeriod?.status !== "closed",
  });

  // ── Logs ─────────────────────────────────────────────────────────────────────
  const { data: logs = [] } = useQuery<ClosingLog[]>({
    queryKey: ["closing-logs", selPeriodId],
    queryFn: () => fetch(`/api/accounting/periods/${selPeriodId}/logs`, { credentials: "include" }).then(r => r.json()),
    enabled: !!selPeriodId,
  });

  // ── Create period ─────────────────────────────────────────────────────────────
  const createPeriod = useMutation({
    mutationFn: () => fetch("/api/accounting/periods", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year: selYear, month: selMonth }),
    }).then(r => r.json()),
    onSuccess: (data: Period) => {
      qc.invalidateQueries({ queryKey: ["accounting-periods"] });
      setSelPeriodId(data.id);
      toast.success(`Période ${fmtMonth(data.month, data.year)} créée`);
    },
  });

  // ── Close period ──────────────────────────────────────────────────────────────
  const closePeriod = useMutation({
    mutationFn: () => fetch(`/api/accounting/periods/${selPeriodId}/close`, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
    }).then(async r => {
      const data = await r.json();
      if (!r.ok) throw data;
      return data;
    }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["accounting-periods"] });
      qc.invalidateQueries({ queryKey: ["closing-logs", selPeriodId] });
      toast.success(data.message ?? "Clôture effectuée avec succès");
    },
    onError: (err: { error?: string; blockingErrors?: string[] }) => {
      toast.error(err.error ?? "Erreur lors de la clôture");
      if (err.blockingErrors?.length) {
        err.blockingErrors.forEach(e => toast.error(e, { duration: 6000 }));
      }
    },
  });

  // ── Reopen period ─────────────────────────────────────────────────────────────
  const reopenPeriod = useMutation({
    mutationFn: () => fetch(`/api/accounting/periods/${selPeriodId}/reopen`, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reopenReason }),
    }).then(async r => {
      const data = await r.json();
      if (!r.ok) throw data;
      return data;
    }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["accounting-periods"] });
      qc.invalidateQueries({ queryKey: ["closing-checklist", selPeriodId] });
      qc.invalidateQueries({ queryKey: ["closing-logs", selPeriodId] });
      setShowReopenModal(false);
      setReopenReason("");
      toast.success(data.message ?? "Période réouverte");
    },
    onError: (err: { error?: string }) => toast.error(err.error ?? "Erreur lors de la réouverture"),
  });

  const years  = Array.from({ length: 5 }, (_, i) => String(now.getFullYear() - i));
  const months = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1).padStart(2, "0"), label: MONTH_NAMES[i] }));

  const periodExistsForSel = periods.some(p => p.year === selYear && p.month === selMonth);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <LockKeyhole className="w-6 h-6 text-indigo-600" />
            Clôture Mensuelle
          </h1>
          <p className="text-sm text-gray-500 mt-1">PCG 2005 Madagascar · Verrouillage comptable par période</p>
        </div>
        <div className="flex items-center gap-2">
          {activePeriod && <StatusBadge status={activePeriod.status} />}
        </div>
      </div>

      {/* Period selector */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2"><Calendar className="w-4 h-4 text-indigo-500" />Sélectionner une période</h2>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Année</label>
            <select value={selYear} onChange={e => setSelYear(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none">
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Mois</label>
            <select value={selMonth} onChange={e => setSelMonth(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none">
              {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          {!periodExistsForSel ? (
            <button onClick={() => createPeriod.mutate()} disabled={createPeriod.isPending}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2 disabled:opacity-50">
              {createPeriod.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
              Créer la période
            </button>
          ) : (
            <div className="flex flex-wrap gap-2">
              {periods.filter(p => p.year === selYear && p.month === selMonth).map(p => (
                <button key={p.id} onClick={() => setSelPeriodId(p.id)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${selPeriodId === p.id ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"}`}>
                  {fmtMonth(p.month, p.year)}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Period history list */}
        {periods.length > 0 && (
          <div className="mt-4 border-t border-gray-100 pt-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Toutes les périodes</p>
            <div className="flex flex-wrap gap-2">
              {periods.map(p => (
                <button key={p.id} onClick={() => { setSelPeriodId(p.id); setSelYear(p.year); setSelMonth(p.month); }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${selPeriodId === p.id ? "bg-indigo-50 border-indigo-400 text-indigo-700" : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"}`}>
                  {p.status === "closed" ? <LockKeyhole className="w-3 h-3 text-emerald-600" /> : p.status === "closing" ? <Loader2 className="w-3 h-3 animate-spin text-amber-500" /> : <Unlock className="w-3 h-3 text-blue-500" />}
                  {fmtMonth(p.month, p.year)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {periodsLoading && (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div>
      )}

      {selPeriodId && activePeriod && (
        <>
          {/* Closed period snapshot summary */}
          {activePeriod.status === "closed" && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                  <LockKeyhole className="w-5 h-5 text-emerald-700" />
                </div>
                <div>
                  <p className="font-semibold text-emerald-900">Période {fmtMonth(activePeriod.month, activePeriod.year)} clôturée</p>
                  <p className="text-sm text-emerald-700">
                    {activePeriod.closedAt ? `Le ${fmtDate(activePeriod.closedAt)}` : ""} {activePeriod.closedBy ? `par ${activePeriod.closedBy}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                <a href={`/api/accounting/periods/${activePeriod.id}/snapshot/excel`}
                  className="inline-flex items-center gap-2 bg-white border border-emerald-300 text-emerald-800 px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-100 transition-colors">
                  <FileSpreadsheet className="w-4 h-4" />Balance Excel
                </a>
                <a href={`/api/accounting/periods/${activePeriod.id}/snapshot/pdf`} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-2 bg-white border border-emerald-300 text-emerald-800 px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-100 transition-colors">
                  <FileText className="w-4 h-4" />États financiers PDF
                </a>
                <button onClick={() => setShowReopenModal(true)}
                  className="inline-flex items-center gap-2 bg-amber-50 border border-amber-300 text-amber-800 px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-100 transition-colors">
                  <Unlock className="w-4 h-4" />Réouvrir (Admin)
                </button>
              </div>
            </div>
          )}

          {/* Checklist */}
          {activePeriod.status !== "closed" && (
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-indigo-500" />
                  Checklist pré-clôture — {fmtMonth(activePeriod.month, activePeriod.year)}
                </h2>
                <button onClick={() => refetchChecklist()} disabled={checklistLoading}
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-indigo-600 transition-colors disabled:opacity-50">
                  <RefreshCw className={`w-3.5 h-3.5 ${checklistLoading ? "animate-spin" : ""}`} />
                  Actualiser
                </button>
              </div>

              {checklistLoading && !checklist && (
                <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-indigo-400" /></div>
              )}

              {checklist && (
                <>
                  {/* Overall status banner */}
                  <div className={`rounded-lg p-3 mb-4 flex items-center gap-3 ${checklist.valid ? "bg-emerald-50 border border-emerald-200" : "bg-red-50 border border-red-200"}`}>
                    {checklist.valid
                      ? <><CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" /><span className="text-sm font-medium text-emerald-800">Aucune erreur bloquante — clôture possible</span></>
                      : <><XCircle className="w-5 h-5 text-red-600 shrink-0" /><span className="text-sm font-medium text-red-800">Erreurs bloquantes détectées — corriger avant la clôture</span></>
                    }
                  </div>

                  {/* Check items */}
                  <div className="space-y-2">
                    {checklist.checks.map(item => (
                      <div key={item.id} className={`flex items-start gap-3 rounded-lg p-3 border ${item.ok ? "bg-gray-50 border-gray-100" : "bg-red-50 border-red-200"}`}>
                        <div className="shrink-0 mt-0.5">
                          {item.ok
                            ? <CheckCircle2 className="w-4.5 h-4.5 text-emerald-500" />
                            : <XCircle className="w-4.5 h-4.5 text-red-500" />
                          }
                        </div>
                        <div className="min-w-0">
                          <p className={`text-sm font-medium ${item.ok ? "text-gray-800" : "text-red-800"}`}>{item.label}</p>
                          <p className={`text-xs mt-0.5 ${item.ok ? "text-gray-500" : "text-red-600"}`}>{item.detail}</p>
                        </div>
                        <div className="ml-auto shrink-0">
                          {item.ok
                            ? <span className="text-xs font-semibold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">OK</span>
                            : <span className="text-xs font-semibold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">ÉCHEC</span>
                          }
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Warning for non-blocking issues */}
                  {checklist.errors.length > 0 && checklist.valid && (
                    <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-800">
                        <strong>Avertissements non bloquants :</strong> {checklist.errors.join(" · ")}
                      </p>
                    </div>
                  )}

                  {/* Close button */}
                  <div className="mt-5 flex items-center gap-3 pt-4 border-t border-gray-100">
                    <button
                      onClick={() => closePeriod.mutate()}
                      disabled={!checklist.valid || closePeriod.isPending}
                      className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                        checklist.valid
                          ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm"
                          : "bg-gray-100 text-gray-400 cursor-not-allowed"
                      } disabled:opacity-60`}
                    >
                      {closePeriod.isPending
                        ? <><Loader2 className="w-4 h-4 animate-spin" />Clôture en cours…</>
                        : <><LockKeyhole className="w-4 h-4" />Lancer la clôture — {fmtMonth(activePeriod.month, activePeriod.year)}</>
                      }
                    </button>
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <TrendingUp className="w-3.5 h-3.5" />
                      Génère les amortissements · Verrouille les écritures · Crée le snapshot financier
                    </p>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Activity log */}
          {logs.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <History className="w-4 h-4 text-indigo-500" />
                Historique des actions — {fmtMonth(activePeriod.month, activePeriod.year)}
              </h2>
              <div className="space-y-2">
                {logs.map(log => (
                  <div key={log.id} className="flex items-start gap-3 py-2.5 border-b border-gray-100 last:border-0">
                    <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                      <ChevronRight className="w-3.5 h-3.5 text-indigo-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-800">{ACTION_LABELS[log.action] ?? log.action}</span>
                        {log.action === "close" && <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-semibold">CLÔTURE</span>}
                        {log.action === "reopen" && <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold">RÉOUVERTURE</span>}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-gray-400">{fmtDate(log.createdAt)}</span>
                        {log.userEmail && <span className="text-xs text-gray-500">par {log.userEmail}</span>}
                      </div>
                      {log.action === "close" && Array.isArray((log.details as { generatedEntries?: string[] }).generatedEntries) && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {(log.details as { generatedEntries: string[] }).generatedEntries.map((e, i) => (
                            <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{e}</span>
                          ))}
                        </div>
                      )}
                      {log.action === "check" && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          {(log.details as { checks?: { ok: boolean }[] }).checks?.filter(c => c.ok).length ?? 0} /{" "}
                          {(log.details as { checks?: unknown[] }).checks?.length ?? 0} vérifications OK
                        </p>
                      )}
                    </div>
                    <Clock className="w-3.5 h-3.5 text-gray-300 shrink-0 mt-1" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* No period selected placeholder */}
      {!selPeriodId && !periodsLoading && (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 p-10 text-center">
          <Calendar className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Sélectionnez ou créez une période pour commencer</p>
          <p className="text-sm text-gray-400 mt-1">La clôture mensuelle fige les états financiers et verrouille les écritures comptables</p>
        </div>
      )}

      {/* Reopen modal */}
      {showReopenModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-1">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Réouvrir la période
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Cette action annule la clôture de <strong>{fmtMonth(activePeriod?.month ?? "", activePeriod?.year ?? "")}</strong> et permet de modifier les écritures.
              Action réservée aux administrateurs — sera journalisée.
            </p>
            <label className="block text-sm font-medium text-gray-700 mb-1">Motif de réouverture <span className="text-red-500">*</span></label>
            <textarea
              value={reopenReason}
              onChange={e => setReopenReason(e.target.value)}
              rows={3}
              placeholder="Ex: Correction d'une écriture d'amortissement erronée…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none resize-none"
            />
            <div className="flex gap-3 mt-4">
              <button onClick={() => setShowReopenModal(false)} className="flex-1 border border-gray-300 rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">Annuler</button>
              <button
                onClick={() => reopenPeriod.mutate()}
                disabled={!reopenReason.trim() || reopenPeriod.isPending}
                className="flex-1 bg-amber-600 text-white rounded-lg px-4 py-2.5 text-sm font-semibold hover:bg-amber-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {reopenPeriod.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlock className="w-4 h-4" />}
                Confirmer la réouverture
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
