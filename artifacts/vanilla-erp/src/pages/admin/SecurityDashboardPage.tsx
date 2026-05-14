import { useQuery, useQueryClient } from "@tanstack/react-query";
import SecurityDashboard from "./SecurityDashboard";

async function fetchSecurity() {
  const r = await fetch("/api/admin/security", { credentials: "include" });
  if (!r.ok) throw new Error(r.status === 403 ? "403" : "Erreur serveur");
  return r.json();
}

async function fetchTwoFaStatus() {
  const r = await fetch("/api/admin/security/2fa-status", { credentials: "include" });
  if (!r.ok) return [];
  return r.json();
}

async function fetchBackups() {
  const r = await fetch("/api/admin/backup/list", { credentials: "include" });
  if (!r.ok) return [];
  return r.json();
}

async function fetchMyTwoFa() {
  const r = await fetch("/api/auth/2fa/status", { credentials: "include" });
  if (!r.ok) return { enabled: false, method: null };
  return r.json();
}

export default function SecurityDashboardPage() {
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-security"],
    queryFn: fetchSecurity,
    refetchInterval: 30_000,
  });

  const { data: twoFaStatus = [] } = useQuery({
    queryKey: ["admin-security-2fa"],
    queryFn: fetchTwoFaStatus,
  });

  const { data: backups = [], refetch: refetchBackups } = useQuery({
    queryKey: ["admin-backups"],
    queryFn: fetchBackups,
  });

  const { data: myTwoFa = { enabled: false, method: null }, refetch: refetchMyTwoFa } = useQuery({
    queryKey: ["my-2fa-status"],
    queryFn: fetchMyTwoFa,
  });

  const handleUnlock = async (userId: string) => {
    await fetch(`/api/admin/security/unlock/${userId}`, { method: "POST", credentials: "include" });
    await qc.invalidateQueries({ queryKey: ["admin-security"] });
  };

  const handleRevokeSession = async (userId: string) => {
    await fetch(`/api/admin/security/sessions/${userId}`, { method: "DELETE", credentials: "include" });
    await qc.invalidateQueries({ queryKey: ["admin-security"] });
  };

  const handleSetup2fa = async (): Promise<{ secret: string; qrCode: string } | null> => {
    const r = await fetch("/api/auth/2fa/setup", { method: "POST", credentials: "include" });
    if (!r.ok) return null;
    return r.json();
  };

  const handleEnable2fa = async (code: string): Promise<boolean> => {
    const r = await fetch("/api/auth/2fa/enable", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    if (r.ok) { await refetchMyTwoFa(); await qc.invalidateQueries({ queryKey: ["admin-security-2fa"] }); }
    return r.ok;
  };

  const handleDisable2fa = async (code: string): Promise<boolean> => {
    const r = await fetch("/api/auth/2fa/disable", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    if (r.ok) { await refetchMyTwoFa(); await qc.invalidateQueries({ queryKey: ["admin-security-2fa"] }); }
    return r.ok;
  };

  const handleCreateBackup = async (): Promise<{ success: boolean; filename?: string; error?: string }> => {
    const r = await fetch("/api/admin/backup/create", { method: "POST", credentials: "include" });
    const json = await r.json();
    await refetchBackups();
    return json;
  };

  const handleDeleteBackup = async (filename: string) => {
    await fetch(`/api/admin/backup/${encodeURIComponent(filename)}`, { method: "DELETE", credentials: "include" });
    await refetchBackups();
  };

  if (isLoading) {
    return (
      <div className="p-8 flex items-center gap-3 text-muted-foreground">
        <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        Chargement du Security Center…
      </div>
    );
  }

  if (error || !data) {
    const isForbidden = error instanceof Error && error.message.includes("403");
    return (
      <div className="p-8">
        <div className={`border rounded-xl p-6 text-center ${isForbidden ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"}`}>
          <p className={`font-semibold text-sm ${isForbidden ? "text-red-700" : "text-amber-700"}`}>
            {isForbidden ? "Accès restreint" : "Erreur de chargement"}
          </p>
          <p className={`text-xs mt-1 ${isForbidden ? "text-red-500" : "text-amber-600"}`}>
            {isForbidden ? "Ce module est réservé aux administrateurs." : "Impossible de charger les données de sécurité."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <SecurityDashboard
        data={data}
        twoFaStatus={twoFaStatus}
        backups={backups}
        myTwoFa={myTwoFa}
        onUnlock={handleUnlock}
        onRevokeSession={handleRevokeSession}
        onSetup2fa={handleSetup2fa}
        onEnable2fa={handleEnable2fa}
        onDisable2fa={handleDisable2fa}
        onCreateBackup={handleCreateBackup}
        onDeleteBackup={handleDeleteBackup}
      />
    </div>
  );
}
