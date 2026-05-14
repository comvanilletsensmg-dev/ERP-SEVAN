import { useQuery } from "@tanstack/react-query";
import AdminExecutiveDashboard from "./ExecutiveDashboard";

async function fetchAdminExecutive() {
  const r = await fetch("/api/admin/executive", { credentials: "include" });
  if (!r.ok) throw new Error("Accès refusé ou erreur serveur");
  return r.json();
}

export default function ExecutiveDashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-executive"],
    queryFn: fetchAdminExecutive,
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="p-8 flex items-center gap-3 text-muted-foreground">
        <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        Chargement du centre de gouvernance…
      </div>
    );
  }

  if (error || !data) {
    const msg = error instanceof Error ? error.message : "Erreur inattendue";
    const isForbidden = msg.includes("403") || msg.includes("refus");
    return (
      <div className="p-8">
        <div className={`border rounded-xl p-6 text-center ${isForbidden ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"}`}>
          <p className={`font-semibold text-sm ${isForbidden ? "text-red-700" : "text-amber-700"}`}>
            {isForbidden ? "Accès restreint" : "Erreur de chargement"}
          </p>
          <p className={`text-xs mt-1 ${isForbidden ? "text-red-500" : "text-amber-600"}`}>
            {isForbidden
              ? "Ce module est réservé aux administrateurs (SUPER_ADMIN, ADMIN, DG, DGA)."
              : `Impossible de charger les données : ${msg}`}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <AdminExecutiveDashboard data={data} />
    </div>
  );
}
