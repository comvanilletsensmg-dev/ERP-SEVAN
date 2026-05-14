import { useState, useRef } from "react";
import { Link } from "wouter";
import {
  Shield, ShieldAlert, ShieldCheck, AlertTriangle, Users, Lock, Unlock,
  Activity, Trash2, Download, Plus, CheckCircle2,
  XCircle, MonitorDot, Wifi, WifiOff, ChevronRight, KeyRound, Ban,
  RefreshCw, UserX, LogIn, Smartphone, QrCode, HardDrive, Database,
  Mail, ToggleLeft, ToggleRight, FileArchive, Info, Upload, Clock,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface LoginEntry { id: string; userId: string; userName: string; userEmail: string; ip: string | null; userAgent: string | null; success: boolean; createdAt: string }
interface UserStatus { id: string; name: string; email: string; role: string; status: string; isActive: boolean; failedAttempts: number; lastLoginAt: string | null; lockedAt: string | null; isOnline: boolean }
interface RolePerm { id: string; role: string; module: string; canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean; canExport: boolean }
interface SuspiciousIp { ip: string; count: number }
interface TwoFaUser { id: string; name: string; email: string; role: string; twoFactorEnabled: boolean; twoFactorMethod: string | null }
interface BackupFile { filename: string; size: number; createdAt: string }

interface SecurityData {
  score: number; scoreLabel: string;
  totalUsers: number; activeUsers: number;
  lockedUsers: { id: string; name: string; email: string; role: string; failedAttempts: number; lockedAt: string | null }[];
  usersWithFailedAttempts: { id: string; name: string; email: string; role: string; failedAttempts: number }[];
  activeSessionCount: number; activeUserIds: string[];
  recentLogins: LoginEntry[];
  failedLast24h: number; successLast24h: number;
  suspiciousIps: SuspiciousIp[];
  adminNoRecentLogin: { id: string; name: string; email: string; role: string; lastLoginAt: string | null }[];
  rolePermissions: RolePerm[];
  allUsers: UserStatus[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const ROLE_FR: Record<string, string> = {
  SUPER_ADMIN: "Super Admin", ADMIN: "Admin", DG: "DG", DGA: "DGA",
  ACCOUNTANT: "Comptable", LOGISTICS_MANAGER: "Logistique",
  HR_MANAGER: "RH", COMMERCIAL: "Commercial", BUSINESS_DEVELOPER: "Biz Dev", DSI: "DSI",
};
const ROLE_COLOR: Record<string, string> = {
  SUPER_ADMIN: "bg-red-100 text-red-700", ADMIN: "bg-orange-100 text-orange-700",
  DG: "bg-violet-100 text-violet-700", DGA: "bg-purple-100 text-purple-700",
  ACCOUNTANT: "bg-blue-100 text-blue-700", LOGISTICS_MANAGER: "bg-emerald-100 text-emerald-700",
  HR_MANAGER: "bg-pink-100 text-pink-700", COMMERCIAL: "bg-teal-100 text-teal-700",
  BUSINESS_DEVELOPER: "bg-sky-100 text-sky-700", DSI: "bg-indigo-100 text-indigo-700",
};
const fmtDate = (d: string | null) => d ? new Date(d).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
const fmtSize = (b: number) => b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} Ko` : `${(b / 1024 / 1024).toFixed(1)} Mo`;
const timeAgo = (d: string) => {
  const diff = Date.now() - new Date(d).getTime();
  if (diff < 60_000) return "À l'instant";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}j`;
};
const parseAgent = (ua: string | null) => {
  if (!ua) return "Inconnu";
  if (/chrome/i.test(ua) && !/edge/i.test(ua)) return "Chrome";
  if (/firefox/i.test(ua)) return "Firefox";
  if (/safari/i.test(ua) && !/chrome/i.test(ua)) return "Safari";
  if (/edge/i.test(ua)) return "Edge";
  return "Navigateur";
};

// ─── Score Gauge ──────────────────────────────────────────────────────────────
function ScoreGauge({ score, label }: { score: number; label: string }) {
  const color = score >= 80 ? "text-emerald-500" : score >= 60 ? "text-amber-500" : "text-red-500";
  const ring = score >= 80 ? "border-emerald-400" : score >= 60 ? "border-amber-400" : "border-red-400";
  const Icon = score >= 80 ? ShieldCheck : score >= 60 ? Shield : ShieldAlert;
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-4">
      <div className={`w-24 h-24 rounded-full border-[6px] ${ring} flex items-center justify-center shadow-lg`}>
        <div className="text-center">
          <p className={`text-3xl font-black ${color}`}>{score}</p>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className={`text-sm font-bold ${color}`}>{label}</span>
      </div>
      <p className="text-xs text-gray-400">Score de sécurité</p>
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, iconBg, iconColor, urgent }: {
  label: string; value: string | number; icon: any; iconBg: string; iconColor: string; urgent?: boolean;
}) {
  return (
    <div className={`bg-white rounded-xl border p-4 shadow-sm ${urgent ? "border-red-200" : "border-gray-100"}`}>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${iconBg} mb-3`}>
        <Icon className={`w-4 h-4 ${iconColor}`} />
      </div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold ${urgent && Number(value) > 0 ? "text-red-600" : "text-gray-800"}`}>{value}</p>
    </div>
  );
}

// ─── Permission Cell ──────────────────────────────────────────────────────────
function PermCell({ value }: { value: boolean }) {
  return value
    ? <span className="w-5 h-5 inline-flex items-center justify-center rounded-full bg-emerald-100"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /></span>
    : <span className="w-5 h-5 inline-flex items-center justify-center rounded-full bg-gray-100"><XCircle className="w-3.5 h-3.5 text-gray-300" /></span>;
}

// ─── 2FA Setup Modal ──────────────────────────────────────────────────────────
function TwoFaSetupModal({
  qrCode, secret, onVerify, onCancel, loading, error,
}: {
  qrCode: string; secret: string;
  onVerify: (code: string) => void; onCancel: () => void;
  loading: boolean; error: string | null;
}) {
  const [code, setCode] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-5">
        <div className="text-center">
          <div className="w-10 h-10 bg-violet-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <QrCode className="w-5 h-5 text-violet-600" />
          </div>
          <h2 className="text-lg font-bold text-gray-900">Configuration 2FA</h2>
          <p className="text-xs text-gray-500 mt-1">Scanne ce QR code avec Google Authenticator ou Authy</p>
        </div>
        <div className="flex justify-center">
          <img src={qrCode} alt="QR Code 2FA" className="w-40 h-40 rounded-xl border border-gray-200" />
        </div>
        <div className="bg-gray-50 rounded-xl p-3 text-center">
          <p className="text-xs text-gray-500 mb-1">Clé manuelle</p>
          <p className="font-mono text-sm font-bold text-gray-800 tracking-widest break-all">{secret}</p>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-700">Saisis le code généré pour confirmer</p>
          <input type="text" inputMode="numeric" maxLength={6} placeholder="000000"
            value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="w-full text-center text-2xl font-mono tracking-[0.5em] border border-gray-200 rounded-xl py-2 focus:outline-none focus:ring-2 focus:ring-violet-400" />
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50">Annuler</button>
          <button onClick={() => onVerify(code)} disabled={loading || code.length < 6}
            className="flex-1 px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700 disabled:opacity-50">
            {loading ? "Vérification…" : "Activer"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function SecurityDashboard({
  data, twoFaStatus, backups, myTwoFa,
  onUnlock, onRevokeSession,
  onSetup2fa, onEnable2fa, onDisable2fa,
  onCreateBackup, onDeleteBackup, onUploadBackup,
}: {
  data: SecurityData;
  twoFaStatus: TwoFaUser[];
  backups: BackupFile[];
  myTwoFa: { enabled: boolean; method: string | null };
  onUnlock: (userId: string) => Promise<void>;
  onRevokeSession: (userId: string) => Promise<void>;
  onSetup2fa: () => Promise<{ secret: string; qrCode: string } | null>;
  onEnable2fa: (code: string) => Promise<boolean>;
  onDisable2fa: (code: string) => Promise<boolean>;
  onCreateBackup: () => Promise<{ success: boolean; filename?: string; error?: string }>;
  onDeleteBackup: (filename: string) => Promise<void>;
  onUploadBackup: (file: File) => Promise<{ success: boolean; filename?: string; error?: string }>;
}) {
  type Tab = "overview" | "logins" | "users" | "permissions" | "2fa" | "backups";
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [unlocking, setUnlocking] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  // 2FA states
  const [setupData, setSetupData] = useState<{ secret: string; qrCode: string } | null>(null);
  const [setup2faLoading, setSetup2faLoading] = useState(false);
  const [setup2faError, setSetup2faError] = useState<string | null>(null);
  const [disableCode, setDisableCode] = useState("");
  const [disableLoading, setDisableLoading] = useState(false);
  const [disableError, setDisableError] = useState<string | null>(null);
  const [twoFaMsg, setTwoFaMsg] = useState<string | null>(null);

  // Backup states
  const [backupCreating, setBackupCreating] = useState(false);
  const [backupMsg, setBackupMsg] = useState<string | null>(null);
  const [deletingFile, setDeletingFile] = useState<string | null>(null);
  const [uploadingBackup, setUploadingBackup] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const totalThreats = data.lockedUsers.length + data.suspiciousIps.length + data.adminNoRecentLogin.length;
  const moduleSet = [...new Set(data.rolePermissions.map(p => p.module))].sort();
  const roleSet   = [...new Set(data.rolePermissions.map(p => p.role))].sort();
  const twoFaEnabled = twoFaStatus.filter(u => u.twoFactorEnabled).length;

  const handleUnlock = async (userId: string) => {
    setUnlocking(userId);
    try { await onUnlock(userId); } finally { setUnlocking(null); }
  };
  const handleRevoke = async (userId: string) => {
    setRevoking(userId);
    try { await onRevokeSession(userId); } finally { setRevoking(null); }
  };

  // ── 2FA handlers ──
  const handleSetup2fa = async () => {
    setSetup2faLoading(true); setSetup2faError(null);
    const d = await onSetup2fa();
    setSetup2faLoading(false);
    if (d) setSetupData(d);
  };
  const handleEnable2fa = async (code: string) => {
    setSetup2faLoading(true); setSetup2faError(null);
    const ok = await onEnable2fa(code);
    setSetup2faLoading(false);
    if (ok) { setSetupData(null); setTwoFaMsg("✅ 2FA activée avec succès !"); }
    else setSetup2faError("Code invalide. Réessaie.");
  };
  const handleDisable2fa = async () => {
    setDisableLoading(true); setDisableError(null);
    const ok = await onDisable2fa(disableCode);
    setDisableLoading(false);
    if (ok) { setDisableCode(""); setTwoFaMsg("2FA désactivée."); }
    else setDisableError("Code invalide.");
  };

  // ── Backup handlers ──
  const handleUploadBackup = async (file: File) => {
    if (!file.name.endsWith(".zip")) { setUploadMsg("❌ Seuls les fichiers .zip sont acceptés"); return; }
    setUploadingBackup(true); setUploadMsg(null);
    const r = await onUploadBackup(file);
    setUploadingBackup(false);
    setUploadMsg(r.success ? `✅ Backup importé : ${r.filename}` : `❌ ${r.error}`);
  };
  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUploadBackup(file);
  };
  const handleCreateBackup = async () => {
    setBackupCreating(true); setBackupMsg(null);
    const r = await onCreateBackup();
    setBackupCreating(false);
    setBackupMsg(r.success ? `✅ Backup créé : ${r.filename}` : `❌ Erreur : ${r.error}`);
    setTimeout(() => setBackupMsg(null), 5000);
  };
  const handleDeleteBackup = async (filename: string) => {
    if (!confirm(`Supprimer le backup "${filename}" ?`)) return;
    setDeletingFile(filename);
    await onDeleteBackup(filename);
    setDeletingFile(null);
  };

  const TABS = [
    { key: "overview",    label: "Vue d'ensemble",   icon: Activity },
    { key: "logins",      label: "Historique accès",  icon: LogIn },
    { key: "users",       label: "Utilisateurs",       icon: Users },
    { key: "permissions", label: "Permissions",        icon: KeyRound },
    { key: "2fa",         label: "Double auth",        icon: Smartphone },
    { key: "backups",     label: "Sauvegardes",        icon: HardDrive },
  ] as const;

  return (
    <div className="space-y-6">
      {setupData && (
        <TwoFaSetupModal
          qrCode={setupData.qrCode} secret={setupData.secret}
          onVerify={handleEnable2fa}
          onCancel={() => setSetupData(null)}
          loading={setup2faLoading}
          error={setup2faError}
        />
      )}

      {/* ── Header ── */}
      <div className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 rounded-2xl p-6 text-white">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-gray-400 text-xs mb-2">
              <Shield className="w-3.5 h-3.5 text-blue-400" />
              <span>Centre de Sécurité ERP · Accès Administrateur</span>
            </div>
            <h1 className="text-2xl font-bold">Security Center</h1>
            <p className="text-gray-400 text-sm mt-0.5">Surveillance, audit et contrôle des accès en temps réel</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/20 border border-blue-500/40 rounded-lg text-xs font-medium text-blue-300">
              <Wifi className="w-3.5 h-3.5" /> {data.activeSessionCount} session{data.activeSessionCount > 1 ? "s" : ""} active{data.activeSessionCount > 1 ? "s" : ""}
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-500/20 border border-violet-500/40 rounded-lg text-xs font-medium text-violet-300">
              <Smartphone className="w-3.5 h-3.5" /> {twoFaEnabled}/{twoFaStatus.length} 2FA
            </div>
            {totalThreats > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/20 border border-red-500/40 rounded-lg text-xs font-medium text-red-300 animate-pulse">
                <AlertTriangle className="w-3.5 h-3.5" /> {totalThreats} alerte{totalThreats > 1 ? "s" : ""}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Threat Alerts ── */}
      {totalThreats > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-2 mb-2">
            <ShieldAlert className="w-4 h-4 text-red-600" />
            <h2 className="text-sm font-bold text-red-800">{totalThreats} menace{totalThreats > 1 ? "s" : ""} détectée{totalThreats > 1 ? "s" : ""}</h2>
          </div>
          {data.lockedUsers.map(u => (
            <div key={u.id} className="flex items-center justify-between bg-white border border-red-200 rounded-xl px-4 py-2.5">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-red-500" />
                <div>
                  <p className="text-sm font-semibold text-red-700">{u.name} — compte verrouillé</p>
                  <p className="text-xs text-red-400">{u.email} · {u.failedAttempts} tentative{u.failedAttempts > 1 ? "s" : ""} échouée{u.failedAttempts > 1 ? "s" : ""}</p>
                </div>
              </div>
              <button onClick={() => handleUnlock(u.id)} disabled={unlocking === u.id}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                {unlocking === u.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Unlock className="w-3.5 h-3.5" />}
                Déverrouiller
              </button>
            </div>
          ))}
          {data.suspiciousIps.map(({ ip, count }) => (
            <div key={ip} className="flex items-center gap-2 bg-white border border-orange-200 rounded-xl px-4 py-2.5">
              <AlertTriangle className="w-4 h-4 text-orange-500" />
              <div>
                <p className="text-sm font-semibold text-orange-700">IP suspecte : {ip}</p>
                <p className="text-xs text-orange-400">{count} tentative{count > 1 ? "s" : ""} échouée{count > 1 ? "s" : ""} dans les dernières 24h</p>
              </div>
            </div>
          ))}
          {data.adminNoRecentLogin.map(u => (
            <div key={u.id} className="flex items-center gap-2 bg-white border border-amber-200 rounded-xl px-4 py-2.5">
              <Clock className="w-4 h-4 text-amber-500" />
              <div>
                <p className="text-sm font-semibold text-amber-700">{u.name} — inactif depuis 30+ jours</p>
                <p className="text-xs text-amber-400">Dernière connexion : {u.lastLoginAt ? fmtDate(u.lastLoginAt) : "Jamais"}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="flex flex-wrap gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === t.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
              <Icon className="w-4 h-4" />{t.label}
            </button>
          );
        })}
      </div>

      {/* ══ TAB: OVERVIEW ══ */}
      {activeTab === "overview" && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col items-center">
              <ScoreGauge score={data.score} label={data.scoreLabel} />
              <div className="w-full mt-4 space-y-2 text-xs">
                {[
                  { label: "Comptes verrouillés",     value: data.lockedUsers.length,         bad: data.lockedUsers.length > 0 },
                  { label: "IP suspectes",             value: data.suspiciousIps.length,       bad: data.suspiciousIps.length > 0 },
                  { label: "Admins inactifs 30j",      value: data.adminNoRecentLogin.length,  bad: data.adminNoRecentLogin.length > 0 },
                  { label: "Tentatives échouées 24h",  value: data.failedLast24h,              bad: data.failedLast24h > 3 },
                  { label: "Utilisateurs avec 2FA",    value: `${twoFaEnabled}/${twoFaStatus.length}`, bad: twoFaEnabled < twoFaStatus.length },
                ].map(r => (
                  <div key={r.label} className="flex justify-between items-center py-1 border-b border-gray-50">
                    <span className="text-gray-500">{r.label}</span>
                    <span className={`font-bold ${r.bad ? "text-red-600" : "text-emerald-600"}`}>{r.value}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="md:col-span-2 grid grid-cols-2 gap-3">
              <StatCard label="Sessions actives"     value={data.activeSessionCount} icon={Wifi}        iconBg="bg-blue-50"    iconColor="text-blue-600" />
              <StatCard label="Connexions (24h)"     value={data.successLast24h}     icon={CheckCircle2} iconBg="bg-emerald-50" iconColor="text-emerald-600" />
              <StatCard label="Échecs (24h)"         value={data.failedLast24h}      icon={XCircle}     iconBg="bg-red-50"     iconColor="text-red-500"   urgent={data.failedLast24h > 0} />
              <StatCard label="Avec 2FA activée"     value={twoFaEnabled}            icon={Smartphone}  iconBg="bg-violet-50"  iconColor="text-violet-600" />
              <div className="col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <h3 className="text-xs font-bold text-gray-700 mb-3 uppercase tracking-wide">Dernières connexions</h3>
                <div className="space-y-2">
                  {data.recentLogins.slice(0, 5).map(l => (
                    <div key={l.id} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        {l.success
                          ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                          : <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />}
                        <span className="font-medium text-gray-700 truncate max-w-[120px]">{l.userName}</span>
                        {l.ip && <span className="text-gray-400 hidden sm:block">{l.ip}</span>}
                      </div>
                      <span className="text-gray-400 flex-shrink-0">{timeAgo(l.createdAt)}</span>
                    </div>
                  ))}
                </div>
                <button onClick={() => setActiveTab("logins")}
                  className="mt-3 flex items-center gap-1 text-xs text-blue-600 hover:underline font-medium">
                  Voir tout <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ TAB: LOGIN HISTORY ══ */}
      {activeTab === "logins" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-gray-800">Historique des accès</h3>
              <p className="text-xs text-gray-400">{data.recentLogins.length} événements récents</p>
            </div>
            <div className="flex gap-3 text-xs">
              <div className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />{data.successLast24h} réussis (24h)</div>
              <div className="flex items-center gap-1"><XCircle className="w-3.5 h-3.5 text-red-500" />{data.failedLast24h} échoués (24h)</div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-gray-400 border-b border-gray-100">
                  <th className="pb-2 pr-4">Statut</th>
                  <th className="pb-2 pr-4">Utilisateur</th>
                  <th className="pb-2 pr-4">IP</th>
                  <th className="pb-2 pr-4">Navigateur</th>
                  <th className="pb-2">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.recentLogins.map(l => (
                  <tr key={l.id} className={`hover:bg-gray-50/50 transition-colors ${!l.success ? "bg-red-50/30" : ""}`}>
                    <td className="py-2.5 pr-4">
                      {l.success
                        ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold"><CheckCircle2 className="w-3 h-3" /> OK</span>
                        : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 text-red-700 text-xs font-semibold"><XCircle className="w-3 h-3" /> Échec</span>}
                    </td>
                    <td className="py-2.5 pr-4">
                      <p className="font-medium text-gray-800 text-xs">{l.userName}</p>
                      <p className="text-gray-400 text-xs">{l.userEmail}</p>
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className="font-mono text-xs text-gray-600">{l.ip ?? "—"}</span>
                      {data.suspiciousIps.some(s => s.ip === l.ip) && (
                        <span className="ml-1 px-1 py-0.5 bg-orange-100 text-orange-700 text-xs rounded font-semibold">!</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 text-xs text-gray-500">{parseAgent(l.userAgent)}</td>
                    <td className="py-2.5 text-xs text-gray-500">{fmtDate(l.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══ TAB: USERS ══ */}
      {activeTab === "users" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-bold text-gray-800 mb-4">Statut sécurité des utilisateurs</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-gray-400 border-b border-gray-100">
                  <th className="pb-2 pr-4">Utilisateur</th>
                  <th className="pb-2 pr-4">Rôle</th>
                  <th className="pb-2 pr-4">Statut</th>
                  <th className="pb-2 pr-4">Présence</th>
                  <th className="pb-2 pr-4">Tentatives</th>
                  <th className="pb-2 pr-4">Dernière connexion</th>
                  <th className="pb-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.allUsers.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50/50">
                    <td className="py-2.5 pr-4">
                      <p className="font-semibold text-gray-800 text-xs">{u.name}</p>
                      <p className="text-gray-400 text-xs">{u.email}</p>
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${ROLE_COLOR[u.role] ?? "bg-gray-100 text-gray-600"}`}>{ROLE_FR[u.role] ?? u.role}</span>
                    </td>
                    <td className="py-2.5 pr-4">
                      {u.status === "locked"
                        ? <span className="flex items-center gap-1 text-xs text-red-600 font-semibold"><Lock className="w-3.5 h-3.5" /> Verrouillé</span>
                        : u.isActive
                        ? <span className="flex items-center gap-1 text-xs text-emerald-600 font-semibold"><CheckCircle2 className="w-3.5 h-3.5" /> Actif</span>
                        : <span className="flex items-center gap-1 text-xs text-gray-400 font-semibold"><Ban className="w-3.5 h-3.5" /> Inactif</span>}
                    </td>
                    <td className="py-2.5 pr-4">
                      {u.isOnline
                        ? <span className="flex items-center gap-1 text-xs text-blue-600"><MonitorDot className="w-3.5 h-3.5" /> En ligne</span>
                        : <span className="flex items-center gap-1 text-xs text-gray-300"><WifiOff className="w-3.5 h-3.5" /> Hors ligne</span>}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className={`text-sm font-bold ${u.failedAttempts >= 3 ? "text-red-600" : u.failedAttempts > 0 ? "text-amber-600" : "text-gray-300"}`}>
                        {u.failedAttempts}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-xs text-gray-500">{fmtDate(u.lastLoginAt)}</td>
                    <td className="py-2.5">
                      <div className="flex gap-1">
                        {(u.status === "locked" || u.failedAttempts > 0) && (
                          <button onClick={() => handleUnlock(u.id)} disabled={unlocking === u.id}
                            title="Déverrouiller"
                            className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 disabled:opacity-50 transition-colors">
                            {unlocking === u.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Unlock className="w-3.5 h-3.5" />}
                          </button>
                        )}
                        {u.isOnline && (
                          <button onClick={() => handleRevoke(u.id)} disabled={revoking === u.id}
                            title="Révoquer les sessions"
                            className="p-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 disabled:opacity-50 transition-colors">
                            {revoking === u.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <UserX className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══ TAB: PERMISSIONS ══ */}
      {activeTab === "permissions" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <KeyRound className="w-4 h-4 text-gray-600" />
            <h3 className="text-sm font-bold text-gray-800">Matrice des permissions par rôle</h3>
          </div>
          <p className="text-xs text-gray-400 mb-4">Permissions configurées par rôle et par module ERP (lecture seule)</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="pb-3 pr-4 text-left text-gray-600 font-semibold w-36">Module</th>
                  {roleSet.map(r => (
                    <th key={r} className="pb-3 px-2 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${ROLE_COLOR[r] ?? "bg-gray-100 text-gray-600"}`}>{ROLE_FR[r] ?? r}</span>
                        <div className="flex gap-0.5 text-gray-300 text-xs">
                          <span title="Voir">V</span><span title="Créer">C</span>
                          <span title="Modifier">M</span><span title="Supprimer">S</span><span title="Exporter">E</span>
                        </div>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {moduleSet.map(mod => (
                  <tr key={mod} className="hover:bg-gray-50/50">
                    <td className="py-2.5 pr-4 font-semibold text-gray-700 capitalize">{mod}</td>
                    {roleSet.map(role => {
                      const p = data.rolePermissions.find(x => x.role === role && x.module === mod);
                      if (!p) return <td key={role} className="py-2.5 px-2 text-center"><span className="text-gray-200">—</span></td>;
                      return (
                        <td key={role} className="py-2.5 px-2">
                          <div className="flex gap-0.5 justify-center">
                            <PermCell value={p.canView} /><PermCell value={p.canCreate} />
                            <PermCell value={p.canEdit} /><PermCell value={p.canDelete} /><PermCell value={p.canExport} />
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex gap-4 text-xs text-gray-400">
            <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Autorisé</span>
            <span className="flex items-center gap-1"><XCircle className="w-3.5 h-3.5 text-gray-300" /> Refusé</span>
            <span className="ml-2 italic">V=Voir C=Créer M=Modifier S=Supprimer E=Exporter</span>
          </div>
          <div className="mt-3">
            <Link href="/admin/users">
              <div className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-900 text-white text-xs font-semibold rounded-lg hover:bg-gray-800 cursor-pointer transition-colors">
                <Users className="w-3.5 h-3.5" /> Gérer les utilisateurs
              </div>
            </Link>
          </div>
        </div>
      )}

      {/* ══ TAB: DOUBLE AUTH ══ */}
      {activeTab === "2fa" && (
        <div className="space-y-5">
          {twoFaMsg && (
            <div className={`rounded-xl px-4 py-3 text-sm font-semibold ${twoFaMsg.startsWith("✅") ? "bg-emerald-50 border border-emerald-200 text-emerald-700" : "bg-amber-50 border border-amber-200 text-amber-700"}`}>
              {twoFaMsg}
            </div>
          )}

          {/* My 2FA Card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center">
                <Smartphone className="w-5 h-5 text-violet-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-800">Ma double authentification</h3>
                <p className="text-xs text-gray-500">Configuration pour ton compte</p>
              </div>
              <div className="ml-auto">
                {myTwoFa.enabled
                  ? <span className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-full text-xs font-bold text-emerald-700"><ToggleRight className="w-4 h-4" /> Activée</span>
                  : <span className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 border border-gray-200 rounded-full text-xs font-bold text-gray-500"><ToggleLeft className="w-4 h-4" /> Désactivée</span>}
              </div>
            </div>

            {!myTwoFa.enabled ? (
              <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex gap-3">
                  <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-700">La 2FA ajoute une couche de sécurité supplémentaire. À chaque connexion, un code temporaire (TOTP) généré par une app comme <strong>Google Authenticator</strong> ou <strong>Authy</strong> sera requis.</p>
                </div>
                <button onClick={handleSetup2fa} disabled={setup2faLoading}
                  className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white text-sm font-semibold rounded-xl hover:bg-violet-700 disabled:opacity-50 transition-colors">
                  {setup2faLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
                  Configurer la 2FA
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 flex gap-3">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-emerald-700">
                    <p className="font-semibold">2FA active via {myTwoFa.method === "email" ? "email OTP" : "TOTP (Authenticator app)"}</p>
                    <p className="mt-0.5">Ton compte est protégé. Un code est requis à chaque connexion.</p>
                  </div>
                </div>
                <div className="border border-red-200 rounded-xl p-4 space-y-3">
                  <p className="text-xs font-semibold text-red-700">Désactiver la 2FA</p>
                  <p className="text-xs text-gray-500">Entre un code valide de ton application pour confirmer la désactivation.</p>
                  <div className="flex gap-2">
                    <input type="text" inputMode="numeric" maxLength={6} placeholder="Code TOTP"
                      value={disableCode} onChange={e => setDisableCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      className="flex-1 text-center font-mono border border-gray-200 rounded-lg py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300" />
                    <button onClick={handleDisable2fa} disabled={disableLoading || disableCode.length < 6}
                      className="px-4 py-2 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50">
                      {disableLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Désactiver"}
                    </button>
                  </div>
                  {disableError && <p className="text-xs text-red-600">{disableError}</p>}
                </div>
              </div>
            )}
          </div>

          {/* All users 2FA status */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gray-800">État 2FA — tous les utilisateurs</h3>
              <span className="text-xs text-gray-400">{twoFaEnabled}/{twoFaStatus.length} protégés</span>
            </div>

            {/* Progress bar */}
            <div className="mb-5">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Couverture 2FA</span>
                <span className="font-bold">{twoFaStatus.length ? Math.round(twoFaEnabled / twoFaStatus.length * 100) : 0}%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-violet-500 rounded-full transition-all"
                  style={{ width: `${twoFaStatus.length ? (twoFaEnabled / twoFaStatus.length) * 100 : 0}%` }} />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold text-gray-400 border-b border-gray-100">
                    <th className="pb-2 pr-4">Utilisateur</th>
                    <th className="pb-2 pr-4">Rôle</th>
                    <th className="pb-2 pr-4">2FA</th>
                    <th className="pb-2">Méthode</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {twoFaStatus.map(u => (
                    <tr key={u.id} className="hover:bg-gray-50/50">
                      <td className="py-2.5 pr-4">
                        <p className="font-semibold text-gray-800 text-xs">{u.name}</p>
                        <p className="text-gray-400 text-xs">{u.email}</p>
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${ROLE_COLOR[u.role] ?? "bg-gray-100 text-gray-600"}`}>{ROLE_FR[u.role] ?? u.role}</span>
                      </td>
                      <td className="py-2.5 pr-4">
                        {u.twoFactorEnabled
                          ? <span className="flex items-center gap-1 text-xs text-emerald-600 font-bold"><ShieldCheck className="w-3.5 h-3.5" /> Activée</span>
                          : <span className="flex items-center gap-1 text-xs text-gray-400"><ShieldAlert className="w-3.5 h-3.5" /> Désactivée</span>}
                      </td>
                      <td className="py-2.5 text-xs text-gray-500">
                        {u.twoFactorEnabled
                          ? (u.twoFactorMethod === "email"
                            ? <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5 text-blue-400" /> Email OTP</span>
                            : <span className="flex items-center gap-1"><Smartphone className="w-3.5 h-3.5 text-violet-400" /> Authenticator</span>)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══ TAB: BACKUPS ══ */}
      {activeTab === "backups" && (
        <div className="space-y-5">

          {/* Access restriction banner */}
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 flex items-center gap-3">
            <Shield className="w-4 h-4 text-indigo-600 flex-shrink-0" />
            <p className="text-xs text-indigo-700 font-semibold">
              Accès réservé — DSI &amp; Super Admin uniquement. Les backups sont au format ZIP et contiennent un dump SQL complet + métadonnées.
            </p>
          </div>

          {/* Create backup panel */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                <Database className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-800">Créer un backup</h3>
                <p className="text-xs text-gray-500">Dump PostgreSQL complet → fichier <span className="font-mono bg-gray-100 px-1 rounded">.zip</span> dans /backups/</p>
              </div>
              <button onClick={handleCreateBackup} disabled={backupCreating}
                className="ml-auto flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {backupCreating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {backupCreating ? "Création…" : "Nouveau backup"}
              </button>
            </div>
            {backupMsg && (
              <div className={`rounded-xl px-4 py-2.5 text-xs font-semibold ${backupMsg.startsWith("✅") ? "bg-emerald-50 border border-emerald-200 text-emerald-700" : "bg-red-50 border border-red-200 text-red-700"}`}>
                {backupMsg}
              </div>
            )}
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex gap-2 mt-4">
              <Info className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">Le ZIP contient le dump SQL + un fichier <span className="font-mono">metadata.json</span>. Pour la production, prévoir un stockage externe sécurisé (S3, SFTP) avec des sauvegardes automatiques via cron.</p>
            </div>
          </div>

          {/* Upload / Restore panel */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center">
                <Upload className="w-5 h-5 text-violet-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-800">Importer un backup ZIP</h3>
                <p className="text-xs text-gray-500">Glisse-dépose ou sélectionne un fichier <span className="font-mono bg-gray-100 px-1 rounded">.zip</span> contenant un dump SQL</p>
              </div>
            </div>

            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleFileDrop}
              onClick={() => uploadInputRef.current?.click()}
              className={`cursor-pointer border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-3 transition-colors ${
                dragOver
                  ? "border-violet-400 bg-violet-50"
                  : "border-gray-200 hover:border-violet-300 hover:bg-violet-50/30"
              }`}
            >
              <input
                ref={uploadInputRef}
                type="file"
                accept=".zip,application/zip"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) { handleUploadBackup(f); e.target.value = ""; } }}
              />
              {uploadingBackup ? (
                <RefreshCw className="w-8 h-8 text-violet-400 animate-spin" />
              ) : (
                <FileArchive className={`w-10 h-10 ${dragOver ? "text-violet-500" : "text-gray-300"}`} />
              )}
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-600">
                  {uploadingBackup ? "Import en cours…" : "Glisse un fichier ZIP ici"}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">ou clique pour parcourir · max 200 MB</p>
              </div>
            </div>

            {uploadMsg && (
              <div className={`mt-3 rounded-xl px-4 py-2.5 text-xs font-semibold ${uploadMsg.startsWith("✅") ? "bg-emerald-50 border border-emerald-200 text-emerald-700" : "bg-red-50 border border-red-200 text-red-700"}`}>
                {uploadMsg}
              </div>
            )}

            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex gap-2 mt-4">
              <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700">L'import vérifie que le ZIP contient un fichier <span className="font-mono">.sql</span> valide et l'enregistre dans /backups/. La restauration effective se fait via <span className="font-mono">psql</span> en ligne de commande.</p>
            </div>
          </div>

          {/* Backup list */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gray-800">Backups disponibles</h3>
              <span className="text-xs text-gray-400">{backups.length} fichier{backups.length > 1 ? "s" : ""}</span>
            </div>
            {backups.length === 0 ? (
              <div className="text-center py-10 text-gray-400">
                <FileArchive className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Aucun backup disponible</p>
                <p className="text-xs mt-1">Crée ton premier backup ou importe un ZIP existant</p>
              </div>
            ) : (
              <div className="space-y-2">
                {backups.map(b => (
                  <div key={b.filename} className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <FileArchive className="w-4 h-4 text-blue-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-800 truncate">{b.filename}</p>
                        <p className="text-xs text-gray-400 flex items-center gap-1.5">
                          <HardDrive className="w-3 h-3" />{fmtSize(b.size)}
                          <span className="text-gray-300">·</span>
                          <Clock className="w-3 h-3" />{fmtDate(b.createdAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2 flex-shrink-0 ml-3">
                      <a href={`/api/admin/backup/download/${encodeURIComponent(b.filename)}`}
                        download={b.filename}
                        className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors">
                        <Download className="w-3.5 h-3.5" /> ZIP
                      </a>
                      <button onClick={() => handleDeleteBackup(b.filename)} disabled={deletingFile === b.filename}
                        className="flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-600 border border-red-100 text-xs font-semibold rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors">
                        {deletingFile === b.filename ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
