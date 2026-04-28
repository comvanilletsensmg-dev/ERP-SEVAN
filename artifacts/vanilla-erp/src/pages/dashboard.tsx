import { 
  useGetDashboardSummary, getGetDashboardSummaryQueryKey,
  useGetRecentActivity, getGetRecentActivityQueryKey,
  useGetLotStatusBreakdown, getGetLotStatusBreakdownQueryKey
} from "@workspace/api-client-react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, TrendingUp, ShoppingCart, Users, Activity, BarChart2 } from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend
} from "recharts";

export default function Dashboard() {
  const { data: summary, isLoading: isSummaryLoading } = useGetDashboardSummary({
    query: { queryKey: getGetDashboardSummaryQueryKey() },
  });
  
  const { data: activity, isLoading: isActivityLoading } = useGetRecentActivity({
    query: { queryKey: getGetRecentActivityQueryKey() },
  });
  
  const { data: breakdown, isLoading: isBreakdownLoading } = useGetLotStatusBreakdown({
    query: { queryKey: getGetLotStatusBreakdownQueryKey() },
  });

  const isLoading = isSummaryLoading || isActivityLoading || isBreakdownLoading;

  if (isLoading) return <div className="p-8">Loading dashboard...</div>;
  if (!summary) return null;

  const COLORS = {
    curing: "hsl(35, 91%, 54%)", // amber
    drying: "hsl(24, 95%, 53%)", // orange
    ready: "hsl(142, 71%, 45%)", // green
    sold: "hsl(220, 14%, 71%)", // muted
  };

  return (
    <div className="p-8 space-y-8">
      <div>
        <h2 className="text-3xl font-serif text-primary tracking-tight">Overview</h2>
        <p className="text-muted-foreground mt-1">Real-time operational metrics</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Stock</CardTitle>
            <Package className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-serif">{summary.totalStockKg.toLocaleString()} kg</div>
            <p className="text-xs text-muted-foreground mt-1">{summary.activeLotsCount} active lots in inventory</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Sales</CardTitle>
            <TrendingUp className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-serif">${summary.totalSalesUsd.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">Export contracts value</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Purchases (MGA)</CardTitle>
            <ShoppingCart className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-serif">Ar {summary.totalPurchasesMga.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">Sourced from collectors</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Network</CardTitle>
            <Users className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-serif">{summary.suppliersCount} <span className="text-xl">Suppliers</span></div>
            <p className="text-xs text-muted-foreground mt-1">{summary.clientsCount} International Clients</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-2 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Activity className="w-5 h-5 text-primary" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {activity?.map((item) => (
                <div key={item.id} className="flex items-start gap-4 pb-4 border-b border-border/50 last:border-0 last:pb-0">
                  <div className="mt-0.5">
                    {item.type === "purchase" && <ShoppingCart className="w-4 h-4 text-muted-foreground" />}
                    {item.type === "lot" && <Package className="w-4 h-4 text-primary" />}
                    {item.type === "sale" && <TrendingUp className="w-4 h-4 text-green-600" />}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-foreground">{item.description}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {format(new Date(item.createdAt), "MMM d, h:mm a")}
                    </p>
                  </div>
                  {item.amount && (
                    <div className="text-sm font-medium text-right whitespace-nowrap">
                      {item.currency === 'USD' ? '$' : item.currency === 'EUR' ? '€' : 'Ar '}
                      {item.amount.toLocaleString()}
                    </div>
                  )}
                </div>
              ))}
              {activity?.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No recent activity.</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <BarChart2 className="w-5 h-5 text-primary" />
              Lot Status Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            {breakdown && breakdown.length > 0 ? (
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={breakdown}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="totalKg"
                      nameKey="status"
                    >
                      {breakdown.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[entry.status as keyof typeof COLORS] || COLORS.ready} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value: number) => [`${value} kg`, 'Total Weight']}
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                    <Legend className="capitalize" formatter={(value) => <span className="capitalize ml-1">{value}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">
                No active lots to display.
              </div>
            )}
            
            <div className="mt-4 space-y-2">
              {breakdown?.map(item => (
                <div key={item.status} className="flex justify-between items-center text-sm">
                  <span className="capitalize flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[item.status as keyof typeof COLORS] || COLORS.ready }}></span>
                    {item.status}
                  </span>
                  <span className="font-medium">{item.totalKg.toLocaleString()} kg <span className="text-muted-foreground font-normal text-xs ml-1">({item.count} lots)</span></span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
