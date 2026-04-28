import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import SuperAdminDashboard from "./dashboard/SuperAdminDashboard";
import AccountingDashboard from "./dashboard/AccountingDashboard";
import LogisticsDashboard from "./dashboard/LogisticsDashboard";
import HRDashboard from "./dashboard/HRDashboard";

async function fetchRoleDashboard() {
  const r = await fetch("/api/dashboard/me", { credentials: "include" });
  if (!r.ok) throw new Error("Erreur chargement dashboard");
  return r.json();
}

export default function Dashboard() {
  const { user } = useAuth();
  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard-me", user?.role],
    queryFn: fetchRoleDashboard,
    enabled: !!user,
  });

  if (isLoading) {
    return (
      <div className="p-8 flex items-center gap-3 text-muted-foreground">
        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        Chargement du tableau de bord…
      </div>
    );
  }

  if (error || !data) {
    return <div className="p-8 text-destructive">Impossible de charger le tableau de bord.</div>;
  }

  const role = user?.role;

  return (
    <div className="p-8">
      {role === "SUPER_ADMIN" && <SuperAdminDashboard data={data} />}
      {role === "ACCOUNTANT" && <AccountingDashboard data={data} />}
      {role === "LOGISTICS_MANAGER" && <LogisticsDashboard data={data} />}
      {role === "HR_MANAGER" && <HRDashboard data={data} />}
    </div>
  );
}
