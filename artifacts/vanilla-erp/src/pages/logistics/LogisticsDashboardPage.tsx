import { useQuery } from "@tanstack/react-query";
import LogisticsDashboard from "@/pages/dashboard/LogisticsDashboard";

async function fetchLogisticsData() {
  const r = await fetch("/api/dashboard/logistics", { credentials: "include" });
  if (!r.ok) throw new Error("Erreur chargement dashboard logistique");
  return r.json();
}

export default function LogisticsDashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard-logistics"],
    queryFn: fetchLogisticsData,
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="p-8 flex items-center gap-3 text-muted-foreground">
        <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        Chargement du tableau logistique…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 text-destructive text-sm">
        Impossible de charger le tableau de bord logistique.
      </div>
    );
  }

  return (
    <div className="p-8">
      <LogisticsDashboard data={data} />
    </div>
  );
}
