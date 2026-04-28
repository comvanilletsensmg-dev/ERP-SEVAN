import { useState } from "react";
import { useGetAttendance, useCheckIn, useCheckOut, useGetEmployees } from "@workspace/api-client-react";
import { AttendanceRecord } from "@workspace/api-zod";

function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function getDuration(checkIn: string | null | undefined, checkOut: string | null | undefined): string {
  if (!checkIn || !checkOut) return "—";
  const diff = new Date(checkOut).getTime() - new Date(checkIn).getTime();
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  return `${hours}h${minutes.toString().padStart(2, "0")}`;
}

export default function AttendancePage() {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const { data: records, isLoading, refetch } = useGetAttendance({ date });
  const { data: employees } = useGetEmployees();
  const checkIn = useCheckIn();
  const checkOut = useCheckOut();
  const [processing, setProcessing] = useState<string | null>(null);

  const handleCheckIn = async (employeeId: string) => {
    setProcessing(employeeId + "-in");
    try { await checkIn.mutateAsync({ data: { employeeId } }); refetch(); }
    catch (e: any) { alert(e?.response?.data?.error ?? "Erreur"); }
    finally { setProcessing(null); }
  };

  const handleCheckOut = async (employeeId: string) => {
    setProcessing(employeeId + "-out");
    try { await checkOut.mutateAsync({ data: { employeeId } }); refetch(); }
    catch (e: any) { alert(e?.response?.data?.error ?? "Erreur"); }
    finally { setProcessing(null); }
  };

  // Build a map of today's records by employeeId
  const recordMap: Record<string, AttendanceRecord> = {};
  (records ?? []).forEach((r) => { recordMap[r.employeeId] = r; });

  const presentCount = (records ?? []).length;
  const totalCount = employees?.length ?? 0;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Pointage</h1>
          <p className="text-gray-500 text-sm mt-1">
            {date === today ? "Aujourd'hui" : new Date(date).toLocaleDateString("fr-FR")} — {presentCount}/{totalCount} présent(s)
          </p>
        </div>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm text-center">
          <div className="text-3xl font-bold text-emerald-600">{presentCount}</div>
          <div className="text-xs text-gray-500 mt-1">Présents</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm text-center">
          <div className="text-3xl font-bold text-red-500">{totalCount - presentCount}</div>
          <div className="text-xs text-gray-500 mt-1">Absents</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm text-center">
          <div className="text-3xl font-bold text-gray-700">{totalCount}</div>
          <div className="text-xs text-gray-500 mt-1">Total</div>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-gray-400">Chargement…</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {["Employé", "Poste", "Arrivée", "Départ", "Durée", date === today ? "Action" : ""].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(employees ?? []).length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-gray-400">Aucun employé</td></tr>
              ) : (
                (employees ?? []).map((emp) => {
                  const record = recordMap[emp.id];
                  const isToday = date === today;
                  return (
                    <tr key={emp.id} className={`hover:bg-gray-50 transition-colors ${record ? "" : "opacity-70"}`}>
                      <td className="px-4 py-3 font-medium text-gray-800">{emp.name}</td>
                      <td className="px-4 py-3 text-gray-500">{emp.position}</td>
                      <td className="px-4 py-3">
                        {record ? (
                          <span className="text-emerald-600 font-mono font-medium">{formatTime(record.checkIn)}</span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {record?.checkOut ? (
                          <span className="text-gray-700 font-mono">{formatTime(record.checkOut)}</span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                        {getDuration(record?.checkIn, record?.checkOut)}
                      </td>
                      {isToday && (
                        <td className="px-4 py-3">
                          {!record ? (
                            <button
                              onClick={() => handleCheckIn(emp.id)}
                              disabled={processing === emp.id + "-in"}
                              className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded text-xs font-medium hover:bg-emerald-200 disabled:opacity-50"
                            >
                              Pointer arrivée
                            </button>
                          ) : !record.checkOut ? (
                            <button
                              onClick={() => handleCheckOut(emp.id)}
                              disabled={processing === emp.id + "-out"}
                              className="px-3 py-1 bg-orange-100 text-orange-700 rounded text-xs font-medium hover:bg-orange-200 disabled:opacity-50"
                            >
                              Pointer départ
                            </button>
                          ) : (
                            <span className="text-xs text-gray-400">Terminé</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
