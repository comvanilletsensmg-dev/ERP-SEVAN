import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend, ReferenceLine,
} from "recharts";
import { Brain, AlertTriangle, TrendingUp, RefreshCw, Activity, CloudRain } from "lucide-react";

type RiskPrediction = {
  lotId: string;
  code: string;
  status: string;
  humidityForecast: { day: number; value: number }[];
  humidityConfidence: number;
  lossForecast: number;
  lossConfidence: number;
  riskScore: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  reasons: string[];
  isRainySeason: boolean;
  modelUsed: "ml" | "heuristic" | "blend";
  generatedAt: string;
};

type RiskListResponse = {
  lots: RiskPrediction[];
  summary: {
    total: number; high: number; medium: number;
    pctAtRisk: number; avgLossForecast: number;
    modelTrainedAt: string | null; modelSamples: number;
  };
};

type RiskEvent = {
  id: string; lotId: string; riskLevel: string; score: number; reason: string; createdAt: string;
};

async function fetchRiskLots(): Promise<RiskListResponse> {
  const r = await fetch("/api/ai/risk-lots", { credentials: "include" });
  if (!r.ok) throw new Error("Failed to fetch AI predictions");
  return r.json();
}

async function fetchRiskEvents(): Promise<RiskEvent[]> {
  const r = await fetch("/api/ai/risk-events", { credentials: "include" });
  if (!r.ok) throw new Error("Failed");
  return r.json();
}

async function fetchPredict(lotId: string): Promise<RiskPrediction> {
  const r = await fetch(`/api/ai/predict/${lotId}`, { credentials: "include" });
  if (!r.ok) throw new Error("Failed");
  return r.json();
}

async function recompute() {
  const r = await fetch("/api/ai/recompute", { method: "POST", credentials: "include" });
  if (!r.ok) throw new Error("Recompute failed");
  return r.json();
}

function levelBadge(level: string) {
  if (level === "HIGH") return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">{level}</Badge>;
  if (level === "MEDIUM") return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">{level}</Badge>;
  return <Badge variant="secondary">{level}</Badge>;
}

export default function AIPage() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["ai-risk-lots"], queryFn: fetchRiskLots });
  const { data: events } = useQuery({ queryKey: ["ai-risk-events"], queryFn: fetchRiskEvents });
  const [selectedLot, setSelectedLot] = useState<string | null>(null);

  const recomputeMut = useMutation({
    mutationFn: recompute,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-risk-lots"] });
      qc.invalidateQueries({ queryKey: ["ai-risk-events"] });
    },
  });

  const detail = useQuery({
    queryKey: ["ai-predict", selectedLot],
    queryFn: () => fetchPredict(selectedLot!),
    enabled: !!selectedLot,
  });

  if (isLoading) {
    return <div className="p-6 text-muted-foreground">Chargement des prédictions IA…</div>;
  }
  if (error) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Erreur</AlertTitle>
          <AlertDescription>Impossible de charger les prédictions IA. Accès réservé aux rôles SUPER_ADMIN et LOGISTICS_MANAGER.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const summary = data?.summary;
  const lots = data?.lots ?? [];
  const high = lots.filter((l) => l.riskLevel === "HIGH");
  const medium = lots.filter((l) => l.riskLevel === "MEDIUM");

  const lossChart = lots.slice(0, 12).map((l) => ({
    code: l.code,
    loss: Math.round(l.lossForecast * 10) / 10,
    risk: Math.round(l.riskScore * 100),
  }));

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif font-bold flex items-center gap-3">
            <Brain className="h-8 w-8 text-primary" /> Intelligence Artificielle Vanille
          </h1>
          <p className="text-muted-foreground mt-1">
            Prévisions humidité, pertes, score de risque — modèle :{" "}
            <span className="font-mono">
              {summary?.modelTrainedAt
                ? `RandomForest (entraîné ${new Date(summary.modelTrainedAt).toLocaleDateString()}, ${summary.modelSamples} échantillons)`
                : "heuristique seul (modèle non entraîné — lancez `pnpm --filter @workspace/scripts run train-models`)"}
            </span>
          </p>
        </div>
        <Button
          onClick={() => recomputeMut.mutate()}
          disabled={recomputeMut.isPending}
          data-testid="btn-recompute"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${recomputeMut.isPending ? "animate-spin" : ""}`} />
          Recalculer
        </Button>
      </div>

      {/* Saisonnalité Madagascar */}
      {lots.some((l) => l.isRainySeason) && (
        <Alert>
          <CloudRain className="h-4 w-4" />
          <AlertTitle>Saison humide Madagascar (Nov–Mar)</AlertTitle>
          <AlertDescription>
            Le score de risque intègre un boost saisonnier pour les lots avec humidité &gt; 28%.
          </AlertDescription>
        </Alert>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase">Lots analysés</p>
          <p className="text-3xl font-bold mt-2" data-testid="kpi-total">{summary?.total ?? 0}</p>
        </Card>
        <Card className="p-4 border-red-200 dark:border-red-900/40">
          <p className="text-xs text-muted-foreground uppercase">% à risque</p>
          <p className="text-3xl font-bold mt-2 text-red-700 dark:text-red-400" data-testid="kpi-pct">
            {summary?.pctAtRisk ?? 0}%
          </p>
        </Card>
        <Card className="p-4 border-amber-200 dark:border-amber-900/40">
          <p className="text-xs text-muted-foreground uppercase">Pertes prévues (moy.)</p>
          <p className="text-3xl font-bold mt-2 text-amber-700 dark:text-amber-400" data-testid="kpi-loss">
            {summary?.avgLossForecast ?? 0}%
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase">Événements HIGH (90j)</p>
          <p className="text-3xl font-bold mt-2" data-testid="kpi-events">{events?.length ?? 0}</p>
        </Card>
      </div>

      {/* Alertes intelligentes */}
      {high.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{high.length} lot(s) à risque élevé détecté(s)</AlertTitle>
          <AlertDescription>
            <ul className="list-disc ml-6 mt-2 space-y-1">
              {high.slice(0, 5).map((l) => (
                <li key={l.lotId}>
                  <span className="font-mono">{l.code}</span> — risque {(l.riskScore * 100).toFixed(0)}% —{" "}
                  {l.reasons[0] ?? "Conditions critiques détectées"}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Loss + risk chart */}
      <Card className="p-4">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <TrendingUp className="h-4 w-4" /> Pertes prévues à 7 jours (par lot)
        </h2>
        {lossChart.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun lot à risque.</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={lossChart}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="code" />
              <YAxis yAxisId="left" label={{ value: "% pertes", angle: -90, position: "insideLeft" }} />
              <YAxis yAxisId="right" orientation="right" label={{ value: "% risque", angle: 90, position: "insideRight" }} />
              <Tooltip />
              <Legend />
              <Bar yAxisId="left" dataKey="loss" fill="#f59e0b" name="Pertes prévues %" />
              <Bar yAxisId="right" dataKey="risk" fill="#ef4444" name="Score risque %" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* Detailed table */}
      <Card className="p-4">
        <h2 className="font-semibold mb-3">Lots HIGH + MEDIUM</h2>
        {lots.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Aucun lot à risque détecté. ✓</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Risque IA</TableHead>
                <TableHead>Pertes prévues 7j</TableHead>
                <TableHead>Humidité J+7</TableHead>
                <TableHead>Modèle</TableHead>
                <TableHead>Causes</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lots.map((l) => {
                const j7 = l.humidityForecast[l.humidityForecast.length - 1];
                return (
                  <TableRow key={l.lotId} data-testid={`ai-row-${l.code}`}>
                    <TableCell className="font-mono">{l.code}</TableCell>
                    <TableCell>{l.status}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {levelBadge(l.riskLevel)}
                        <span className="text-sm font-mono">{(l.riskScore * 100).toFixed(0)}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono">{l.lossForecast.toFixed(1)}%</TableCell>
                    <TableCell className="font-mono">{j7?.value.toFixed(1) ?? "—"}%</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{l.modelUsed}</Badge>
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <ul className="text-xs text-muted-foreground space-y-0.5">
                        {l.reasons.slice(0, 2).map((r, i) => <li key={i}>• {r}</li>)}
                      </ul>
                    </TableCell>
                    <TableCell>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button size="sm" variant="outline" onClick={() => setSelectedLot(l.lotId)}>
                            Détails
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl">
                          <DialogHeader>
                            <DialogTitle>Prévision IA — {l.code}</DialogTitle>
                          </DialogHeader>
                          {detail.isLoading || !detail.data ? (
                            <p className="text-muted-foreground">Chargement…</p>
                          ) : (
                            <div className="space-y-4">
                              <div className="grid grid-cols-3 gap-3 text-sm">
                                <div>
                                  <p className="text-xs text-muted-foreground">Risque</p>
                                  <p className="font-bold text-lg">{(detail.data.riskScore * 100).toFixed(0)}%</p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground">Pertes prévues 7j</p>
                                  <p className="font-bold text-lg">{detail.data.lossForecast.toFixed(1)}%</p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground">Confiance</p>
                                  <p className="font-bold text-lg">{(detail.data.humidityConfidence * 100).toFixed(0)}%</p>
                                </div>
                              </div>
                              <ResponsiveContainer width="100%" height={220}>
                                <LineChart data={detail.data.humidityForecast}>
                                  <CartesianGrid strokeDasharray="3 3" />
                                  <XAxis dataKey="day" label={{ value: "J+", position: "insideBottomRight", offset: -5 }} />
                                  <YAxis label={{ value: "Humidité %", angle: -90, position: "insideLeft" }} />
                                  <Tooltip />
                                  <ReferenceLine y={35} stroke="#ef4444" strokeDasharray="3 3" label="Seuil 35%" />
                                  <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} name="Humidité prévue" />
                                </LineChart>
                              </ResponsiveContainer>
                              {detail.data.riskScore > 0.7 && (
                                <Alert variant="destructive">
                                  <AlertTriangle className="h-4 w-4" />
                                  <AlertTitle>Alerte intelligente</AlertTitle>
                                  <AlertDescription>
                                    Lot <strong>{detail.data.code}</strong> risque moisissure sous 3 jours — intervention recommandée.
                                  </AlertDescription>
                                </Alert>
                              )}
                              <div>
                                <h4 className="font-semibold text-sm mb-2">Causes détectées</h4>
                                <ul className="text-sm space-y-1">
                                  {detail.data.reasons.map((r, i) => <li key={i}>• {r}</li>)}
                                </ul>
                              </div>
                            </div>
                          )}
                        </DialogContent>
                      </Dialog>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Recent risk events */}
      {events && events.length > 0 && (
        <Card className="p-4">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <Activity className="h-4 w-4" /> Historique événements HIGH
          </h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Lot</TableHead>
                <TableHead>Niveau</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Raison</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.slice(0, 10).map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-xs">{new Date(e.createdAt).toLocaleString()}</TableCell>
                  <TableCell className="font-mono text-xs">{e.lotId.slice(0, 8)}</TableCell>
                  <TableCell>{levelBadge(e.riskLevel)}</TableCell>
                  <TableCell className="font-mono">{(e.score * 100).toFixed(0)}%</TableCell>
                  <TableCell className="text-xs">{e.reason}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
