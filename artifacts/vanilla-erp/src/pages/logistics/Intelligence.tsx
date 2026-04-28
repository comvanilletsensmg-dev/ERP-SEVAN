import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp, TrendingDown, AlertTriangle, Zap, BarChart2,
  Plus, Trash2, RefreshCw, Cpu
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, Tooltip, Legend, ReferenceLine, Cell
} from "recharts";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const API = "/api";
async function apiJson(path: string, opts?: RequestInit) {
  const r = await fetch(`${API}${path}`, { credentials: "include", headers: { "Content-Type": "application/json" }, ...opts });
  if (!r.ok) throw new Error((await r.json()).error ?? r.statusText);
  return r.json();
}

interface DashboardData {
  avgCostPerKg: number;
  predictedPrice: number;
  currentPrice: number;
  marginEstimate: number;
  marginPercent: number;
  alert: "drop" | "opportunity" | null;
  trend7d: number;
  dataPoints: number;
  priceHistoryChart: { date: string; price: number; market: string }[];
  costVsPrice: { lot: string; cost: number; price: number; margin: number }[];
  lotCosts: { lotId: string; code: string; costPerKg: number; totalCost: number; updatedAt: string }[];
}

interface PredictionData {
  current: { predicted: number; movingAvg: number; trend: number; confidence: string } | null;
  currentPrice: number;
  trend7dPct: number;
  alert: string | null;
  dataPoints: number;
}

function KPICard({ title, value, sub, Icon, accent, alert }: { title: string; value: string; sub?: string; Icon: any; accent?: string; alert?: boolean }) {
  return (
    <Card className={`shadow-sm ${alert ? "border-amber-300 bg-amber-50/50" : ""}`}>
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

export default function LogisticsIntelligence() {
  const qc = useQueryClient();

  const { data: dash, isLoading } = useQuery<DashboardData>({
    queryKey: ["logistics-dashboard"],
    queryFn: () => apiJson("/logistics/dashboard"),
    refetchInterval: 60_000,
  });

  const { data: pred } = useQuery<PredictionData>({
    queryKey: ["ai-prediction"],
    queryFn: () => apiJson("/ai/prediction"),
  });

  const { data: history = [] } = useQuery<{ id: string; date: string; price: number; market: string; notes: string | null }[]>({
    queryKey: ["price-history"],
    queryFn: () => apiJson("/ai/price-history"),
  });

  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), price: "", market: "export", notes: "" });
  const [formErr, setFormErr] = useState("");

  const addHistory = useMutation({
    mutationFn: (d: any) => apiJson("/ai/price-history", { method: "POST", body: JSON.stringify(d) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["price-history"] }); qc.invalidateQueries({ queryKey: ["logistics-dashboard"] }); qc.invalidateQueries({ queryKey: ["ai-prediction"] }); setForm(f => ({ ...f, price: "", notes: "" })); setFormErr(""); },
    onError: (e: any) => setFormErr(e.message),
  });

  const deleteHistory = useMutation({
    mutationFn: (id: string) => apiJson(`/ai/price-history/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["price-history"] }); qc.invalidateQueries({ queryKey: ["logistics-dashboard"] }); },
  });

  const runPrediction = useMutation({
    mutationFn: () => apiJson("/ai/predict", { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ai-prediction"] }); qc.invalidateQueries({ queryKey: ["logistics-dashboard"] }); },
  });

  const alertBanner = dash?.alert ?? pred?.alert;
  const confidence = pred?.current?.confidence ?? "low";
  const CONFIDENCE_COLORS: Record<string, string> = { high: "bg-green-100 text-green-800", medium: "bg-amber-100 text-amber-700", low: "bg-gray-100 text-gray-600" };

  if (isLoading) return <div className="p-8 flex items-center gap-3 text-muted-foreground"><div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />Chargement…</div>;

  return (
    <div className="p-8 space-y-8 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-serif text-primary tracking-tight flex items-center gap-3">
            <Cpu className="w-7 h-7" /> Intelligence Logistique
          </h2>
          <p className="text-muted-foreground mt-1">Prévision des prix vanille · Analyse des coûts · Alertes marché</p>
        </div>
        <Button onClick={() => runPrediction.mutate()} variant="outline" className="gap-2" disabled={runPrediction.isPending}>
          <RefreshCw className={`w-4 h-4 ${runPrediction.isPending ? "animate-spin" : ""}`} />
          Recalculer prévision
        </Button>
      </div>

      {/* Alert banner */}
      {alertBanner && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${alertBanner === "opportunity" ? "bg-green-50 border-green-200 text-green-800" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
          {alertBanner === "opportunity" ? <Zap className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
          <div>
            <span className="font-semibold">{alertBanner === "opportunity" ? "Opportunité de marché" : "Alerte baisse de prix"}</span>
            <span className="ml-2 text-sm">
              {alertBanner === "opportunity"
                ? `Le prix prévu (+${Math.round(((dash?.predictedPrice ?? 0) / Math.max(1, dash?.currentPrice ?? 1) - 1) * 100)}%) dépasse le prix actuel — moment favorable pour vendre.`
                : `Le prix prévu est inférieur de plus de 10% au prix actuel — surveiller le marché.`}
            </span>
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard title="Prix actuel" value={dash?.currentPrice ? `${dash.currentPrice.toLocaleString()} MGA/kg` : "—"} sub={`${dash?.dataPoints ?? 0} données historiques`} Icon={BarChart2} />
        <KPICard
          title="Prix prévisionnel (J+30)"
          value={dash?.predictedPrice ? `${dash.predictedPrice.toLocaleString()} MGA/kg` : "—"}
          sub={`Confiance ${confidence === "high" ? "élevée" : confidence === "medium" ? "moyenne" : "faible"} (${pred?.dataPoints ?? dash?.dataPoints ?? 0} pts)`}
          Icon={dash && dash.predictedPrice > dash.currentPrice ? TrendingUp : TrendingDown}
          accent={dash && dash.predictedPrice > dash.currentPrice ? "bg-green-100" : "bg-red-100"}
        />
        <KPICard title="Coût moyen / kg" value={dash?.avgCostPerKg ? `${dash.avgCostPerKg.toLocaleString()} MGA/kg` : "—"} sub={`${dash?.lotCosts?.length ?? 0} lots chiffrés`} Icon={BarChart2} />
        <KPICard
          title="Marge estimée"
          value={dash?.marginEstimate ? `${dash.marginEstimate.toLocaleString()} MGA/kg` : "—"}
          sub={dash?.marginPercent ? `${dash.marginPercent}% du prix de vente` : "Aucun coût enregistré"}
          Icon={dash && dash.marginEstimate >= 0 ? TrendingUp : TrendingDown}
          accent={dash && dash.marginEstimate >= 0 ? "bg-green-100" : "bg-red-100"}
          alert={dash ? dash.marginEstimate < 0 : false}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Price history line chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="w-4 h-4" /> Évolution du prix vanille (MGA/kg)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!dash?.priceHistoryChart?.length ? (
              <p className="text-muted-foreground text-sm py-8 text-center">Ajoutez des données historiques pour afficher le graphique</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={dash.priceHistoryChart} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => `${v.toLocaleString()} MGA/kg`} labelFormatter={l => format(new Date(l), "d MMM yyyy", { locale: fr })} />
                  <Line type="monotone" dataKey="price" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Prix" />
                  {dash.predictedPrice > 0 && <ReferenceLine y={dash.predictedPrice} stroke="#22c55e" strokeDasharray="4 2" label={{ value: "Prévision", position: "right", fontSize: 10, fill: "#22c55e" }} />}
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Cost vs price bar chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart2 className="w-4 h-4" /> Coût vs Prix par lot (MGA/kg)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!dash?.costVsPrice?.length ? (
              <p className="text-muted-foreground text-sm py-8 text-center">Calculez les coûts des lots pour afficher ce graphique</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={dash.costVsPrice} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="lot" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => `${v.toLocaleString()} MGA/kg`} />
                  <Legend />
                  <Bar dataKey="cost" name="Coût" fill="#f97316" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="price" name="Prix actuel" fill="#22c55e" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Price history CRUD */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium flex items-center gap-2"><Plus className="w-4 h-4" />Ajouter un prix historique</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {formErr && <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">{formErr}</p>}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Date *</label>
                <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Prix (MGA/kg) *</label>
                <Input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="65000" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Marché</label>
                <Select value={form.market} onValueChange={v => setForm(f => ({ ...f, market: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="export">Export</SelectItem>
                    <SelectItem value="local">Local</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Notes</label>
                <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optionnel" />
              </div>
            </div>
            <Button
              className="w-full"
              onClick={() => addHistory.mutate({ date: form.date, price: Number(form.price), market: form.market, notes: form.notes || null })}
              disabled={!form.price || addHistory.isPending}
            >
              {addHistory.isPending ? "Ajout…" : "Ajouter le prix"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Historique récent ({history.length} entrées)</CardTitle></CardHeader>
          <CardContent>
            <div className="max-h-64 overflow-y-auto space-y-1">
              {history.length === 0 ? (
                <p className="text-muted-foreground text-sm">Aucune donnée historique</p>
              ) : history.slice(0, 20).map(h => (
                <div key={h.id} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0">
                  <div>
                    <span className="font-medium">{format(new Date(h.date), "dd MMM yyyy", { locale: fr })}</span>
                    <Badge variant="outline" className="ml-2 text-xs">{h.market}</Badge>
                    {h.notes && <span className="ml-2 text-muted-foreground text-xs">{h.notes}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{h.price.toLocaleString()} MGA</span>
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive h-6 w-6 p-0" onClick={() => deleteHistory.mutate(h.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lot costs table */}
      {dash?.lotCosts && dash.lotCosts.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Coûts par lot (derniers calculés)</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Lot</th>
                    <th className="pb-2 pr-4 font-medium">Statut</th>
                    <th className="pb-2 pr-4 font-medium">Coût total</th>
                    <th className="pb-2 pr-4 font-medium">Coût/kg</th>
                    <th className="pb-2 pr-4 font-medium">Marge/kg</th>
                    <th className="pb-2 font-medium">Mise à jour</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {dash.lotCosts.map(l => {
                    const margin = dash.currentPrice > 0 ? dash.currentPrice - l.costPerKg : 0;
                    return (
                      <tr key={l.lotId} className="hover:bg-muted/30">
                        <td className="py-2 pr-4 font-mono text-xs font-medium">{l.code}</td>
                        <td className="py-2 pr-4">
                          <Badge variant="outline" className="text-xs">{(l as any).status ?? "—"}</Badge>
                        </td>
                        <td className="py-2 pr-4">{l.totalCost.toLocaleString()} MGA</td>
                        <td className="py-2 pr-4 font-medium">{Math.round(l.costPerKg).toLocaleString()} MGA</td>
                        <td className={`py-2 pr-4 font-medium ${margin >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {margin >= 0 ? "+" : ""}{Math.round(margin).toLocaleString()} MGA
                        </td>
                        <td className="py-2 text-muted-foreground text-xs">{format(new Date(l.updatedAt), "dd MMM", { locale: fr })}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
