import { useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Calendar, Package, Truck, AlertTriangle, BarChart2,
  Plus, Check, X, ChevronLeft, ChevronRight, Zap,
  Link2, Trash2, Ship, Clock, RefreshCw, AlertCircle,
  ArrowUpRight, Users,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface ProductionTask {
  id: string; lotId: string | null; type: string; status: string;
  startDate: string; endDate: string; requiredStaff: number; notes: string | null;
  autoCreated: string; createdAt: string;
  lot: { id: string; code: string; status: string; weightCurrent: number; grade: string | null } | null;
  assignees: { id: string; name: string }[];
}

interface ExportOrder {
  id: string; reference: string; clientName: string; quantityKg: number;
  status: string; priority: number; deadline: string;
  lotId: string | null; destination: string | null; notes: string | null;
  createdAt: string;
  lot: { id: string; code: string; status: string; weightCurrent: number } | null;
}

interface CalendarEvent {
  id: string; type: string; title: string; start: string; end: string; color: string;
  meta: Record<string, unknown>;
}

interface PlanningStats {
  totalStockKg: number; pendingOrdersKg: number; stockAlert: boolean;
  activeTasksCount: number; pendingOrdersCount: number;
  alerts: { level: string; message: string }[];
}

interface Lot { id: string; code: string; status: string; weightCurrent: number; grade: string | null }
interface Employee { id: string; name: string; isActive: boolean }

// ── API helpers ───────────────────────────────────────────────────────────────
const api = {
  get: (url: string) => fetch(url, { credentials: "include" }).then(r => r.json()),
  post: (url: string, body?: unknown) => fetch(url, {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  }).then(async r => {
    const data = await r.json();
    if (!r.ok) throw new Error(data.error ?? "Erreur");
    return data;
  }),
  put: (url: string, body: unknown) => fetch(url, {
    method: "PUT", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(async r => {
    const data = await r.json();
    if (!r.ok) throw new Error(data.error ?? "Erreur");
    return data;
  }),
  del: (url: string) => fetch(url, { method: "DELETE", credentials: "include" }),
};

// ── Color palette ─────────────────────────────────────────────────────────────
const TASK_TYPE_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  drying:      { bg: "bg-blue-100",   text: "text-blue-700",   label: "Séchage" },
  sorting:     { bg: "bg-cyan-100",   text: "text-cyan-700",   label: "Tri" },
  packaging:   { bg: "bg-purple-100", text: "text-purple-700", label: "Emballage" },
  preparation: { bg: "bg-amber-100",  text: "text-amber-700",  label: "Préparation" },
  curing:      { bg: "bg-emerald-100",text: "text-emerald-700",label: "Affinage" },
};

const STATUS_TASK: Record<string, { label: string; cls: string }> = {
  pending:     { label: "En attente",   cls: "bg-amber-100 text-amber-700" },
  in_progress: { label: "En cours",     cls: "bg-blue-100 text-blue-700" },
  completed:   { label: "Terminé",      cls: "bg-emerald-100 text-emerald-700" },
  cancelled:   { label: "Annulé",       cls: "bg-gray-100 text-gray-500" },
};

const STATUS_ORDER: Record<string, { label: string; cls: string }> = {
  pending:   { label: "En attente",  cls: "bg-amber-100 text-amber-700" },
  preparing: { label: "Préparation", cls: "bg-blue-100 text-blue-700" },
  ready:     { label: "Prêt",        cls: "bg-emerald-100 text-emerald-700" },
  shipped:   { label: "Expédié",     cls: "bg-gray-100 text-gray-500" },
  cancelled: { label: "Annulé",      cls: "bg-red-100 text-red-700" },
};

const PRIORITY_LABELS: Record<number, { label: string; cls: string }> = {
  1: { label: "Urgent",  cls: "bg-red-100 text-red-700" },
  2: { label: "Normal",  cls: "bg-blue-100 text-blue-700" },
  3: { label: "Faible",  cls: "bg-gray-100 text-gray-500" },
};

// ── Calendar ──────────────────────────────────────────────────────────────────
function PlanningCalendar({ events }: { events: CalendarEvent[] }) {
  const [current, setCurrent] = useState(() => {
    const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() };
  });

  const monthLabel = new Date(current.year, current.month, 1)
    .toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  const firstDay  = new Date(current.year, current.month, 1);
  const lastDay   = new Date(current.year, current.month + 1, 0);
  const startDow  = (firstDay.getDay() + 6) % 7; // Mon=0
  const totalDays = lastDay.getDate();

  const cells: (number | null)[] = [
    ...Array(startDow).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const toYMD = (d: Date) => d.toISOString().slice(0, 10);
  const monthYMD = `${current.year}-${String(current.month + 1).padStart(2, "0")}`;

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    events.forEach(ev => {
      const s = new Date(ev.start);
      const e = new Date(ev.end);
      const curr = new Date(s);
      while (curr <= e) {
        const key = toYMD(curr);
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(ev);
        curr.setDate(curr.getDate() + 1);
      }
    });
    return map;
  }, [events]);

  const DAYS_FR = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b bg-gray-50">
        <button onClick={() => {
          const d = new Date(current.year, current.month - 1, 1);
          setCurrent({ year: d.getFullYear(), month: d.getMonth() });
        }} className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <h3 className="text-sm font-semibold text-gray-800 capitalize">{monthLabel}</h3>
        <button onClick={() => {
          const d = new Date(current.year, current.month + 1, 1);
          setCurrent({ year: d.getFullYear(), month: d.getMonth() });
        }} className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Legend */}
      <div className="flex gap-4 px-5 py-2 border-b bg-white text-xs text-gray-600 flex-wrap">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-blue-500 inline-block"/>Production</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-500 inline-block"/>Congés</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-purple-600 inline-block"/>Commandes</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-700 inline-block"/>Urgent (&lt;3j)</span>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 text-center text-xs font-semibold text-gray-500 border-b">
        {DAYS_FR.map(d => <div key={d} className="py-2">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          if (!day) return <div key={i} className="min-h-[80px] border-r border-b border-gray-100 bg-gray-50/50" />;
          const ymd = `${current.year}-${String(current.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const dayEvents = eventsByDay.get(ymd) ?? [];
          const today = toYMD(new Date()) === ymd;

          return (
            <div key={i} className={`min-h-[80px] border-r border-b border-gray-100 p-1.5 ${today ? "bg-emerald-50" : ""}`}>
              <div className={`text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full
                ${today ? "bg-emerald-500 text-white" : "text-gray-700"}`}>
                {day}
              </div>
              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map(ev => (
                  <div key={ev.id} title={ev.title}
                    className="text-[10px] truncate rounded px-1 py-0.5 text-white font-medium"
                    style={{ backgroundColor: ev.color }}>
                    {ev.title.slice(0, 20)}
                  </div>
                ))}
                {dayEvents.length > 3 && (
                  <div className="text-[10px] text-gray-500">+{dayEvents.length - 3}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Task Modal ────────────────────────────────────────────────────────────────
type TaskForm = { lotId: string; type: string; startDate: string; endDate: string; requiredStaff: number; notes: string; assigneeIds: string[] };

function TaskModal({ lots, employees, task, onClose, onSaved }: {
  lots: Lot[]; employees: Employee[]; task?: ProductionTask | null;
  onClose: () => void; onSaved: () => void;
}) {
  const qc = useQueryClient();
  const [apiErr, setApiErr] = useState("");
  const { register, handleSubmit, formState: { isSubmitting }, watch } = useForm<TaskForm>({
    defaultValues: {
      lotId:         task?.lotId ?? "",
      type:          task?.type ?? "drying",
      startDate:     task?.startDate?.slice(0, 10) ?? new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0],
      endDate:       task?.endDate?.slice(0, 10) ?? new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0],
      requiredStaff: task?.requiredStaff ?? 1,
      notes:         task?.notes ?? "",
      assigneeIds:   task?.assignees?.map(a => a.id) ?? [],
    },
  });

  const onSubmit = async (data: TaskForm) => {
    setApiErr("");
    try {
      const body = { ...data, requiredStaff: Number(data.requiredStaff), assigneeIds: [] };
      if (task) {
        await api.put(`/api/planning/tasks/${task.id}`, body);
        toast.success("Tâche mise à jour");
      } else {
        await api.post("/api/planning/tasks", body);
        toast.success("Tâche créée");
      }
      await Promise.all([
        qc.refetchQueries({ queryKey: ["planning-tasks"] }),
        qc.refetchQueries({ queryKey: ["planning-stats"] }),
        qc.invalidateQueries({ queryKey: ["planning-calendar"] }),
      ]);
      onSaved(); onClose();
    } catch (e: any) { setApiErr(e.message); }
  };

  const TASK_TYPES = ["drying","sorting","packaging","preparation","curing"];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex justify-between items-center p-5 border-b">
          <h2 className="text-lg font-bold text-gray-800">{task ? "Modifier tâche" : "Nouvelle tâche production"}</h2>
          <button type="button" onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
          {apiErr && <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700"><AlertCircle className="w-4 h-4 shrink-0" />{apiErr}</div>}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
              <select {...register("type", { required: true })} className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none">
                {TASK_TYPES.map(t => <option key={t} value={t}>{TASK_TYPE_COLORS[t]?.label ?? t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Personnel requis</label>
              <input type="number" min={1} max={50} {...register("requiredStaff")} className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Lot vanille</label>
            <select {...register("lotId")} className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none">
              <option value="">— Aucun lot associé —</option>
              {lots.filter(l => !["SHIPPED","PHENOLED","MOLDY"].includes(l.status)).map(l => (
                <option key={l.id} value={l.id}>{l.code} — {l.weightCurrent.toFixed(1)}kg ({l.status})</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Début *</label>
              <input type="date" {...register("startDate", { required: true })} className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fin *</label>
              <input type="date" {...register("endDate", { required: true })} className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea {...register("notes")} rows={2} className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none resize-none" />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">Annuler</button>
            <button type="submit" disabled={isSubmitting} className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {isSubmitting ? "Enregistrement…" : task ? "Mettre à jour" : "Créer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Order Modal ───────────────────────────────────────────────────────────────
type OrderForm = { reference: string; clientName: string; quantityKg: number; priority: number; deadline: string; lotId: string; destination: string; notes: string };

function OrderModal({ lots, order, onClose, onSaved }: {
  lots: Lot[]; order?: ExportOrder | null; onClose: () => void; onSaved: () => void;
}) {
  const qc = useQueryClient();
  const [apiErr, setApiErr] = useState("");
  const { register, handleSubmit, formState: { isSubmitting } } = useForm<OrderForm>({
    defaultValues: {
      reference:   order?.reference ?? "",
      clientName:  order?.clientName ?? "",
      quantityKg:  order?.quantityKg ?? 100,
      priority:    order?.priority ?? 2,
      deadline:    order?.deadline?.slice(0, 10) ?? new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
      lotId:       order?.lotId ?? "",
      destination: order?.destination ?? "",
      notes:       order?.notes ?? "",
    },
  });

  const onSubmit = async (data: OrderForm) => {
    setApiErr("");
    try {
      const body = {
        ...data,
        quantityKg: Number(data.quantityKg),
        priority:   Number(data.priority),
        lotId:      data.lotId || null,
        destination: data.destination || null,
        notes:      data.notes || null,
      };
      if (order) {
        await api.put(`/api/planning/orders/${order.id}`, body);
        toast.success("Commande mise à jour");
      } else {
        await api.post("/api/planning/orders", body);
        toast.success("Commande créée");
      }
      await Promise.all([
        qc.refetchQueries({ queryKey: ["planning-orders"] }),
        qc.refetchQueries({ queryKey: ["planning-stats"] }),
        qc.invalidateQueries({ queryKey: ["planning-calendar"] }),
      ]);
      onSaved(); onClose();
    } catch (e: any) { setApiErr(e.message); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex justify-between items-center p-5 border-b">
          <h2 className="text-lg font-bold text-gray-800">{order ? "Modifier commande" : "Nouvelle commande export"}</h2>
          <button type="button" onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
          {apiErr && <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700"><AlertCircle className="w-4 h-4 shrink-0" />{apiErr}</div>}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Référence *</label>
              <input {...register("reference", { required: true })} className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priorité</label>
              <select {...register("priority")} className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none">
                <option value={1}>🔴 Urgent</option>
                <option value={2}>🔵 Normal</option>
                <option value={3}>⚪ Faible</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Client *</label>
            <input {...register("clientName", { required: true })} placeholder="Nom du client" className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantité (kg) *</label>
              <input type="number" min={1} step={0.1} {...register("quantityKg", { required: true })} className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Deadline *</label>
              <input type="date" {...register("deadline", { required: true })} className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Lot assigné</label>
              <select {...register("lotId")} className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none">
                <option value="">— Aucun —</option>
                {lots.filter(l => ["READY","AVAILABLE","ready"].includes(l.status)).map(l => (
                  <option key={l.id} value={l.id}>{l.code} ({l.weightCurrent.toFixed(0)}kg)</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Destination</label>
              <input {...register("destination")} placeholder="Ex: France, USA…" className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea {...register("notes")} rows={2} className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none resize-none" />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">Annuler</button>
            <button type="submit" disabled={isSubmitting} className="flex-1 px-4 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors">
              {isSubmitting ? "Enregistrement…" : order ? "Mettre à jour" : "Créer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
type Tab = "calendar" | "tasks" | "orders" | "alerts";

export default function Planning() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("calendar");
  const [calMonth, setCalMonth] = useState(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
  });
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [editTask, setEditTask] = useState<ProductionTask | null>(null);
  const [editOrder, setEditOrder] = useState<ExportOrder | null>(null);
  const [taskFilter, setTaskFilter] = useState("all");
  const [orderFilter, setOrderFilter] = useState("all");

  // Queries
  const { data: stats } = useQuery<PlanningStats>({
    queryKey: ["planning-stats"],
    queryFn: () => api.get("/api/planning/stats"),
    refetchInterval: 60_000,
  });

  const { data: calEvents = [], isLoading: calLoading } = useQuery<CalendarEvent[]>({
    queryKey: ["planning-calendar", calMonth],
    queryFn: () => api.get(`/api/planning/calendar?month=${calMonth}`),
    staleTime: 30_000,
  });

  const { data: tasks = [], isLoading: tasksLoading } = useQuery<ProductionTask[]>({
    queryKey: ["planning-tasks"],
    queryFn: () => api.get("/api/planning/tasks"),
    staleTime: 30_000,
  });

  const { data: orders = [], isLoading: ordersLoading } = useQuery<ExportOrder[]>({
    queryKey: ["planning-orders"],
    queryFn: () => api.get("/api/planning/orders"),
    staleTime: 30_000,
  });

  const { data: lots = [] } = useQuery<Lot[]>({
    queryKey: ["lots-list"],
    queryFn: () => api.get("/api/lots"),
    staleTime: 60_000,
  });

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ["employees-list"],
    queryFn: () => api.get("/api/employees"),
    staleTime: 60_000,
  });

  // Mutations
  const autoSchedule = useMutation({
    mutationFn: () => api.post("/api/planning/auto-schedule"),
    onSuccess: (data: any) => {
      toast.success(`Auto-planification : ${data.tasksCreated} tâche(s) créée(s), ${data.lotsLinked} lot(s) assigné(s)`);
      qc.invalidateQueries({ queryKey: ["planning-tasks"] });
      qc.invalidateQueries({ queryKey: ["planning-orders"] });
      qc.invalidateQueries({ queryKey: ["planning-stats"] });
      qc.invalidateQueries({ queryKey: ["planning-calendar"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const linkOrders = useMutation({
    mutationFn: () => api.post("/api/planning/link-orders"),
    onSuccess: (data: any) => {
      toast.success(`${data.linked} commande(s) liée(s) à des lots disponibles`);
      qc.invalidateQueries({ queryKey: ["planning-orders"] });
      qc.invalidateQueries({ queryKey: ["planning-stats"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const shipOrder = useMutation({
    mutationFn: (id: string) => api.post(`/api/planning/orders/${id}/ship`),
    onSuccess: () => {
      toast.success("Commande expédiée — stock déduit");
      qc.invalidateQueries({ queryKey: ["planning-orders"] });
      qc.invalidateQueries({ queryKey: ["planning-stats"] });
      qc.invalidateQueries({ queryKey: ["lots-list"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteTask = useMutation({
    mutationFn: (id: string) => api.del(`/api/planning/tasks/${id}`),
    onSuccess: () => {
      toast.success("Tâche supprimée");
      qc.invalidateQueries({ queryKey: ["planning-tasks"] });
      qc.invalidateQueries({ queryKey: ["planning-stats"] });
      qc.invalidateQueries({ queryKey: ["planning-calendar"] });
    },
  });

  const deleteOrder = useMutation({
    mutationFn: (id: string) => api.del(`/api/planning/orders/${id}`),
    onSuccess: () => {
      toast.success("Commande supprimée");
      qc.invalidateQueries({ queryKey: ["planning-orders"] });
      qc.invalidateQueries({ queryKey: ["planning-stats"] });
    },
  });

  const updateTaskStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.put(`/api/planning/tasks/${id}`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["planning-tasks"] });
      qc.invalidateQueries({ queryKey: ["planning-stats"] });
    },
  });

  // Filtered data
  const filteredTasks = taskFilter === "all" ? tasks : tasks.filter(t => t.status === taskFilter);
  const filteredOrders = orderFilter === "all" ? orders : orders.filter(o => o.status === orderFilter);

  const totalStockKg = stats?.totalStockKg ?? 0;
  const pendingOrdersKg = stats?.pendingOrdersKg ?? 0;
  const alerts = stats?.alerts ?? [];

  const TABS: { id: Tab; label: string; icon: React.ElementType; badge?: number }[] = [
    { id: "calendar", label: "Calendrier", icon: Calendar },
    { id: "tasks",    label: "Tâches production", icon: Package, badge: stats?.activeTasksCount },
    { id: "orders",   label: "Commandes export",  icon: Truck,   badge: stats?.pendingOrdersCount },
    { id: "alerts",   label: "Alertes",           icon: AlertTriangle, badge: alerts.length || undefined },
  ];

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Page Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-600" />
              Planning Production & Export
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">Système automatique connecté stock · production · congés · commandes</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => linkOrders.mutate()} disabled={linkOrders.isPending}
              className="flex items-center gap-1.5 px-3 py-2 bg-cyan-600 text-white rounded-xl text-xs font-medium hover:bg-cyan-700 disabled:opacity-50 transition-colors">
              <Link2 className="w-3.5 h-3.5" />
              Lier commandes
            </button>
            <button onClick={() => autoSchedule.mutate()} disabled={autoSchedule.isPending}
              className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 text-white rounded-xl text-xs font-medium hover:bg-amber-600 disabled:opacity-50 transition-colors">
              <Zap className="w-3.5 h-3.5" />
              Auto-planifier
            </button>
            <button onClick={() => { setEditTask(null); setShowTaskModal(true); }}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-xl text-xs font-medium hover:bg-blue-700 transition-colors">
              <Plus className="w-3.5 h-3.5" />
              Tâche
            </button>
            <button onClick={() => { setEditOrder(null); setShowOrderModal(true); }}
              className="flex items-center gap-1.5 px-3 py-2 bg-purple-600 text-white rounded-xl text-xs font-medium hover:bg-purple-700 transition-colors">
              <Plus className="w-3.5 h-3.5" />
              Commande
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 lg:p-6 space-y-5">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Stock disponible", value: `${totalStockKg.toFixed(0)} kg`, icon: Package,
              color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200",
              sub: "Lots READY/AVAILABLE" },
            { label: "Commandes en cours", value: `${pendingOrdersKg.toFixed(0)} kg`, icon: Truck,
              color: stats?.stockAlert ? "text-red-600" : "text-purple-600",
              bg: stats?.stockAlert ? "bg-red-50" : "bg-purple-50",
              border: stats?.stockAlert ? "border-red-200" : "border-purple-200",
              sub: stats?.stockAlert ? "⚠️ Insuffisant" : "Demandes actives" },
            { label: "Tâches actives", value: `${stats?.activeTasksCount ?? 0}`, icon: BarChart2,
              color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200",
              sub: "En attente / en cours" },
            { label: "Alertes", value: `${alerts.length}`, icon: AlertTriangle,
              color: alerts.length > 0 ? "text-red-600" : "text-gray-400",
              bg: alerts.length > 0 ? "bg-red-50" : "bg-gray-50",
              border: alerts.length > 0 ? "border-red-200" : "border-gray-200",
              sub: alerts.length > 0 ? "Attention requise" : "Aucune alerte" },
          ].map(kpi => (
            <div key={kpi.label} className={`${kpi.bg} ${kpi.border} border rounded-2xl p-4`}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-gray-500">{kpi.label}</p>
                <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
              </div>
              <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{kpi.sub}</p>
            </div>
          ))}
        </div>

        {/* Stock vs Orders bar */}
        {totalStockKg > 0 || pendingOrdersKg > 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-medium text-gray-600">Couverture stock → commandes</span>
              <span className={`text-xs font-bold ${stats?.stockAlert ? "text-red-600" : "text-emerald-600"}`}>
                {pendingOrdersKg > 0 ? `${Math.min(100, (totalStockKg / pendingOrdersKg) * 100).toFixed(0)}%` : "100%"}
              </span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${stats?.stockAlert ? "bg-red-400" : "bg-emerald-500"}`}
                style={{ width: `${Math.min(100, pendingOrdersKg > 0 ? (totalStockKg / pendingOrdersKg) * 100 : 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-gray-400 mt-1">
              <span>Stock: {totalStockKg.toFixed(0)} kg</span>
              <span>Commandes: {pendingOrdersKg.toFixed(0)} kg</span>
            </div>
          </div>
        ) : null}

        {/* Tabs */}
        <div className="flex gap-1 bg-white rounded-xl border border-gray-200 p-1 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors
                ${tab === t.id ? "bg-blue-600 text-white shadow-sm" : "text-gray-600 hover:bg-gray-100"}`}>
              <t.icon className="w-4 h-4" />
              {t.label}
              {t.badge != null && t.badge > 0 && (
                <span className="min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1">
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab: Calendar */}
        {tab === "calendar" && (
          <PlanningCalendar events={calEvents} />
        )}

        {/* Tab: Tasks */}
        {tab === "tasks" && (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="flex items-center gap-3 p-4 border-b flex-wrap">
              <div className="flex gap-2 flex-1 flex-wrap">
                {["all", "pending", "in_progress", "completed"].map(s => (
                  <button key={s} onClick={() => setTaskFilter(s)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors
                      ${taskFilter === s ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}>
                    {s === "all" ? "Toutes" : STATUS_TASK[s]?.label ?? s}
                  </button>
                ))}
              </div>
              <span className="text-xs text-gray-400">{filteredTasks.length} tâche(s)</span>
            </div>

            {tasksLoading ? (
              <div className="flex items-center justify-center py-12 text-gray-400">
                <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Chargement…
              </div>
            ) : filteredTasks.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>Aucune tâche de production</p>
                <button onClick={() => setShowTaskModal(true)} className="mt-3 text-blue-600 text-sm hover:underline">+ Créer une tâche</button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase">
                    <tr>
                      {["Type", "Lot", "Période", "Personnel", "Statut", "Auto", "Actions"].map(h => (
                        <th key={h} className="px-4 py-3 text-left">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredTasks.map(task => {
                      const typeInfo = TASK_TYPE_COLORS[task.type] ?? { bg: "bg-gray-100", text: "text-gray-700", label: task.type };
                      const statusInfo = STATUS_TASK[task.status] ?? { label: task.status, cls: "bg-gray-100 text-gray-500" };
                      const start = new Date(task.startDate).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
                      const end   = new Date(task.endDate).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
                      return (
                        <tr key={task.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${typeInfo.bg} ${typeInfo.text}`}>{typeInfo.label}</span>
                          </td>
                          <td className="px-4 py-3 text-gray-700">
                            {task.lot ? <span className="font-mono text-xs">{task.lot.code}</span> : <span className="text-gray-400 text-xs">—</span>}
                          </td>
                          <td className="px-4 py-3 text-gray-600 text-xs">{start} → {end}</td>
                          <td className="px-4 py-3">
                            <span className="flex items-center gap-1 text-xs text-gray-600">
                              <Users className="w-3 h-3" />{task.requiredStaff}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusInfo.cls}`}>{statusInfo.label}</span>
                          </td>
                          <td className="px-4 py-3">
                            {task.autoCreated === "yes" && <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">Auto</span>}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              {task.status === "pending" && (
                                <button onClick={() => updateTaskStatus.mutate({ id: task.id, status: "in_progress" })}
                                  title="Démarrer" className="p-1.5 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors">
                                  <ArrowUpRight className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {task.status === "in_progress" && (
                                <button onClick={() => updateTaskStatus.mutate({ id: task.id, status: "completed" })}
                                  title="Terminer" className="p-1.5 bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 transition-colors">
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button onClick={() => { setEditTask(task); setShowTaskModal(true); }}
                                title="Modifier" className="p-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors">
                                <RefreshCw className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => { if (confirm("Supprimer cette tâche ?")) deleteTask.mutate(task.id); }}
                                title="Supprimer" className="p-1.5 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors">
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
            )}
          </div>
        )}

        {/* Tab: Orders */}
        {tab === "orders" && (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="flex items-center gap-3 p-4 border-b flex-wrap">
              <div className="flex gap-2 flex-1 flex-wrap">
                {["all", "pending", "preparing", "ready", "shipped"].map(s => (
                  <button key={s} onClick={() => setOrderFilter(s)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors
                      ${orderFilter === s ? "bg-purple-600 text-white border-purple-600" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}>
                    {s === "all" ? "Toutes" : STATUS_ORDER[s]?.label ?? s}
                  </button>
                ))}
              </div>
              <span className="text-xs text-gray-400">{filteredOrders.length} commande(s)</span>
            </div>

            {ordersLoading ? (
              <div className="flex items-center justify-center py-12 text-gray-400">
                <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Chargement…
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Truck className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>Aucune commande export</p>
                <button onClick={() => setShowOrderModal(true)} className="mt-3 text-purple-600 text-sm hover:underline">+ Créer une commande</button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase">
                    <tr>
                      {["Réf.", "Client", "Quantité", "Deadline", "Priorité", "Lot", "Statut", "Actions"].map(h => (
                        <th key={h} className="px-4 py-3 text-left">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredOrders.map(order => {
                      const prioInfo = PRIORITY_LABELS[order.priority] ?? { label: `P${order.priority}`, cls: "bg-gray-100 text-gray-500" };
                      const statusInfo = STATUS_ORDER[order.status] ?? { label: order.status, cls: "bg-gray-100 text-gray-500" };
                      const deadline = new Date(order.deadline);
                      const daysLeft = Math.ceil((deadline.getTime() - Date.now()) / 86400000);
                      const overdue = daysLeft < 0 && order.status !== "shipped";

                      return (
                        <tr key={order.id} className={`hover:bg-gray-50 ${overdue ? "bg-red-50/40" : ""}`}>
                          <td className="px-4 py-3">
                            <span className="font-mono text-xs font-semibold text-gray-800">{order.reference}</span>
                          </td>
                          <td className="px-4 py-3 text-gray-700">
                            <div>{order.clientName}</div>
                            {order.destination && <div className="text-xs text-gray-400">{order.destination}</div>}
                          </td>
                          <td className="px-4 py-3 font-medium text-gray-800">{order.quantityKg.toFixed(1)} kg</td>
                          <td className="px-4 py-3">
                            <div className={`text-xs font-medium ${overdue ? "text-red-600" : daysLeft <= 3 ? "text-amber-600" : "text-gray-600"}`}>
                              {deadline.toLocaleDateString("fr-FR")}
                            </div>
                            {order.status !== "shipped" && (
                              <div className={`text-[10px] ${overdue ? "text-red-500" : daysLeft <= 3 ? "text-amber-500" : "text-gray-400"}`}>
                                {overdue ? `${Math.abs(daysLeft)}j retard` : `J-${daysLeft}`}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${prioInfo.cls}`}>{prioInfo.label}</span>
                          </td>
                          <td className="px-4 py-3 text-xs">
                            {order.lot ? <span className="font-mono text-gray-700">{order.lot.code}</span> : <span className="text-gray-400">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusInfo.cls}`}>{statusInfo.label}</span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              {order.status !== "shipped" && order.status !== "cancelled" && (
                                <button onClick={() => {
                                  if (confirm(`Confirmer l'expédition de ${order.reference} ? Le stock du lot sera déduit.`))
                                    shipOrder.mutate(order.id);
                                }} title="Expédier" className="p-1.5 bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 transition-colors">
                                  <Ship className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button onClick={() => { setEditOrder(order); setShowOrderModal(true); }}
                                title="Modifier" className="p-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors">
                                <RefreshCw className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => { if (confirm("Supprimer cette commande ?")) deleteOrder.mutate(order.id); }}
                                title="Supprimer" className="p-1.5 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors">
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
            )}
          </div>
        )}

        {/* Tab: Alerts */}
        {tab === "alerts" && (
          <div className="space-y-3">
            {alerts.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-200 py-16 text-center text-gray-400">
                <Check className="w-12 h-12 mx-auto mb-3 text-emerald-400" />
                <p className="font-medium text-gray-600">Tout est en ordre</p>
                <p className="text-sm mt-1">Aucune alerte active — stock et planning OK</p>
              </div>
            ) : (
              alerts.map((alert, i) => (
                <div key={i} className={`flex items-start gap-3 p-4 rounded-xl border ${
                  alert.level === "error" ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"
                }`}>
                  <AlertTriangle className={`w-5 h-5 shrink-0 mt-0.5 ${alert.level === "error" ? "text-red-500" : "text-amber-500"}`} />
                  <div>
                    <p className={`text-sm font-medium ${alert.level === "error" ? "text-red-800" : "text-amber-800"}`}>
                      {alert.level === "error" ? "Alerte critique" : "Avertissement"}
                    </p>
                    <p className={`text-sm mt-0.5 ${alert.level === "error" ? "text-red-700" : "text-amber-700"}`}>
                      {alert.message}
                    </p>
                  </div>
                </div>
              ))
            )}

            {/* Quick actions in alert tab */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Actions correctives</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button onClick={() => { linkOrders.mutate(); setTab("orders"); }}
                  disabled={linkOrders.isPending}
                  className="flex items-center gap-2 p-3 bg-cyan-50 border border-cyan-200 rounded-xl text-sm text-cyan-700 hover:bg-cyan-100 transition-colors disabled:opacity-50">
                  <Link2 className="w-4 h-4" />
                  <div className="text-left">
                    <p className="font-medium">Lier lots → commandes</p>
                    <p className="text-xs text-cyan-500">Assigner lots disponibles aux commandes en attente</p>
                  </div>
                </button>
                <button onClick={() => { autoSchedule.mutate(); setTab("tasks"); }}
                  disabled={autoSchedule.isPending}
                  className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700 hover:bg-amber-100 transition-colors disabled:opacity-50">
                  <Zap className="w-4 h-4" />
                  <div className="text-left">
                    <p className="font-medium">Auto-planifier production</p>
                    <p className="text-xs text-amber-500">Créer tâches manquantes selon commandes urgentes</p>
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showTaskModal && (
        <TaskModal lots={lots} employees={employees}
          task={editTask} onClose={() => { setShowTaskModal(false); setEditTask(null); }}
          onSaved={() => {}} />
      )}
      {showOrderModal && (
        <OrderModal lots={lots} order={editOrder}
          onClose={() => { setShowOrderModal(false); setEditOrder(null); }}
          onSaved={() => {}} />
      )}
    </div>
  );
}
