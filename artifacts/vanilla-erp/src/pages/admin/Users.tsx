import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users, UserPlus, Shield, Lock, Unlock, Eye, Edit2, Trash2,
  CheckCircle2, XCircle, AlertTriangle, History, Key,
  ShieldCheck, UserX, UserCheck, Search, Download, RefreshCw,
  MonitorSmartphone, Clock, Building2, LogIn,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { ROLE_LABELS, ROLE_COLORS, ROLE_DEPT } from "@/lib/permissions";

// ─── Types ────────────────────────────────────────────────────────────────────
interface UserRecord {
  id: string; email: string; name: string | null; role: string;
  department: string | null; isActive: boolean; status: string;
  employeeId: string | null; employeeName: string | null;
  employeePosition: string | null; employeeDepartment: string | null;
  lastLoginAt: string | null; failedAttempts: number; lockedAt: string | null;
  createdAt: string; loginsToday: number;
}
interface LoginEntry { id: string; ip: string | null; userAgent: string | null; success: boolean; createdAt: string }
interface Permission { module: string; canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean; canExport: boolean }
interface Employee { id: string; name: string; position: string; department: string; email?: string }

// ─── Config ───────────────────────────────────────────────────────────────────
const ALL_ROLES = [
  "SUPER_ADMIN", "ADMIN", "DG", "DGA", "HR_MANAGER", "ACCOUNTANT",
  "LOGISTICS_MANAGER", "COMMERCIAL", "BUSINESS_DEVELOPER", "DSI",
];

const ERP_MODULES = [
  { key: "achats",       label: "Achats" },
  { key: "fournisseurs", label: "Fournisseurs" },
  { key: "lots",         label: "Lots vanille" },
  { key: "stock",        label: "Stock" },
  { key: "paiements",    label: "Paiements" },
  { key: "comptabilite", label: "Comptabilité" },
  { key: "rh",           label: "Ressources Humaines" },
  { key: "crm",          label: "CRM" },
  { key: "operations",   label: "Opérations" },
  { key: "logistique",   label: "Logistique" },
];

const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString("fr-FR") : "—";
const fmtDt   = (d: string | null) => d ? new Date(d).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "Jamais";

async function api(path: string, opts?: RequestInit) {
  const r = await fetch(`/api${path}`, { credentials: "include", headers: { "Content-Type": "application/json" }, ...opts });
  let data: any;
  try { data = await r.json(); } catch { throw new Error("Erreur serveur"); }
  if (!r.ok) throw new Error(data?.error ?? r.statusText);
  return data;
}

// ─── Status Badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; cls: string; dot: string }> = {
    active:   { label: "Actif",     cls: "bg-green-50 text-green-700 border-green-200",  dot: "bg-green-500" },
    inactive: { label: "Inactif",   cls: "bg-gray-50 text-gray-600 border-gray-200",    dot: "bg-gray-400" },
    locked:   { label: "Bloqué",    cls: "bg-red-50 text-red-700 border-red-200",       dot: "bg-red-500" },
  };
  const m = cfg[status] ?? cfg.inactive;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${m.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}

// ─── Role Badge ───────────────────────────────────────────────────────────────
function RoleBadge({ role }: { role: string }) {
  const cls = ROLE_COLORS[role] ?? "bg-gray-100 text-gray-700 border-gray-200";
  return <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold border ${cls}`}>{ROLE_LABELS[role] ?? role}</span>;
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, sub, color = "text-gray-900", bg = "bg-white", iconBg = "bg-gray-100", iconColor = "text-gray-600" }: any) {
  return (
    <div className={`${bg} border border-gray-200 rounded-xl p-4 shadow-sm flex items-center gap-4`}>
      <div className={`w-10 h-10 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}>
        <Icon className={`w-5 h-5 ${iconColor}`} />
      </div>
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className={`text-2xl font-bold ${color}`}>{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Permissions Panel ────────────────────────────────────────────────────────
function PermissionsPanel({ userId, onClose }: { userId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: perms = [], isLoading } = useQuery<Permission[]>({
    queryKey: ["user-perms", userId],
    queryFn: () => api(`/users/${userId}/permissions`),
  });

  const [local, setLocal] = useState<Permission[]>([]);
  const initialized = local.length > 0;

  if (!isLoading && !initialized && perms.length > 0) {
    setLocal(perms);
  } else if (!isLoading && !initialized && perms.length === 0) {
    setLocal(ERP_MODULES.map(m => ({ module: m.key, canView: false, canCreate: false, canEdit: false, canDelete: false, canExport: false })));
  }

  const saveMutation = useMutation({
    mutationFn: () => api(`/users/${userId}/permissions`, { method: "PUT", body: JSON.stringify({ permissions: local }) }),
    onSuccess: () => { toast.success("Permissions sauvegardées"); qc.invalidateQueries({ queryKey: ["user-perms", userId] }); },
    onError: (e: any) => toast.error(e.message),
  });

  function toggle(module: string, field: keyof Permission) {
    setLocal(prev => prev.map(p => p.module === module ? { ...p, [field]: !(p as any)[field] } : p));
  }

  const actions: { key: keyof Permission; label: string; cls: string }[] = [
    { key: "canView",   label: "Voir",      cls: "text-blue-600" },
    { key: "canCreate", label: "Créer",     cls: "text-green-600" },
    { key: "canEdit",   label: "Modifier",  cls: "text-amber-600" },
    { key: "canDelete", label: "Supprimer", cls: "text-red-600" },
    { key: "canExport", label: "Exporter",  cls: "text-purple-600" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-5 border-b">
          <div className="flex items-center gap-2">
            <Key className="w-5 h-5 text-purple-600" />
            <h2 className="font-bold text-gray-900">Permissions granulaires</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <div className="overflow-auto flex-1 p-5">
          {isLoading ? <p className="text-center text-gray-400 py-8">Chargement…</p> : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 pr-4 font-semibold text-gray-700">Module</th>
                  {actions.map(a => <th key={a.key} className={`pb-2 px-2 text-center font-semibold ${a.cls}`}>{a.label}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y">
                {ERP_MODULES.map(m => {
                  const p = local.find(l => l.module === m.key) ?? { module: m.key, canView: false, canCreate: false, canEdit: false, canDelete: false, canExport: false };
                  return (
                    <tr key={m.key} className="hover:bg-gray-50">
                      <td className="py-2.5 pr-4 font-medium text-gray-800">{m.label}</td>
                      {actions.map(a => (
                        <td key={a.key} className="py-2.5 px-2 text-center">
                          <button onClick={() => toggle(m.key, a.key)}
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center mx-auto transition-colors ${(p as any)[a.key] ? "bg-emerald-500 border-emerald-500" : "border-gray-300 hover:border-gray-400"}`}>
                            {(p as any)[a.key] && <CheckCircle2 className="w-3 h-3 text-white" />}
                          </button>
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <div className="flex justify-end gap-3 p-4 border-t">
          <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Fermer</button>
          <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-60">
            {saveMutation.isPending ? "Enregistrement…" : "Sauvegarder"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Login History Modal ───────────────────────────────────────────────────────
function LoginHistoryModal({ userId, userName, onClose }: { userId: string; userName: string; onClose: () => void }) {
  const { data: history = [], isLoading } = useQuery<LoginEntry[]>({
    queryKey: ["login-history", userId],
    queryFn: () => api(`/users/${userId}/login-history`),
  });

  function parseUA(ua: string | null) {
    if (!ua) return "Appareil inconnu";
    if (ua.includes("Mobile")) return "📱 Mobile";
    if (ua.includes("Chrome")) return "🌐 Chrome";
    if (ua.includes("Firefox")) return "🦊 Firefox";
    if (ua.includes("Safari")) return "🧭 Safari";
    return "💻 Navigateur";
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between p-5 border-b">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-blue-600" />
            <div>
              <h2 className="font-bold text-gray-900">Historique connexions</h2>
              <p className="text-xs text-gray-500">{userName}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <div className="overflow-auto flex-1 p-4">
          {isLoading ? <p className="text-center text-gray-400 py-6">Chargement…</p> :
           history.length === 0 ? <p className="text-center text-gray-400 py-6">Aucune connexion enregistrée</p> : (
            <div className="space-y-2">
              {history.map(h => (
                <div key={h.id} className={`flex items-start gap-3 p-3 rounded-lg border ${h.success ? "border-green-100 bg-green-50" : "border-red-100 bg-red-50"}`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${h.success ? "bg-green-100" : "bg-red-100"}`}>
                    {h.success ? <LogIn className="w-3.5 h-3.5 text-green-600" /> : <XCircle className="w-3.5 h-3.5 text-red-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-xs font-semibold ${h.success ? "text-green-700" : "text-red-700"}`}>
                        {h.success ? "Connexion réussie" : "Échec de connexion"}
                      </span>
                      <span className="text-xs text-gray-400 shrink-0">{fmtDt(h.createdAt)}</span>
                    </div>
                    <p className="text-xs text-gray-600 mt-0.5">{parseUA(h.userAgent)}</p>
                    <p className="text-xs text-gray-400">{h.ip ?? "IP inconnue"}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex justify-end p-4 border-t">
          <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Fermer</button>
        </div>
      </div>
    </div>
  );
}

// ─── Delete Modal ──────────────────────────────────────────────────────────────
function DeleteModal({ user, onClose, onConfirm, isPending }: { user: UserRecord; onClose: () => void; onConfirm: (reason: string) => void; isPending: boolean }) {
  const [reason, setReason] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center"><UserX className="w-5 h-5 text-red-600" /></div>
          <div>
            <h2 className="font-bold text-gray-900">Supprimer {user.name ?? user.email} ?</h2>
            <p className="text-xs text-gray-500">Cette action est irréversible</p>
          </div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 inline mr-1" />
          L'historique de connexion et les permissions seront supprimés.
        </div>
        <div className="mb-4">
          <label className="text-sm font-medium text-gray-700 block mb-1.5">Raison de la suppression <span className="text-red-500">*</span></label>
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400 resize-none"
            placeholder="Ex: Départ de l'entreprise, compte dupliqué…" />
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Annuler</button>
          <button onClick={() => onConfirm(reason)} disabled={!reason.trim() || isPending}
            className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60">
            {isPending ? "Suppression…" : "Supprimer définitivement"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── User Form Modal ──────────────────────────────────────────────────────────
function UserFormModal({
  editing, onClose, onSuccess,
}: { editing: UserRecord | null; onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({
    email: editing?.email ?? "",
    password: "",
    name: editing?.name ?? "",
    role: editing?.role ?? "ACCOUNTANT",
    department: editing?.department ?? "",
    employeeId: editing?.employeeId ?? "",
  });
  const [error, setError] = useState("");

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ["employees-simple"],
    queryFn: () => fetch("/api/employees", { credentials: "include" }).then(r => r.json()).then(d => d.employees ?? d),
  });

  function pickEmployee(empId: string) {
    const emp = employees.find((e: Employee) => e.id === empId);
    if (emp) {
      setForm(f => ({
        ...f, employeeId: emp.id,
        name: f.name || emp.name,
        department: f.department || emp.department,
      }));
    } else {
      setForm(f => ({ ...f, employeeId: "" }));
    }
  }

  const saveMutation = useMutation({
    mutationFn: (payload: any) => editing
      ? api(`/users/${editing.id}`, { method: "PUT", body: JSON.stringify(payload) })
      : api("/users", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => { toast.success(editing ? "Utilisateur modifié" : "Utilisateur créé"); onSuccess(); },
    onError: (e: any) => setError(e.message),
  });

  function handleSave() {
    setError("");
    const payload: any = { email: form.email, name: form.name || null, role: form.role, department: form.department || null, employeeId: form.employeeId || null };
    if (form.password) payload.password = form.password;
    if (!editing && !form.password) { setError("Le mot de passe est requis pour un nouvel utilisateur"); return; }
    saveMutation.mutate(payload);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-5 border-b">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-emerald-600" />
            <h2 className="font-bold text-gray-900">{editing ? "Modifier l'utilisateur" : "Nouvel utilisateur"}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <div className="overflow-auto flex-1 p-5 space-y-4">
          {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}

          {/* Employee linkage */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1.5">Lier à un employé RH</label>
            <select value={form.employeeId} onChange={e => pickEmployee(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400">
              <option value="">— Aucun employé lié —</option>
              {employees.map((e: Employee) => <option key={e.id} value={e.id}>{e.name} · {e.position}</option>)}
            </select>
            {form.employeeId && (
              <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Fiche employée liée — informations auto-remplies
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-sm font-medium text-gray-700 block mb-1.5">Nom complet</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400"
                placeholder="Marie Rakoto" />
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium text-gray-700 block mb-1.5">Email <span className="text-red-500">*</span></label>
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400"
                placeholder="utilisateur@vanillamadagascar.mg" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5">{editing ? "Nouveau mot de passe" : "Mot de passe *"}</label>
              <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400"
                placeholder={editing ? "Laisser vide = inchangé" : "••••••••"} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5">Département</label>
              <input value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400"
                placeholder="Finance, RH, Logistique…" />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1.5">Rôle ERP <span className="text-red-500">*</span></label>
            <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400">
              {ALL_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>)}
            </select>
            <p className="text-xs text-gray-400 mt-1">Les permissions par défaut du rôle seront appliquées automatiquement.</p>
          </div>
        </div>
        <div className="flex justify-end gap-3 p-4 border-t">
          <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Annuler</button>
          <button onClick={handleSave} disabled={saveMutation.isPending}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-60">
            {saveMutation.isPending ? "Enregistrement…" : editing ? "Modifier" : "Créer l'utilisateur"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function UsersPage() {
  const qc = useQueryClient();
  const { user: me } = useAuth();

  const [search, setSearch]               = useState("");
  const [filterRole, setFilterRole]       = useState("all");
  const [filterStatus, setFilterStatus]   = useState("all");
  const [filterDept, setFilterDept]       = useState("all");
  const [formTarget, setFormTarget]       = useState<UserRecord | null | "new">(null);
  const [permsTarget, setPermsTarget]     = useState<UserRecord | null>(null);
  const [historyTarget, setHistoryTarget] = useState<UserRecord | null>(null);
  const [deleteTarget, setDeleteTarget]   = useState<UserRecord | null>(null);

  const { data: users = [], isLoading, refetch } = useQuery<UserRecord[]>({
    queryKey: ["iam-users"],
    queryFn: () => api("/users"),
  });

  const { data: kpis } = useQuery({
    queryKey: ["iam-kpis"],
    queryFn: () => api("/users/kpis"),
    refetchInterval: 30_000,
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) =>
      api(`/users/${id}/status`, { method: "PUT", body: JSON.stringify({ action }) }),
    onSuccess: (_, { action }) => {
      const labels: Record<string, string> = { activate: "Compte activé", deactivate: "Compte désactivé", lock: "Compte bloqué", unlock: "Compte débloqué" };
      toast.success(labels[action] ?? "Mise à jour effectuée");
      qc.invalidateQueries({ queryKey: ["iam-users"] });
      qc.invalidateQueries({ queryKey: ["iam-kpis"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api(`/users/${id}`, { method: "DELETE", body: JSON.stringify({ reason }) }),
    onSuccess: (d: any) => {
      toast.success(`Utilisateur ${d.deletedEmail} supprimé`);
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ["iam-users"] });
      qc.invalidateQueries({ queryKey: ["iam-kpis"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const departments = useMemo(() => {
    const depts = [...new Set(users.map(u => u.employeeDepartment ?? u.department).filter(Boolean))];
    return depts.sort();
  }, [users]);

  const filtered = useMemo(() => users.filter(u => {
    const q = search.toLowerCase();
    const matchQ = !q || (u.name ?? "").toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    const matchR = filterRole === "all" || u.role === filterRole;
    const matchS = filterStatus === "all" || u.status === filterStatus;
    const matchD = filterDept === "all" || u.employeeDepartment === filterDept || u.department === filterDept;
    return matchQ && matchR && matchS && matchD;
  }), [users, search, filterRole, filterStatus, filterDept]);

  function exportCSV() {
    const headers = ["Nom", "Email", "Rôle", "Département", "Statut", "Dernière connexion", "Créé le"];
    const rows = filtered.map(u => [
      u.name ?? "", u.email, ROLE_LABELS[u.role] ?? u.role,
      u.employeeDepartment ?? u.department ?? "", u.status,
      fmtDt(u.lastLoginAt), fmtDate(u.createdAt),
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "utilisateurs-erp.csv"; a.click();
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Modals */}
      {formTarget !== null && (
        <UserFormModal
          editing={formTarget === "new" ? null : formTarget}
          onClose={() => setFormTarget(null)}
          onSuccess={() => { setFormTarget(null); qc.invalidateQueries({ queryKey: ["iam-users"] }); qc.invalidateQueries({ queryKey: ["iam-kpis"] }); }}
        />
      )}
      {permsTarget && <PermissionsPanel userId={permsTarget.id} onClose={() => setPermsTarget(null)} />}
      {historyTarget && <LoginHistoryModal userId={historyTarget.id} userName={historyTarget.name ?? historyTarget.email} onClose={() => setHistoryTarget(null)} />}
      {deleteTarget && (
        <DeleteModal user={deleteTarget} onClose={() => setDeleteTarget(null)}
          onConfirm={reason => deleteMutation.mutate({ id: deleteTarget.id, reason })}
          isPending={deleteMutation.isPending}
        />
      )}

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <ShieldCheck className="w-7 h-7 text-purple-600" /> Gestion des Accès & Identités
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">IAM · Rôles · Permissions · Sécurité · Audit</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { refetch(); qc.invalidateQueries({ queryKey: ["iam-kpis"] }); }}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
              <RefreshCw className="w-4 h-4" /> Actualiser
            </button>
            <button onClick={exportCSV}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
              <Download className="w-4 h-4" /> Exporter
            </button>
            <button onClick={() => setFormTarget("new")}
              className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700">
              <UserPlus className="w-4 h-4" /> Nouvel utilisateur
            </button>
          </div>
        </div>

        {/* KPI Dashboard */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard icon={UserCheck}  label="Utilisateurs actifs"    value={kpis?.activeUsers ?? "—"}   sub={`sur ${kpis?.totalUsers ?? "—"} au total`} iconBg="bg-green-100" iconColor="text-green-600" color="text-green-700" />
          <KpiCard icon={LogIn}      label="Connexions (24h)"        value={kpis?.logins24h ?? "—"}     sub={`${kpis?.logins7d ?? "—"} cette semaine`} iconBg="bg-blue-100" iconColor="text-blue-600" color="text-blue-700" />
          <KpiCard icon={AlertTriangle} label="Échecs connexion (24h)" value={kpis?.failed24h ?? "—"} sub="tentatives incorrectes" iconBg="bg-amber-100" iconColor="text-amber-600" color="text-amber-700" />
          <KpiCard icon={Lock}       label="Comptes bloqués"         value={kpis?.lockedAccounts ?? "—"} sub={`blocage après ${5} tentatives`} iconBg="bg-red-100" iconColor="text-red-600" color="text-red-700" />
        </div>

        {/* Filters */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap gap-3 items-center shadow-sm">
          <div className="relative flex-1 min-w-48">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400"
              placeholder="Rechercher par nom ou email…" />
          </div>
          <select value={filterRole} onChange={e => setFilterRole(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none">
            <option value="all">Tous les rôles</option>
            {ALL_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none">
            <option value="all">Tous statuts</option>
            <option value="active">Actif</option>
            <option value="inactive">Inactif</option>
            <option value="locked">Bloqué</option>
          </select>
          {departments.length > 0 && (
            <select value={filterDept} onChange={e => setFilterDept(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none">
              <option value="all">Tous départements</option>
              {departments.map(d => <option key={d} value={d!}>{d}</option>)}
            </select>
          )}
          <span className="text-xs text-gray-400 ml-auto">{filtered.length} utilisateur{filtered.length !== 1 ? "s" : ""}</span>
        </div>

        {/* Table */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Chargement…
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p>Aucun utilisateur trouvé</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left py-3 px-4 font-semibold text-gray-600">Utilisateur</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-600">Rôle</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-600">Département</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-600">Statut</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-600">Dernière connexion</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map(u => (
                    <tr key={u.id} className={`hover:bg-gray-50 transition-colors ${u.id === me?.id ? "bg-purple-50/40" : ""}`}>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                            {(u.name ?? u.email)[0].toUpperCase()}
                          </div>
                          <div>
                            <div className="font-medium text-gray-900 flex items-center gap-1.5">
                              {u.name ?? "—"}
                              {u.id === me?.id && <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-semibold">Vous</span>}
                            </div>
                            <div className="text-xs text-gray-400">{u.email}</div>
                            {u.employeeName && u.employeeName !== u.name && (
                              <div className="text-xs text-emerald-600 flex items-center gap-0.5 mt-0.5">
                                <Building2 className="w-3 h-3" /> {u.employeePosition ?? u.employeeName}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4"><RoleBadge role={u.role} /></td>
                      <td className="py-3.5 px-4">
                        <span className="text-gray-600 text-xs">{u.employeeDepartment ?? u.department ?? ROLE_DEPT[u.role] ?? "—"}</span>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col gap-1">
                          <StatusBadge status={u.status} />
                          {u.failedAttempts > 0 && (
                            <span className="text-[10px] text-amber-600 flex items-center gap-0.5">
                              <AlertTriangle className="w-3 h-3" /> {u.failedAttempts} tentative{u.failedAttempts > 1 ? "s" : ""} échouée{u.failedAttempts > 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="text-xs text-gray-600 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-gray-400" />
                          {fmtDt(u.lastLoginAt)}
                        </div>
                        {u.loginsToday > 0 && (
                          <div className="text-[10px] text-green-600 mt-0.5">{u.loginsToday} connexion{u.loginsToday > 1 ? "s" : ""} aujourd'hui</div>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center justify-end gap-1">
                          {/* History */}
                          <button onClick={() => setHistoryTarget(u)} title="Historique connexions"
                            className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                            <History className="w-4 h-4" />
                          </button>
                          {/* Permissions */}
                          <button onClick={() => setPermsTarget(u)} title="Permissions"
                            className="p-1.5 rounded-lg text-gray-400 hover:text-purple-600 hover:bg-purple-50 transition-colors">
                            <Key className="w-4 h-4" />
                          </button>
                          {/* Edit */}
                          <button onClick={() => setFormTarget(u)} title="Modifier"
                            className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors">
                            <Edit2 className="w-4 h-4" />
                          </button>
                          {/* Lock / Unlock */}
                          {u.id !== me?.id && (
                            u.status === "locked" ? (
                              <button onClick={() => statusMutation.mutate({ id: u.id, action: "unlock" })} title="Débloquer"
                                className="p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors">
                                <Unlock className="w-4 h-4" />
                              </button>
                            ) : (
                              <button onClick={() => statusMutation.mutate({ id: u.id, action: u.isActive ? "deactivate" : "activate" })}
                                title={u.isActive ? "Désactiver" : "Activer"}
                                className={`p-1.5 rounded-lg text-gray-400 transition-colors ${u.isActive ? "hover:text-amber-600 hover:bg-amber-50" : "hover:text-green-600 hover:bg-green-50"}`}>
                                {u.isActive ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                              </button>
                            )
                          )}
                          {/* Delete */}
                          {u.id !== me?.id && (
                            <button onClick={() => setDeleteTarget(u)} title="Supprimer"
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wider">Rôles disponibles</p>
          <div className="flex flex-wrap gap-2">
            {ALL_ROLES.map(r => <RoleBadge key={r} role={r} />)}
          </div>
        </div>
      </div>
    </div>
  );
}
