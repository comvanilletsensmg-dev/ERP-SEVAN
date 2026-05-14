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
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <p className="text-red-700 font-semibold text-sm">Accès restreint</p>
          <p className="text-red-500 text-xs mt-1">Ce module est réservé aux administrateurs (SUPER_ADMIN, ADMIN, DG, DGA).</p>
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
