import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, TrendingUp, ShoppingCart, Users, Warehouse, ArrowRight } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface LogisticsData {
  totalStockKg: number;
  totalSalesUsd: number;
  totalPurchasesMga: number;
  activeLotsCount: number;
  suppliersCount: number;
  clientsCount: number;
  lotStatusBreakdown: { status: string; count: number; totalKg: number }[];
  recentMovements: { id: string; type: string; lotId: string | null; weightKg: number; reason: string | null; createdAt: string }[];
}

const LOT_COLORS: Record<string, string> = { curing: "#f59e0b", drying: "#f97316", ready: "#22c55e", sold: "#94a3b8" };
const LOT_FR: Record<string, string> = { curing: "Maturation", drying: "Séchage", ready: "Prêt", sold: "Vendu" };
const MOV_FR: Record<string, { label: string; color: string }> = { IN: { label: "Entrée", color: "text-green-600" }, OUT: { label: "Sortie", color: "text-red-600" }, LOSS: { label: "Perte", color: "text-amber-600" } };

function KPICard({ title, value, sub, Icon }: { title: string; value: string; sub?: string; Icon: any }) {
  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</CardTitle>
        <div className="p-1.5 rounded-lg bg-primary/10"><Icon className="w-4 h-4 text-primary" /></div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold font-serif">{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default function LogisticsDashboard({ data }: { data: LogisticsData }) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-serif text-primary tracking-tight">Tableau de bord — Logistique</h2>
        <p className="text-muted-foreground mt-1">Gestion du stock vanille et des flux d'exportation</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard title="Stock actif" value={`${data.totalStockKg.toLocaleString()} kg`} sub={`${data.activeLotsCount} lots`} Icon={Package} />
        <KPICard title="Chiffre d'affaires" value={`$${data.totalSalesUsd.toLocaleString()}`} sub="ventes USD" Icon={TrendingUp} />
        <KPICard title="Achats total" value={`${(data.totalPurchasesMga / 1_000_000).toFixed(1)} M MGA`} sub={`${data.suppliersCount} fournisseurs`} Icon={ShoppingCart} />
        <KPICard title="Clients" value={`${data.clientsCount}`} sub="actifs" Icon={Users} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Répartition des lots</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={data.lotStatusBreakdown} dataKey="totalKg" nameKey="status" cx="50%" cy="50%" outerRadius={80} label={({ status }) => LOT_FR[status] ?? status}>
                  {data.lotStatusBreakdown.map(entry => <Cell key={entry.status} fill={LOT_COLORS[entry.status] ?? "#64748b"} />)}
                </Pie>
                <Tooltip formatter={(v: number) => `${v.toLocaleString()} kg`} />
                <Legend formatter={v => LOT_FR[v] ?? v} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm font-medium flex items-center gap-2"><Warehouse className="w-4 h-4" />Derniers mouvements de stock</CardTitle></CardHeader>
          <CardContent>
            {data.recentMovements.length === 0 ? (
              <p className="text-muted-foreground text-sm">Aucun mouvement récent</p>
            ) : (
              <div className="space-y-2">
                {data.recentMovements.map(m => {
                  const mv = MOV_FR[m.type] ?? { label: m.type, color: "text-gray-600" };
                  return (
                    <div key={m.id} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0">
                      <div className="flex items-center gap-2">
                        <ArrowRight className={`w-3 h-3 ${mv.color}`} />
                        <span className={`font-medium ${mv.color}`}>{mv.label}</span>
                        <span className="text-muted-foreground text-xs">{m.reason ?? "—"}</span>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">{m.weightKg.toLocaleString()} kg</div>
                        <div className="text-xs text-muted-foreground">{format(new Date(m.createdAt), "dd MMM", { locale: fr })}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
