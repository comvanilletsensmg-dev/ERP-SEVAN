import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, TrendingUp, Users, Banknote, Warehouse, BarChart2, UserCheck, Clock } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis } from "recharts";

interface SuperAdminData {
  logistics: { totalStockKg: number; totalSalesUsd: number; totalPurchasesMga: number; activeLotsCount: number; suppliersCount: number; clientsCount: number; lotStatusBreakdown: { status: string; count: number; totalKg: number }[] };
  hr: { totalEmployees: number; activeEmployees: number; absentToday: number; pendingLeaves: number; pendingRequests: number; totalSalariesMga: number };
  accounting: { revenue: number; charges: number; resultat: number; bankBalance: number; pendingInvoices: number };
}

const LOT_COLORS: Record<string, string> = { curing: "#f59e0b", drying: "#f97316", ready: "#22c55e", sold: "#94a3b8" };
const LOT_FR: Record<string, string> = { curing: "Maturation", drying: "Séchage", ready: "Prêt", sold: "Vendu" };

function KPICard({ title, value, sub, Icon, accent }: { title: string; value: string; sub?: string; Icon: any; accent?: string }) {
  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</CardTitle>
        <div className={`p-1.5 rounded-lg ${accent ?? "bg-primary/10"}`}><Icon className="w-4 h-4 text-primary" /></div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold font-serif">{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default function SuperAdminDashboard({ data }: { data: SuperAdminData }) {
  const { logistics: l, hr, accounting: a } = data;
  const barData = [
    { name: "Revenus", value: a.revenue / 1_000_000 },
    { name: "Charges", value: a.charges / 1_000_000 },
    { name: "Résultat", value: a.resultat / 1_000_000 },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-serif text-primary tracking-tight">Vue Globale — Super Admin</h2>
        <p className="text-muted-foreground mt-1">Indicateurs consolidés de toutes les divisions</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard title="Stock actif" value={`${l.totalStockKg.toLocaleString()} kg`} sub={`${l.activeLotsCount} lots en cours`} Icon={Package} />
        <KPICard title="Ventes (USD)" value={`$${l.totalSalesUsd.toLocaleString()}`} sub={`${l.clientsCount} clients`} Icon={TrendingUp} />
        <KPICard title="Employés actifs" value={`${hr.activeEmployees}`} sub={`${hr.absentToday} absents auj.`} Icon={UserCheck} />
        <KPICard title="Trésorerie" value={`${a.bankBalance.toLocaleString()} MGA`} sub={`${a.pendingInvoices} fact. en attente`} Icon={Banknote} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard title="Résultat net" value={`${a.resultat.toLocaleString()} MGA`} sub={`Rev. ${a.revenue.toLocaleString()}`} Icon={BarChart2} />
        <KPICard title="Masse salariale" value={`${hr.totalSalariesMga.toLocaleString()} MGA`} sub="mois courant" Icon={Banknote} />
        <KPICard title="Fournisseurs" value={`${l.suppliersCount}`} sub={`Achats total`} Icon={Warehouse} />
        <KPICard title="Congés en attente" value={`${hr.pendingLeaves}`} sub={`${hr.pendingRequests} demandes RH`} Icon={Clock} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Répartition des lots par statut</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={l.lotStatusBreakdown} dataKey="totalKg" nameKey="status" cx="50%" cy="50%" outerRadius={80} label={({ status }) => LOT_FR[status] ?? status}>
                  {l.lotStatusBreakdown.map(entry => <Cell key={entry.status} fill={LOT_COLORS[entry.status] ?? "#64748b"} />)}
                </Pie>
                <Tooltip formatter={(v: number) => `${v.toLocaleString()} kg`} />
                <Legend formatter={(v) => LOT_FR[v] ?? v} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Résultats financiers (millions MGA)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={barData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => `${v.toFixed(2)} M MGA`} />
                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
