import { useState, useEffect, useCallback } from "react";
import {
  useGetAttendance,
  useGetAttendanceMonth,
  useCheckIn,
  useCheckOut,
  useGetEmployees,
} from "@workspace/api-client-react";
import { AttendanceRecord } from "@workspace/api-zod";
import {
  Clock, Calendar, Users, ChevronLeft, ChevronRight,
  LogIn, LogOut, CheckCircle2, XCircle,
  RefreshCw, Edit3, X, Save,
} from "lucide-react";
import { toast } from "sonner";

// ── helpers ──────────────────────────────────────────────────────────────────
const toYMD = (d: Date) => d.toISOString().slice(0, 10);
const todayYMD = toYMD(new Date());

function fmtTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** HH:MM string safe for <input type="time"> value */
function toTimeInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function fmtDuration(ci: string | null | undefined, co: string | null | undefined) {
  if (!ci || !co) return null;
  const ms = new Date(co).getTime() - new Date(ci).getTime();
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h${String(m).padStart(2, "0")}`;
}
function monthLabel(month: string) {
  const [yr, mo] = month.split("-").map(Number);
  return new Date(yr, mo - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}
function prevMonth(m: string) {
  const [yr, mo] = m.split("-").map(Number);
  const d = new Date(yr, mo - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function nextMonth(m: string) {
  const [yr, mo] = m.split("-").map(Number);
  const d = new Date(yr, mo, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function isWeekend(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return d.getDay() === 0 || d.getDay() === 6;
}
function dayStatus(record: AttendanceRecord | undefined, dateStr: string): "present" | "half" | "absent" | "weekend" | "future" {
  if (dateStr > todayYMD) return "future";
  if (isWeekend(dateStr)) return "weekend";
  if (!record) return "absent";
  if (record.checkIn && record.checkOut) return "present";
  if (record.checkIn) return "half";
  return "absent";
}

async function apiFetch(url: string, opts?: RequestInit) {
  const r = await fetch(url, { credentials: "include", ...opts });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as any).error ?? r.statusText);
  return j;
}

// ── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: ReturnType<typeof dayStatus> }) {
  const cfg = {
    present: { cls: "bg-emerald-100 text-emerald-700 border-emerald-200", label: "Présent" },
    half:    { cls: "bg-amber-100 text-amber-700 border-amber-200",   label: "En cours" },
    absent:  { cls: "bg-red-100 text-red-600 border-red-200",         label: "Absent" },
    weekend: { cls: "bg-gray-100 text-gray-400 border-gray-200",      label: "Weekend" },
    future:  { cls: "bg-gray-50 text-gray-300 border-gray-100",       label: "—" },
  }[status];
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.cls}`}>{cfg.label}</span>
  );
}

// ── Live clock ────────────────────────────────────────────────────────────────
function LiveClock() {
  const [t, setT] = useState(new Date());
  useEffect(() => { const id = setInterval(() => setT(new Date()), 1000); return () => clearInterval(id); }, []);
  return (
    <div className="text-right">
      <div className="text-2xl font-mono font-bold text-gray-800 tabular-nums">
        {t.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
      </div>
      <div className="text-xs text-gray-500 mt-0.5">
        {t.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
      </div>
    </div>
  );
}

// ── Manual entry modal ────────────────────────────────────────────────────────
function ManualEntryModal({
  employeeId, employeeName, date, existing, onClose, onSaved,
}: {
  employeeId: string; employeeName: string; date: string;
  existing?: AttendanceRecord; onClose: () => void; onSaved: () => void;
}) {
  const [checkIn,  setCheckIn]  = useState(() => toTimeInput(existing?.checkIn));
  const [checkOut, setCheckOut] = useState(() => toTimeInput(existing?.checkOut));
  const [loading,  setLoading]  = useState(false);

  // Sync if parent passes a new `existing` (e.g. modal reused without unmount)
  useEffect(() => {
    setCheckIn(toTimeInput(existing?.checkIn));
    setCheckOut(toTimeInput(existing?.checkOut));
  }, [existing?.checkIn, existing?.checkOut]);

  const save = async () => {
    setLoading(true);
    try {
      await apiFetch("/api/attendance/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, date, checkIn: checkIn || undefined, checkOut: checkOut || undefined }),
      });
      toast.success(`Pointage mis à jour — ${employeeName} (${date})`);
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <div className="font-semibold text-gray-800">{employeeName}</div>
            <div className="text-xs text-gray-500">{new Date(date + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4 text-gray-500" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Heure d'arrivée</label>
            <input type="time" value={checkIn} onChange={e => setCheckIn(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Heure de départ</label>
            <input type="time" value={checkOut} onChange={e => setCheckOut(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
              Annuler
            </button>
            <button onClick={save} disabled={loading}
              className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Enregistrer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── TODAY VIEW ────────────────────────────────────────────────────────────────
function TodayView({ records, employees, isLoading, refetch }: {
  records: AttendanceRecord[]; employees: any[]; isLoading: boolean; refetch: () => void;
}) {
  const checkIn  = useCheckIn();
  const checkOut = useCheckOut();
  const [processing, setProcessing] = useState<string | null>(null);
  const [editModal, setEditModal]   = useState<{ empId: string; empName: string; record?: AttendanceRecord } | null>(null);

  const recordMap: Record<string, AttendanceRecord> = {};
  records.forEach(r => { recordMap[r.employeeId] = r; });

  const activeEmployees = employees.filter(e => e.isActive);
  const presentCount = Object.keys(recordMap).length;
  const doneCount    = records.filter(r => r.checkIn && r.checkOut).length;
  const inProgress   = records.filter(r => r.checkIn && !r.checkOut).length;
  const absentCount  = activeEmployees.length - presentCount;

  const handleCheckIn = async (empId: string) => {
    setProcessing(empId + "-in");
    try { await checkIn.mutateAsync({ data: { employeeId: empId } }); refetch(); toast.success("Arrivée pointée"); }
    catch (e: any) { toast.error(e?.response?.data?.error ?? "Erreur"); }
    finally { setProcessing(null); }
  };
  const handleCheckOut = async (empId: string) => {
    setProcessing(empId + "-out");
    try { await checkOut.mutateAsync({ data: { employeeId: empId } }); refetch(); toast.success("Départ pointé"); }
    catch (e: any) { toast.error(e?.response?.data?.error ?? "Erreur"); }
    finally { setProcessing(null); }
  };

  const kpis = [
    { label: "Présents",   value: presentCount,               color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200", icon: <CheckCircle2 className="w-5 h-5 text-emerald-500" /> },
    { label: "En cours",   value: inProgress,                 color: "text-amber-600",   bg: "bg-amber-50",   border: "border-amber-200",   icon: <Clock className="w-5 h-5 text-amber-500" /> },
    { label: "Terminé",    value: doneCount,                  color: "text-blue-600",    bg: "bg-blue-50",    border: "border-blue-200",    icon: <LogOut className="w-5 h-5 text-blue-500" /> },
    { label: "Absents",    value: absentCount,                color: "text-red-600",     bg: "bg-red-50",     border: "border-red-200",     icon: <XCircle className="w-5 h-5 text-red-500" /> },
    { label: "Total",      value: activeEmployees.length,     color: "text-gray-700",    bg: "bg-gray-50",    border: "border-gray-200",    icon: <Users className="w-5 h-5 text-gray-500" /> },
  ];

  return (
    <div className="space-y-4">
      {/* KPI */}
      <div className="grid grid-cols-5 gap-3">
        {kpis.map(k => (
          <div key={k.label} className={`${k.bg} border ${k.border} rounded-2xl p-4 flex flex-col items-center gap-2 shadow-sm`}>
            {k.icon}
            <div className={`text-3xl font-bold ${k.color}`}>{k.value}</div>
            <div className="text-xs text-gray-500 font-medium">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Employee cards grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" /> Chargement…
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {activeEmployees.map(emp => {
            const record = recordMap[emp.id];
            const status = dayStatus(record, todayYMD);
            const duration = fmtDuration(record?.checkIn, record?.checkOut);

            const cardCls = {
              present: "border-emerald-200 bg-gradient-to-br from-emerald-50 to-white",
              half:    "border-amber-200 bg-gradient-to-br from-amber-50 to-white",
              absent:  "border-gray-200 bg-white",
              weekend: "border-gray-100 bg-gray-50",
              future:  "border-gray-100 bg-gray-50",
            }[status];

            return (
              <div key={emp.id} className={`rounded-2xl border p-4 shadow-sm hover:shadow-md transition-shadow ${cardCls}`}>
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center text-sm font-bold text-gray-600 shrink-0">
                      {emp.name.split(" ").map((n: string) => n[0]).slice(0, 2).join("")}
                    </div>
                    <div>
                      <div className="font-semibold text-gray-800 text-sm leading-tight">{emp.name}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{emp.position || "—"}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <StatusBadge status={status} />
                    <button onClick={() => setEditModal({ empId: emp.id, empName: emp.name, record })}
                      className="p-1 hover:bg-gray-100 rounded-lg transition-colors" title="Saisie manuelle">
                      <Edit3 className="w-3.5 h-3.5 text-gray-400" />
                    </button>
                  </div>
                </div>

                {/* Times */}
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {[
                    { label: "Arrivée", value: fmtTime(record?.checkIn), color: "text-emerald-600" },
                    { label: "Départ",  value: fmtTime(record?.checkOut), color: "text-gray-700" },
                    { label: "Durée",   value: duration ?? "—", color: "text-blue-600" },
                  ].map(f => (
                    <div key={f.label} className="bg-white/70 rounded-xl p-2 text-center border border-white/80">
                      <div className={`font-mono font-semibold text-sm ${f.color}`}>{f.value}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{f.label}</div>
                    </div>
                  ))}
                </div>

                {/* Action */}
                {!record ? (
                  <button onClick={() => handleCheckIn(emp.id)}
                    disabled={processing === emp.id + "-in"}
                    className="w-full flex items-center justify-center gap-2 py-2 bg-emerald-600 text-white rounded-xl text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                    {processing === emp.id + "-in" ? <RefreshCw className="w-3 h-3 animate-spin" /> : <LogIn className="w-3 h-3" />}
                    Pointer arrivée
                  </button>
                ) : !record.checkOut ? (
                  <button onClick={() => handleCheckOut(emp.id)}
                    disabled={processing === emp.id + "-out"}
                    className="w-full flex items-center justify-center gap-2 py-2 bg-amber-500 text-white rounded-xl text-xs font-semibold hover:bg-amber-600 disabled:opacity-50 transition-colors">
                    {processing === emp.id + "-out" ? <RefreshCw className="w-3 h-3 animate-spin" /> : <LogOut className="w-3 h-3" />}
                    Pointer départ
                  </button>
                ) : (
                  <div className="w-full flex items-center justify-center gap-2 py-2 bg-gray-50 text-gray-500 rounded-xl text-xs font-medium border border-gray-100">
                    <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Journée complète
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editModal && (
        <ManualEntryModal
          employeeId={editModal.empId}
          employeeName={editModal.empName}
          date={todayYMD}
          existing={editModal.record}
          onClose={() => setEditModal(null)}
          onSaved={refetch}
        />
      )}
    </div>
  );
}

// ── DAY DETAIL PANEL — fetches its own data for the selected date ─────────────
function DayDetailPanel({
  selectedDay, activeEmps, onClose,
}: { selectedDay: string; activeEmps: any[]; onClose: () => void }) {
  const { data: dayAttendance, isLoading: dayLoading, refetch } = useGetAttendance({ date: selectedDay });
  const [editModal, setEditModal] = useState<{ empId: string; empName: string; record?: AttendanceRecord } | null>(null);

  // Build employeeId → record map from FRESH fetch
  const recMap: Record<string, AttendanceRecord> = {};
  (dayAttendance ?? []).forEach(r => { recMap[r.employeeId] = r; });

  const presentCount = Object.keys(recMap).length;

  // Sort: present employees first
  const sorted = [...activeEmps].sort((a, b) => {
    if (recMap[a.id] && !recMap[b.id]) return -1;
    if (!recMap[a.id] && recMap[b.id]) return 1;
    return 0;
  });

  return (
    <div className="w-80 shrink-0">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm sticky top-0">
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <div className="font-bold text-gray-800 capitalize">
              {new Date(selectedDay + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              {dayLoading ? "…" : `${presentCount} présent(s) / ${activeEmps.length} employés`}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>
        <div className="p-3 max-h-[480px] overflow-y-auto space-y-2">
          {dayLoading ? (
            <div className="flex items-center justify-center py-6 text-gray-400 gap-1 text-xs">
              <RefreshCw className="w-3 h-3 animate-spin" /> Chargement…
            </div>
          ) : sorted.map(emp => {
            const rec    = recMap[emp.id];
            const status = dayStatus(rec, selectedDay);
            const dur    = fmtDuration(rec?.checkIn, rec?.checkOut);
            return (
              <div key={emp.id}
                className={`flex items-center gap-3 p-2.5 rounded-xl border hover:border-gray-200 transition-colors
                  ${rec ? "border-emerald-100 bg-emerald-50/30" : "border-gray-100 bg-gray-50/50"}`}>
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center text-xs font-bold text-gray-600 shrink-0">
                  {emp.name.split(" ").map((n: string) => n[0]).slice(0, 2).join("")}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-gray-800 truncate">{emp.name}</div>
                  {rec ? (
                    <div className="text-xs text-emerald-700 font-mono mt-0.5">
                      {fmtTime(rec.checkIn)} → {fmtTime(rec.checkOut)} {dur ? `· ${dur}` : ""}
                    </div>
                  ) : (
                    <div className="text-xs text-gray-400 mt-0.5">Aucun pointage</div>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <StatusBadge status={status} />
                  <button
                    onClick={() => setEditModal({ empId: emp.id, empName: emp.name, record: rec })}
                    className="p-1 hover:bg-gray-200 rounded-lg transition-colors"
                    title="Modifier">
                    <Edit3 className="w-3 h-3 text-gray-400" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {editModal && (
        <ManualEntryModal
          key={`${editModal.empId}-${selectedDay}`}
          employeeId={editModal.empId}
          employeeName={editModal.empName}
          date={selectedDay}
          existing={editModal.record}
          onClose={() => setEditModal(null)}
          onSaved={() => { refetch(); setEditModal(null); }}
        />
      )}
    </div>
  );
}

// ── CALENDAR VIEW ─────────────────────────────────────────────────────────────
function CalendarView({ employees }: { employees: any[] }) {
  const [month, setMonth]         = useState(() => todayYMD.slice(0, 7));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const { data: monthRecords, isLoading } = useGetAttendanceMonth({ month });

  // Build lookup: date (YYYY-MM-DD) → employeeId → record (for calendar dot stats only)
  const byDate: Record<string, Record<string, AttendanceRecord>> = {};
  (monthRecords ?? []).forEach(r => {
    const d = r.date.slice(0, 10);
    if (!byDate[d]) byDate[d] = {};
    byDate[d][r.employeeId] = r;
  });

  // Build calendar grid
  const [yr, mo] = month.split("-").map(Number);
  const firstDay = new Date(yr, mo - 1, 1);
  const lastDay  = new Date(yr, mo, 0);
  const daysInMonth = lastDay.getDate();

  // Offset so Monday = col 0
  let startOffset = firstDay.getDay() - 1;
  if (startOffset < 0) startOffset = 6;

  const cells: (string | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => {
      const d = i + 1;
      return `${yr}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }),
  ];
  // Pad to full weeks
  while (cells.length % 7 !== 0) cells.push(null);

  const activeEmps = employees.filter(e => e.isActive);

  return (
    <div className="flex gap-4 min-h-0">
      {/* Calendar grid */}
      <div className="flex-1 min-w-0">
        {/* Month navigator */}
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setMonth(prevMonth(month))}
            className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="text-lg font-bold text-gray-800 capitalize">{monthLabel(month)}</div>
          <button onClick={() => setMonth(nextMonth(month))}
            className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
            <ChevronRight className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 mb-1">
          {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map(d => (
            <div key={d} className="text-center text-xs font-semibold text-gray-400 py-2">{d}</div>
          ))}
        </div>

        {/* Cells */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" /> Chargement…
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1.5">
            {cells.map((dateStr, idx) => {
              if (!dateStr) return <div key={`empty-${idx}`} />;
              const dayNum    = new Date(dateStr + "T12:00:00").getDate();
              const isToday   = dateStr === todayYMD;
              const isSel     = dateStr === selectedDay;
              const weekend   = isWeekend(dateStr);
              const isFuture  = dateStr > todayYMD;
              const dayData   = byDate[dateStr] ?? {};

              // Stats for this day
              const present = activeEmps.filter(e => dayData[e.id]?.checkIn && dayData[e.id]?.checkOut).length;
              const half    = activeEmps.filter(e => dayData[e.id]?.checkIn && !dayData[e.id]?.checkOut).length;
              const absent  = weekend || isFuture ? 0 : activeEmps.length - present - half;
              const total   = activeEmps.length;

              return (
                <button
                  key={dateStr}
                  onClick={() => setSelectedDay(isSel ? null : dateStr)}
                  className={`
                    relative rounded-2xl p-2 text-left transition-all border
                    ${isSel ? "ring-2 ring-emerald-500 border-emerald-300 bg-emerald-50" :
                      isToday ? "border-emerald-400 bg-emerald-50/50" :
                      weekend ? "border-gray-100 bg-gray-50/50 opacity-60" :
                      isFuture ? "border-gray-100 bg-white opacity-40 cursor-default" :
                      "border-gray-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/30"}
                  `}
                  disabled={isFuture}
                >
                  <div className={`text-sm font-bold mb-1.5 ${isToday ? "text-emerald-600" : weekend ? "text-gray-400" : "text-gray-700"}`}>
                    {dayNum}
                    {isToday && <span className="ml-1 text-xs font-normal text-emerald-500">●</span>}
                  </div>

                  {!weekend && !isFuture && (
                    <div className="space-y-0.5">
                      {present > 0 && (
                        <div className="flex items-center gap-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                          <span className="text-xs text-emerald-600 font-medium">{present}/{total}</span>
                        </div>
                      )}
                      {half > 0 && (
                        <div className="flex items-center gap-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                          <span className="text-xs text-amber-600">{half}</span>
                        </div>
                      )}
                      {absent > 0 && present === 0 && (
                        <div className="flex items-center gap-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                          <span className="text-xs text-red-500">{absent} abs.</span>
                        </div>
                      )}
                      {present === 0 && half === 0 && absent === 0 && !weekend && !isFuture && (
                        <div className="text-xs text-gray-300">—</div>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center gap-4 mt-4 px-1">
          {[
            { dot: "bg-emerald-500", label: "Présent (complet)" },
            { dot: "bg-amber-400",   label: "En cours / demi-journée" },
            { dot: "bg-red-400",     label: "Absent" },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-1.5">
              <div className={`w-2.5 h-2.5 rounded-full ${l.dot}`} />
              <span className="text-xs text-gray-500">{l.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Day detail panel — dedicated component with its own data fetch */}
      {selectedDay && (
        <DayDetailPanel
          key={selectedDay}
          selectedDay={selectedDay}
          activeEmps={activeEmps}
          onClose={() => setSelectedDay(null)}
        />
      )}
    </div>
  );
}

// ── EMPLOYEE VIEW ─────────────────────────────────────────────────────────────
function EmployeeView({ employees }: { employees: any[] }) {
  const activeEmps = employees.filter(e => e.isActive);
  const [selectedEmp, setSelectedEmp] = useState<string>(activeEmps[0]?.id ?? "");
  const [month, setMonth]             = useState(() => todayYMD.slice(0, 7));
  const [editModal, setEditModal]     = useState<{ date: string; record?: AttendanceRecord } | null>(null);

  const { data: monthRecords, isLoading, refetch } = useGetAttendanceMonth({ month, employeeId: selectedEmp });

  const emp = activeEmps.find(e => e.id === selectedEmp);

  // Build date → record map
  const byDate: Record<string, AttendanceRecord> = {};
  (monthRecords ?? []).forEach(r => { byDate[r.date.slice(0, 10)] = r; });

  // Monthly stats
  const [yr, mo] = month.split("-").map(Number);
  const daysInMonth = new Date(yr, mo, 0).getDate();
  const workDays = Array.from({ length: daysInMonth }, (_, i) => {
    const d = `${yr}-${String(mo).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
    return d;
  }).filter(d => !isWeekend(d) && d <= todayYMD);

  const presentDays = workDays.filter(d => byDate[d]?.checkIn && byDate[d]?.checkOut).length;
  const halfDays    = workDays.filter(d => byDate[d]?.checkIn && !byDate[d]?.checkOut).length;
  const absentDays  = workDays.length - presentDays - halfDays;
  const presenceRate = workDays.length > 0 ? Math.round(((presentDays + halfDays * 0.5) / workDays.length) * 100) : 0;
  const totalHours  = (monthRecords ?? []).reduce((acc, r) => {
    if (!r.checkIn || !r.checkOut) return acc;
    return acc + (new Date(r.checkOut).getTime() - new Date(r.checkIn).getTime()) / 3_600_000;
  }, 0);

  return (
    <div className="flex gap-4">
      {/* Employee sidebar */}
      <div className="w-56 shrink-0 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-3 border-b bg-gray-50">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Employés actifs</div>
        </div>
        <div className="overflow-y-auto max-h-[500px]">
          {activeEmps.map(e => (
            <button key={e.id} onClick={() => setSelectedEmp(e.id)}
              className={`w-full text-left px-3 py-2.5 flex items-center gap-2.5 transition-colors border-b border-gray-50
                ${selectedEmp === e.id ? "bg-emerald-50 border-l-2 border-l-emerald-500" : "hover:bg-gray-50"}`}>
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center text-xs font-bold text-gray-600 shrink-0">
                {e.name.split(" ").map((n: string) => n[0]).slice(0, 2).join("")}
              </div>
              <div className="min-w-0">
                <div className={`text-xs font-semibold truncate ${selectedEmp === e.id ? "text-emerald-700" : "text-gray-700"}`}>{e.name}</div>
                <div className="text-xs text-gray-400 truncate">{e.position || "—"}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-4">
        {/* Employee header + month navigator */}
        {emp && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white font-bold">
                  {emp.name.split(" ").map((n: string) => n[0]).slice(0, 2).join("")}
                </div>
                <div>
                  <div className="font-bold text-gray-800">{emp.name}</div>
                  <div className="text-sm text-gray-500">{emp.position} {emp.department ? `· ${emp.department}` : ""}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setMonth(prevMonth(month))} className="p-1.5 hover:bg-gray-100 rounded-xl">
                  <ChevronLeft className="w-4 h-4 text-gray-600" />
                </button>
                <span className="text-sm font-semibold text-gray-700 capitalize w-36 text-center">{monthLabel(month)}</span>
                <button onClick={() => setMonth(nextMonth(month))} className="p-1.5 hover:bg-gray-100 rounded-xl">
                  <ChevronRight className="w-4 h-4 text-gray-600" />
                </button>
              </div>
            </div>

            {/* Monthly stats */}
            <div className="grid grid-cols-5 gap-3 mt-4 pt-4 border-t">
              {[
                { label: "Taux présence", value: `${presenceRate}%`, color: presenceRate >= 80 ? "text-emerald-600" : presenceRate >= 60 ? "text-amber-600" : "text-red-600" },
                { label: "Jours présents", value: presentDays, color: "text-emerald-600" },
                { label: "Demi-journées",  value: halfDays,    color: "text-amber-600" },
                { label: "Absences",       value: absentDays,  color: "text-red-600" },
                { label: "Heures total",   value: `${totalHours.toFixed(1)}h`, color: "text-blue-600" },
              ].map(s => (
                <div key={s.label} className="text-center">
                  <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Daily breakdown table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-gray-400 gap-2 bg-white rounded-2xl border">
            <RefreshCw className="w-4 h-4 animate-spin" /> Chargement…
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {["Date", "Jour", "Arrivée", "Départ", "Durée", "Statut", ""].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {workDays.slice().reverse().map(dateStr => {
                  const rec    = byDate[dateStr];
                  const status = dayStatus(rec, dateStr);
                  const dayNum = new Date(dateStr + "T12:00:00").getDate();
                  const weekday = new Date(dateStr + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short" });
                  const dur    = fmtDuration(rec?.checkIn, rec?.checkOut);
                  const isToday = dateStr === todayYMD;

                  return (
                    <tr key={dateStr} className={`hover:bg-gray-50/50 transition-colors ${isToday ? "bg-emerald-50/30" : ""}`}>
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-600">
                        {isToday ? <span className="text-emerald-600 font-bold">Aujourd'hui</span> : dateStr}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-500 capitalize">{weekday}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-emerald-600 font-medium">{fmtTime(rec?.checkIn)}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-700">{fmtTime(rec?.checkOut)}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-blue-600">{dur ?? "—"}</td>
                      <td className="px-4 py-2.5"><StatusBadge status={status} /></td>
                      <td className="px-4 py-2.5">
                        <button onClick={() => setEditModal({ date: dateStr, record: rec })}
                          className="p-1 hover:bg-gray-100 rounded-lg transition-colors" title="Modifier">
                          <Edit3 className="w-3 h-3 text-gray-400" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editModal && emp && (
        <ManualEntryModal
          employeeId={selectedEmp}
          employeeName={emp.name}
          date={editModal.date}
          existing={editModal.record}
          onClose={() => setEditModal(null)}
          onSaved={refetch}
        />
      )}
    </div>
  );
}

// ── MAIN PAGE ─────────────────────────────────────────────────────────────────
type View = "today" | "calendar" | "employee";

export default function AttendancePage() {
  const [view, setView] = useState<View>("today");
  const { data: employees } = useGetEmployees();
  const { data: todayRecords, isLoading: todayLoading, refetch: refetchToday } = useGetAttendance({ date: todayYMD });

  const activeEmployees = (employees ?? []).filter(e => e.isActive);
  const presentToday    = (todayRecords ?? []).length;

  const tabs: { id: View; label: string; icon: React.ReactNode }[] = [
    { id: "today",    label: "Aujourd'hui",      icon: <Clock className="w-4 h-4" /> },
    { id: "calendar", label: "Calendrier",        icon: <Calendar className="w-4 h-4" /> },
    { id: "employee", label: "Par employé",       icon: <Users className="w-4 h-4" /> },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Pointage & Présence</h1>
          <p className="text-sm text-gray-500 mt-1">
            {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            {" — "}<span className="text-emerald-600 font-semibold">{presentToday}/{activeEmployees.length}</span> présent(s) aujourd'hui
          </p>
        </div>
        <LiveClock />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-2xl w-fit mb-6">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setView(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              view === t.id
                ? "bg-white text-gray-800 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}>
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* View content */}
      {view === "today" && (
        <TodayView
          records={todayRecords ?? []}
          employees={employees ?? []}
          isLoading={todayLoading}
          refetch={refetchToday}
        />
      )}
      {view === "calendar" && <CalendarView employees={employees ?? []} />}
      {view === "employee" && <EmployeeView employees={employees ?? []} />}
    </div>
  );
}
