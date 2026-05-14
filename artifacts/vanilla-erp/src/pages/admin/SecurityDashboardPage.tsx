import { useQuery, useQueryClient } from "@tanstack/react-query";
import SecurityDashboard from "./SecurityDashboard";

async function fetchSecurity() {
  const r = await fetch("/api/admin/security", { credentials: "include" });
  if (!r.ok) throw new Error(r.status === 403 ? "403" : "Erreur serveur");
  return r.json();
}

export default function SecurityDashboardPage() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-security"],
    queryFn: fetchSecurity,
    refetchInterval: 30_000,
  });

  const handleUnlock = async (userId: string) => {
    await fetch(`/api/admin/security/unlock/${userId}`, { method: "POST", credentials: "include" });
    await qc.invalidateQueries({ queryKey: ["admin-security"] });
  };

  const handleRevokeSession = async (userId: string) => {
    await fetch(`/api/admin/security/sessions/${userId}`, { method: "DELETE", credentials: "include" });
    await qc.invalidateQueries({ queryKey: ["admin-security"] });
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
      <SecurityDashboard data={data} onUnlock={handleUnlock} onRevokeSession={handleRevokeSession} />
    </div>
  );
}
