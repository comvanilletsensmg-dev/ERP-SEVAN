import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  LineChart, Line,
} from "recharts";
import { AlertTriangle, ShieldAlert, Droplets, Lightbulb } from "lucide-react";

type RiskRow = {
  lotId: string; code: string; status: string;
  humidity: number; weightCurrent: number; weightInitial: number;
  riskScore: number; level: "LOW" | "MEDIUM" | "HIGH";
  reasons: string[]; suggestions: string[];
  isBlocked: boolean; blockedReason: string | null;
};

async function fetchRisk(): Promise<RiskRow[]> {
  const r = await fetch("/api/lots/risk", { credentials: "include" });
  if (!r.ok) throw new Error("Failed");
  return r.json();
}

export default function RiskPage() {
  const { data: rows, isLoading } = useQuery({ queryKey: ["lots-risk"], queryFn: fetchRisk });

  if (isLoading) {
    return <div className="p-6 text-muted-foreground">Chargement…</div>;
  }

  const all = rows ?? [];
  const high = all.filter(r => r.level === "HIGH");
  const medium = all.filter(r => r.level === "MEDIUM");
  const blocked = all.filter(r => r.isBlocked);
  const criticalHumidity = all.filter(r => r.humidity > 35);

  const humidityChart = all
    .slice()
    .sort((a, b) => b.humidity - a.humidity)
    .slice(0, 12)
    .map(r => ({ code: r.code, humidity: Math.round(r.humidity * 10) / 10, threshold: 35 }));

  const lossChart = all
    .map(r => {
      const loss = r.weightInitial > 0
        ? ((r.weightInitial - r.weightCurrent) / r.weightInitial) * 100
        : 0;
      return { code: r.code, loss: Math.round(loss * 10) / 10 };
    })
    .filter(r => r.loss > 0)
    .sort((a, b) => b.loss - a.loss)
    .slice(0, 12);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-bold">Lots à risque</h1>
        <p className="text-muted-foreground mt-1">
          Détection IA — humidité, perte de poids, durée d'étuvage
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase">Lots analysés</p>
          <p className="text-3xl font-bold mt-2" data-testid="stat-total">{all.length}</p>
        </Card>
        <Card className="p-4 border-red-200 dark:border-red-900/40">
          <p className="text-xs text-muted-foreground uppercase">Risque élevé</p>
          <p className="text-3xl font-bold mt-2 text-red-700 dark:text-red-400" data-testid="stat-high">{high.length}</p>
        </Card>
        <Card className="p-4 border-amber-200 dark:border-amber-900/40">
          <p className="text-xs text-muted-foreground uppercase">Risque moyen</p>
          <p className="text-3xl font-bold mt-2 text-amber-700 dark:text-amber-400" data-testid="stat-medium">{medium.length}</p>
        </Card>
        <Card className="p-4 border-rose-200 dark:border-rose-900/40">
          <p className="text-xs text-muted-foreground uppercase">Bloqués</p>
          <p className="text-3xl font-bold mt-2 text-rose-700 dark:text-rose-400" data-testid="stat-blocked">{blocked.length}</p>
        </Card>
      </div>

      {/* Alerts */}
      {(high.length > 0 || criticalHumidity.length > 0) && (
        <div className="space-y-3">
          {high.length > 0 && (
            <Alert variant="destructive" data-testid="alert-high-risk">
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>{high.length} lot{high.length > 1 ? "s" : ""} à risque élevé</AlertTitle>
              <AlertDescription>
                Inspection immédiate recommandée. Vente bloquée automatiquement.
              </AlertDescription>
            </Alert>
          )}
          {criticalHumidity.length > 0 && (
            <Alert className="border-amber-300" data-testid="alert-humidity">
              <Droplets className="h-4 w-4" />
              <AlertTitle>Humidité critique — {criticalHumidity.length} lot{criticalHumidity.length > 1 ? "s" : ""}</AlertTitle>
              <AlertDescription>
                Humidité {`>`} 35% détectée. L'export est interdit jusqu'à séchage.
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Droplets className="w-4 h-4 text-blue-600" />
            Top 12 — Humidité par lot
          </h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={humidityChart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="code" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={60} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="humidity" stroke="#2563eb" strokeWidth={2} name="Humidité (%)" />
                <Line type="monotone" dataKey="threshold" stroke="#dc2626" strokeDasharray="5 5" name="Seuil critique" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            Top 12 — Pertes de poids (%)
          </h3>
          <div className="h-[300px]">
            {lossChart.length === 0 ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Aucune perte enregistrée
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={lossChart}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="code" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={60} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="loss" fill="#f59e0b" name="Perte (%)" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      {/* High-risk table */}
      <Card>
        <div className="p-4 border-b">
          <h3 className="font-semibold">Détail — lots à risque (HIGH + MEDIUM)</h3>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Niveau</TableHead>
              <TableHead className="text-right">Score</TableHead>
              <TableHead>Causes</TableHead>
              <TableHead>Suggestions IA</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...high, ...medium].length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                  Aucun lot à risque détecté ✓
                </TableCell>
              </TableRow>
            )}
            {[...high, ...medium].map(r => (
              <TableRow key={r.lotId} data-testid={`risk-row-${r.code}`}>
                <TableCell className="font-mono text-sm">{r.code}</TableCell>
                <TableCell><Badge variant="outline">{r.status}</Badge></TableCell>
                <TableCell>
                  <Badge variant={r.level === "HIGH" ? "destructive" : "secondary"}
                    className={r.level === "MEDIUM" ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" : ""}
                  >
                    {r.level}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-semibold">{Math.round(r.riskScore)}</TableCell>
                <TableCell>
                  <ul className="text-xs text-muted-foreground space-y-0.5">
                    {r.reasons.map((reason, i) => <li key={i}>• {reason}</li>)}
                  </ul>
                </TableCell>
                <TableCell>
                  <ul className="text-xs space-y-0.5">
                    {r.suggestions.map((sug, i) => (
                      <li key={i} className="flex gap-1 items-start">
                        <Lightbulb className="w-3 h-3 mt-0.5 text-yellow-500 shrink-0" />
                        <span>{sug}</span>
                      </li>
                    ))}
                  </ul>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
