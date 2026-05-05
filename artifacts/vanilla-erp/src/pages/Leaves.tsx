import { useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import {
  useGetLeaves, useCreateLeave, useApproveLeave, useDeleteLeave,
  useGetEmployees, useGetLeaveStats, useGetLeaveBalances,
} from "@workspace/api-client-react";
import { CreateLeaveBody, Leave, LeaveBalance } from "@workspace/api-zod";
import { toast } from "sonner";
import {
  CalendarDays, List, BarChart2,
  ChevronLeft, ChevronRight, Plus, Check, X,
  Trash2, Clock, AlertCircle, RefreshCw,
} from "lucide-react";

// ── helpers ───────────────────────────────────────────────────────────────────
const toYMD = (d: Date) => d.toISOString().slice(0, 10);
const todayYMD = toYMD(new Date());

const TYPE_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  annual:  { label: "Congé annuel",       color: "text-emerald-700", bg: "bg-emerald-100" },
  sick:    { label: "Congé maladie",       color: "text-blue-700",    bg: "bg-blue-100"    },
  unpaid:  { label: "Congé sans solde",    color: "text-gray-700",    bg: "bg-gray-100"    },
};

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  pending:  { label: "En attente",  color: "text-amber-700",   bg: "bg-amber-100",   dot: "bg-amber-400"   },
  approved: { label: "Approuvé",    color: "text-emerald-700", bg: "bg-emerald-100", dot: "bg-emerald-500" },
  rejected: { label: "Rejeté",      color: "text-red-700",     bg: "bg-red-100",     dot: "bg-red-400"     },
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}
function prevMonth(m: string) {
  const [y, mo] = m.split("-").map(Number);
  return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, "0")}`;
}
function nextMonth(m: string) {
  const [y, mo] = m.split("-").map(Number);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
}
function monthLabel(m: string) {
  const [y, mo] = m.split("-").map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

// ── StatusBadge ───────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const s = STATUS_LABELS[status] ?? { label: status, color: "text-gray-600", bg: "bg-gray-100", dot: "bg-gray-400" };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

// ── TypeBadge ─────────────────────────────────────────────────────────────────
function TypeBadge({ type }: { type: string }) {
  const t = TYPE_LABELS[type] ?? { label: type, color: "text-gray-600", bg: "bg-gray-100" };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${t.bg} ${t.color}`}>
      {t.label}
    </span>
  );
}

// ── Leave Request Modal ────────────────────────────────────────────────────────
type LeaveFormData = { employeeId: string; type: string; startDate: string; endDate: string; reason: string };

function LeaveModal({
  employees,
  onClose,
  onSaved,
}: { employees: any[]; onClose: () => void; onSaved: () => void }) {
  const createLeave = useCreateLeave();
  const [apiErr, setApiErr] = useState("");

  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<LeaveFormData>({
    defaultValues: { employeeId: "", type: "annual", startDate: "", endDate: "", reason: "" },
  });

  const startDate = watch("startDate");
  const endDate   = watch("endDate");
  const leaveType = watch("type");

  const days = startDate && endDate
    ? Math.max(0, Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1)
    : 0;

  const onSubmit = async (data: LeaveFormData) => {
    setApiErr("");
    try {
      const body: CreateLeaveBody = {
        employeeId: data.employeeId,
        type: data.type,
        startDate: data.startDate,
        endDate: data.endDate,
        reason: data.reason || null,
      };
      await createLeave.mutateAsync({ data: body });
      toast.success("Demande de congé soumise");
      onSaved();
      onClose();
    } catch (e: any) {
      let msg = e?.message ?? "Erreur";
      try { msg = JSON.parse(msg).error ?? msg; } catch { /* noop */ }
      setApiErr(msg);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex justify-between items-center p-5 border-b">
          <div>
            <h2 className="text-lg font-bold text-gray-800">Nouvelle demande de congé</h2>
            <p className="text-xs text-gray-500 mt-0.5">Accrual : 2,5 jours / mois (standard Madagascar)</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
          {apiErr && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0" /> {apiErr}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Employé *</label>
            <select {...register("employeeId", { required: "Employé requis" })}
              className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none">
              <option value="">— Sélectionner —</option>
              {employees.filter(e => e.isActive).map(e => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
            {errors.employeeId && <p className="text-red-500 text-xs mt-1">{errors.employeeId.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type de congé *</label>
            <select {...register("type", { required: "Type requis" })}
              className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none">
              {Object.entries(TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            {leaveType && (
              <p className="text-xs mt-1" style={{ color: leaveType === "annual" ? "#059669" : leaveType === "sick" ? "#2563eb" : "#6b7280" }}>
                {leaveType === "annual" && "Acquis : 2,5 jours / mois"}
                {leaveType === "sick"   && "Allocation : 15 jours / an"}
                {leaveType === "unpaid" && "Sans déduction du solde"}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date début *</label>
              <input type="date" {...register("startDate", { required: "Date début requise" })}
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
              {errors.startDate && <p className="text-red-500 text-xs mt-1">{errors.startDate.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date fin *</label>
              <input type="date" {...register("endDate", {
                required: "Date fin requise",
                validate: v => !startDate || v >= startDate || "Fin avant début",
              })} min={startDate}
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
              {errors.endDate && <p className="text-red-500 text-xs mt-1">{errors.endDate.message}</p>}
            </div>
          </div>

          {days > 0 && (
            <div className="p-3 bg-blue-50 rounded-xl text-sm text-blue-700 font-semibold text-center">
              Durée : {days} jour{days > 1 ? "s" : ""}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Motif (optionnel)</label>
            <textarea {...register("reason")} rows={2} placeholder="Précisez la raison…"
              className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none resize-none" />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
              Annuler
            </button>
            <button type="submit" disabled={isSubmitting || createLeave.isPending}
              className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors">
              {isSubmitting || createLeave.isPending ? "Envoi…" : "Soumettre"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── CALENDAR VIEW ─────────────────────────────────────────────────────────────
function CalendarView({ leaves, employees }: { leaves: Leave[]; employees: any[] }) {
  const [month, setMonth] = useState(() => todayYMD.slice(0, 7));
  const [filterEmp, setFilterEmp] = useState("all");

  const [yr, mo] = month.split("-").map(Number);
  const firstDay = new Date(yr, mo - 1, 1);
  const daysInMonth = new Date(yr, mo, 0).getDate();

  let startOffset = firstDay.getDay() - 1;
  if (startOffset < 0) startOffset = 6;

  const cells: (string | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => {
      const d = i + 1;
      return `${yr}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  // Filter leaves to this month + employee
  const filtered = leaves.filter(l => {
    const start = l.startDate.slice(0, 7);
    const end   = l.endDate.slice(0, 7);
    const inMonth = start <= month && end >= month;
    const empOk = filterEmp === "all" || l.employeeId === filterEmp;
    return inMonth && empOk && l.status !== "rejected";
  });

  // Build day → leaves map
  const byDay: Record<string, Leave[]> = {};
  for (const leave of filtered) {
    const s = new Date(leave.startDate);
    const e = new Date(leave.endDate);
    for (let d = new Date(yr, mo - 1, 1); d <= new Date(yr, mo, 0); d.setDate(d.getDate() + 1)) {
      if (d >= s && d <= e) {
        const key = toYMD(new Date(d));
        if (!byDay[key]) byDay[key] = [];
        byDay[key].push(leave);
      }
    }
  }

  return (
    <div>
      {/* Month nav + Employee filter */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button onClick={() => setMonth(prevMonth(month))}
            className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <span className="text-lg font-bold text-gray-800 capitalize min-w-[200px] text-center">{monthLabel(month)}</span>
          <button onClick={() => setMonth(nextMonth(month))}
            className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
            <ChevronRight className="w-5 h-5 text-gray-600" />
          </button>
        </div>
        <select value={filterEmp} onChange={e => setFilterEmp(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white">
          <option value="all">Tous les employés</option>
          {employees.filter(e => e.isActive).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map(d => (
          <div key={d} className="text-center text-xs font-semibold text-gray-400 py-2">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((dateStr, idx) => {
          if (!dateStr) return <div key={`empty-${idx}`} className="min-h-[80px]" />;
          const dayNum = new Date(dateStr + "T12:00:00").getDate();
          const isToday = dateStr === todayYMD;
          const dayLeaves = byDay[dateStr] ?? [];
          const isWeekend = new Date(dateStr + "T12:00:00").getDay() === 0;

          return (
            <div key={dateStr}
              className={`min-h-[80px] p-1.5 rounded-xl border transition-colors
                ${isToday ? "border-emerald-400 bg-emerald-50/60" :
                  isWeekend ? "border-gray-100 bg-gray-50/40" :
                  "border-gray-200 bg-white hover:border-gray-300"}`}>
              <div className={`text-xs font-bold mb-1 ${isToday ? "text-emerald-600" : isWeekend ? "text-gray-400" : "text-gray-700"}`}>
                {dayNum}
                {isToday && <span className="ml-1 text-emerald-500">●</span>}
              </div>
              <div className="space-y-0.5">
                {dayLeaves.slice(0, 3).map(l => {
                  const st = STATUS_LABELS[l.status];
                  const ty = TYPE_LABELS[l.type];
                  const empName = (employees.find(e => e.id === l.employeeId)?.name ?? "").split(" ")[0];
                  return (
                    <div key={l.id}
                      className={`text-xs px-1.5 py-0.5 rounded-md truncate font-medium ${st?.bg} ${st?.color}`}
                      title={`${empName} — ${ty?.label ?? l.type}`}>
                      {empName}
                    </div>
                  );
                })}
                {dayLeaves.length > 3 && (
                  <div className="text-xs text-gray-400 px-1">+{dayLeaves.length - 3}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 mt-4 px-1">
        {Object.entries(STATUS_LABELS).filter(([k]) => k !== "rejected").map(([k, v]) => (
          <div key={k} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded-sm ${v.bg}`} />
            <span className="text-xs text-gray-500">{v.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── REQUESTS VIEW ─────────────────────────────────────────────────────────────
function RequestsView({ leaves, employees, onRefresh }: { leaves: Leave[]; employees: any[]; onRefresh: () => void }) {
  const approveLeave = useApproveLeave();
  const deleteLeave  = useDeleteLeave();
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterEmp,    setFilterEmp]    = useState("all");
  const [showModal,    setShowModal]    = useState(false);

  const filtered = useMemo(() => {
    return leaves
      .filter(l => filterStatus === "all" || l.status === filterStatus)
      .filter(l => filterEmp === "all" || l.employeeId === filterEmp)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [leaves, filterStatus, filterEmp]);

  const handleApprove = async (id: string, status: "approved" | "rejected") => {
    try {
      await approveLeave.mutateAsync({ id, data: { status } });
      toast.success(status === "approved" ? "Congé approuvé" : "Congé refusé");
      onRefresh();
    } catch {
      toast.error("Erreur lors de la mise à jour");
    }
  };

  const handleDelete = async (id: string, empName: string) => {
    if (!confirm(`Supprimer la demande de congé de ${empName} ?`)) return;
    try {
      await deleteLeave.mutateAsync({ id });
      toast.success("Demande supprimée");
      onRefresh();
    } catch {
      toast.error("Erreur lors de la suppression");
    }
  };

  return (
    <div>
      {/* Filters + Add button */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex gap-2 flex-wrap flex-1">
          {["all", "pending", "approved", "rejected"].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors
                ${filterStatus === s ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}>
              {s === "all" ? `Tous (${leaves.length})` : `${STATUS_LABELS[s]?.label} (${leaves.filter(l => l.status === s).length})`}
            </button>
          ))}
        </div>
        <select value={filterEmp} onChange={e => setFilterEmp(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white">
          <option value="all">Tous les employés</option>
          {employees.filter(e => e.isActive).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors whitespace-nowrap">
          <Plus className="w-4 h-4" /> Nouvelle demande
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {["Employé", "Type", "Période", "Durée", "Motif", "Statut", "Actions"].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-gray-400 text-sm">Aucune demande</td></tr>
            ) : filtered.map(leave => {
              const empName = employees.find(e => e.id === leave.employeeId)?.name ?? leave.employeeId;
              return (
                <tr key={leave.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-800">{empName}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{fmtDate(leave.createdAt)}</div>
                  </td>
                  <td className="px-4 py-3"><TypeBadge type={leave.type} /></td>
                  <td className="px-4 py-3">
                    <div className="text-gray-700 whitespace-nowrap">{fmtDate(leave.startDate)}</div>
                    <div className="text-gray-400 text-xs">→ {fmtDate(leave.endDate)}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-gray-700">{leave.days}j</span>
                  </td>
                  <td className="px-4 py-3 max-w-[160px]">
                    <div className="text-gray-500 text-xs truncate" title={leave.reason ?? ""}>
                      {leave.reason ?? <span className="text-gray-300">—</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={leave.status} /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {leave.status === "pending" && (
                        <>
                          <button onClick={() => handleApprove(leave.id, "approved")}
                            title="Approuver"
                            className="p-1.5 bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 transition-colors">
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleApprove(leave.id, "rejected")}
                            title="Rejeter"
                            className="p-1.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                      {leave.status === "approved" && (
                        <button onClick={() => handleApprove(leave.id, "rejected")}
                          title="Annuler l'approbation"
                          className="p-1.5 bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 transition-colors">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button onClick={() => handleDelete(leave.id, empName)}
                        title="Supprimer"
                        className="p-1.5 bg-gray-100 text-gray-500 rounded-lg hover:bg-gray-200 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showModal && (
        <LeaveModal
          employees={employees}
          onClose={() => setShowModal(false)}
          onSaved={onRefresh}
        />
      )}
    </div>
  );
}

// ── BALANCES VIEW ─────────────────────────────────────────────────────────────
function BalancesView({ balances, isLoading }: { balances: LeaveBalance[]; isLoading: boolean }) {
  const [search, setSearch] = useState("");

  const filtered = balances.filter(b =>
    !search || (b.employee as any)?.name?.toLowerCase().includes(search.toLowerCase()),
  );

  function BalanceBar({ used, total, color }: { used: number; total: number; color: string }) {
    const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
    const bgClass = pct > 80 ? "bg-red-500" : pct > 60 ? "bg-amber-400" : color;
    return (
      <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${bgClass}`} style={{ width: `${pct}%` }} />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
        <RefreshCw className="w-4 h-4 animate-spin" /> Chargement…
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher un employé…"
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 flex-1 max-w-xs" />
        <span className="text-sm text-gray-500">{filtered.length} employé(s)</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map(b => {
          const emp = b.employee as any;
          const annualRemaining = Math.max(0, b.annualDays - b.usedAnnualDays);
          const sickRemaining   = Math.max(0, b.sickDays - b.usedSickDays);

          return (
            <div key={b.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 hover:shadow-md transition-shadow">
              {/* Employee header */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                  {(emp?.name ?? "?").split(" ").map((n: string) => n[0]).slice(0, 2).join("")}
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-gray-800 truncate">{emp?.name ?? b.employeeId}</div>
                  <div className="text-xs text-gray-500">{emp?.position} · {b.year}</div>
                </div>
              </div>

              {/* Annual leave */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-gray-600">Congé annuel</span>
                  <span className={`text-xs font-bold ${annualRemaining <= 3 ? "text-red-600" : "text-emerald-600"}`}>
                    {annualRemaining.toFixed(1)}j restants
                  </span>
                </div>
                <BalanceBar used={b.usedAnnualDays} total={b.annualDays} color="bg-emerald-500" />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>Utilisé : {b.usedAnnualDays.toFixed(1)}j</span>
                  <span>Acquis : {b.annualDays.toFixed(1)}j</span>
                </div>
              </div>

              {/* Sick leave */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-gray-600">Congé maladie</span>
                  <span className={`text-xs font-bold ${sickRemaining <= 3 ? "text-red-600" : "text-blue-600"}`}>
                    {sickRemaining.toFixed(1)}j restants
                  </span>
                </div>
                <BalanceBar used={b.usedSickDays} total={b.sickDays} color="bg-blue-500" />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>Utilisé : {b.usedSickDays.toFixed(1)}j</span>
                  <span>Alloué : {b.sickDays.toFixed(1)}j</span>
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && !isLoading && (
          <div className="col-span-full text-center py-12 text-gray-400">Aucun employé trouvé</div>
        )}
      </div>
    </div>
  );
}

// ── MAIN PAGE ─────────────────────────────────────────────────────────────────
const TABS = [
  { id: "calendar",  label: "Calendrier",  icon: CalendarDays },
  { id: "requests",  label: "Demandes",    icon: List         },
  { id: "balances",  label: "Soldes",      icon: BarChart2    },
] as const;

export default function LeavesPage() {
  const [tab, setTab] = useState<typeof TABS[number]["id"]>("requests");
  const [showModal, setShowModal] = useState(false);

  const { data: leaves = [],    isLoading: leavesLoading,   refetch: refetchLeaves  } = useGetLeaves();
  const { data: employees = [] }                                                        = useGetEmployees();
  const { data: stats }                                                                 = useGetLeaveStats();
  const { data: balances = [],  isLoading: balancesLoading, refetch: refetchBalances } = useGetLeaveBalances({});

  const refetchAll = () => { refetchLeaves(); refetchBalances(); };

  const pending  = leaves.filter(l => l.status === "pending").length;
  const absent   = stats?.absentToday ?? 0;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Gestion des congés</h1>
          <p className="text-gray-500 text-sm mt-1">
            Calendrier · Workflow validation · Soldes automatiques
          </p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors shadow-sm">
          <Plus className="w-4 h-4" /> Nouvelle demande
        </button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: "En attente",       value: pending,                   icon: Clock,         color: "text-amber-600",   bg: "bg-amber-50",   border: "border-amber-200"   },
          { label: "Absents aujourd'hui", value: absent,                 icon: AlertCircle,   color: "text-red-600",     bg: "bg-red-50",     border: "border-red-200"     },
          { label: "Approuvés",          value: stats?.approvedCount ?? 0, icon: Check,       color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" },
          { label: "Ce mois-ci",         value: stats?.totalThisMonth ?? 0, icon: CalendarDays, color: "text-blue-600", bg: "bg-blue-50",    border: "border-blue-200"    },
        ].map(kpi => (
          <div key={kpi.label} className={`${kpi.bg} ${kpi.border} border rounded-2xl p-4 flex items-center gap-3`}>
            <div className={`p-2 bg-white rounded-xl shadow-sm ${kpi.color}`}>
              <kpi.icon className="w-5 h-5" />
            </div>
            <div>
              <div className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</div>
              <div className="text-xs text-gray-500">{kpi.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl w-fit mb-6">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all
              ${tab === t.id ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
            <t.icon className="w-4 h-4" />
            {t.label}
            {t.id === "requests" && pending > 0 && (
              <span className="bg-amber-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {pending}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {leavesLoading ? (
        <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" /> Chargement…
        </div>
      ) : (
        <>
          {tab === "calendar" && <CalendarView leaves={leaves} employees={employees} />}
          {tab === "requests" && <RequestsView leaves={leaves} employees={employees} onRefresh={refetchAll} />}
          {tab === "balances" && <BalancesView balances={balances} isLoading={balancesLoading} />}
        </>
      )}

      {showModal && (
        <LeaveModal
          employees={employees}
          onClose={() => setShowModal(false)}
          onSaved={refetchAll}
        />
      )}
    </div>
  );
}
