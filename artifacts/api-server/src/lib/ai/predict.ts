/**
 * Online prediction service for vanilla lots.
 * Combines:
 *   - heuristic scoring (always available, factors in seasonality)
 *   - ML risk classifier (when trained, blended into final score)
 *   - per-lot SimpleLinearRegression forecasts for humidity & loss
 */
import { db, lotsTable, lotHistoriesTable, lotMetricsTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { buildFeatures, isRainySeason, type MetricSample } from "./features";
import { forecastSeries, predictRiskWithModel } from "./models";

export interface PredictionResult {
  lotId: string;
  code: string;
  status: string;
  humidityForecast: { day: number; value: number }[]; // J+1..J+7
  humidityConfidence: number;
  lossForecast: number;        // % loss expected in 7 days
  lossConfidence: number;
  riskScore: number;           // 0..1 (probability)
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  reasons: string[];
  isRainySeason: boolean;
  modelUsed: "ml" | "heuristic" | "blend";
  generatedAt: string;
}

/**
 * Heuristic risk in 0..1 (mirrors lot-risk.ts but normalized as probability,
 * with seasonality boost for Madagascar rainy season Nov–Mar).
 */
function heuristicRiskScore(args: {
  humidity: number;
  weightInitial: number;
  weightCurrent: number;
  status: string;
  ageDays: number;
  rainy: boolean;
}): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  if (args.humidity > 35) { score += 40; reasons.push(`Humidité ${args.humidity.toFixed(1)}% > 35%`); }
  if (args.humidity > 28 && args.rainy) { score += 10; reasons.push("Saison humide MG (Nov–Mar)"); }
  if (args.weightInitial > 0) {
    const lossPct = ((args.weightInitial - args.weightCurrent) / args.weightInitial) * 100;
    if (lossPct > 10) { score += 20; reasons.push(`Perte poids ${lossPct.toFixed(1)}% > 10%`); }
  }
  if (args.status.toUpperCase() === "CURING" && args.ageDays > 30) {
    score += 20; reasons.push(`Étuvage ${Math.floor(args.ageDays)}j > 30j`);
  }
  if (["PHENOLED", "MOLDY"].includes(args.status.toUpperCase())) {
    score += 50; reasons.push(`Statut ${args.status}`);
  }

  return { score: Math.min(1, score / 100), reasons };
}

function levelFromScore(p: number): "LOW" | "MEDIUM" | "HIGH" {
  if (p >= 0.6) return "HIGH";
  if (p >= 0.3) return "MEDIUM";
  return "LOW";
}

async function gatherSamples(lotId: string): Promise<MetricSample[]> {
  // Combine lot_metrics (richer) and lot_histories (audit) into one chronological series
  const metrics = await db.select().from(lotMetricsTable).where(eq(lotMetricsTable.lotId, lotId)).orderBy(asc(lotMetricsTable.date));
  const histories = await db.select().from(lotHistoriesTable).where(eq(lotHistoriesTable.lotId, lotId)).orderBy(asc(lotHistoriesTable.createdAt));

  const samples: MetricSample[] = [];
  for (const m of metrics) {
    samples.push({ date: m.date as Date, humidity: m.humidity, weight: m.weight, temp: m.temp, storage: m.storage });
  }
  for (const h of histories) {
    samples.push({ date: h.createdAt as Date, humidity: h.humidity, weight: h.weight });
  }
  samples.sort((a, b) => a.date.getTime() - b.date.getTime());
  return samples;
}

export async function predictLot(lotId: string): Promise<PredictionResult | null> {
  const [lot] = await db.select().from(lotsTable).where(eq(lotsTable.id, lotId));
  if (!lot) return null;

  const samples = await gatherSamples(lotId);
  // Always seed with the current lot snapshot so we have at least one sample
  if (samples.length === 0) {
    samples.push({ date: new Date(), humidity: lot.humidity, weight: lot.weightCurrent });
  }
  const ctx = {
    weightInitial: lot.weightInitial,
    status: lot.status,
    createdAt: lot.createdAt as Date,
    samples,
  };
  const features = buildFeatures(ctx);
  const ageDays = Math.max(1, (Date.now() - new Date(lot.createdAt).getTime()) / 86_400_000);
  const rainy = isRainySeason();

  // Heuristic score
  const heur = heuristicRiskScore({
    humidity: features.humidity_t,
    weightInitial: lot.weightInitial,
    weightCurrent: lot.weightCurrent,
    status: lot.status,
    ageDays,
    rainy,
  });

  // ML score (if trained)
  const ml = predictRiskWithModel(features);
  let finalScore = heur.score;
  let modelUsed: "ml" | "heuristic" | "blend" = "heuristic";
  if (ml) {
    finalScore = 0.5 * heur.score + 0.5 * ml.score;
    modelUsed = "blend";
  }

  // Forecast humidity J+1..J+7 (using SimpleLinearRegression on ms timestamps)
  const t0 = samples[0].date.getTime();
  const humSeries = samples.map((s) => ({ t: (s.date.getTime() - t0) / 86_400_000, y: s.humidity }));
  const humFc = forecastSeries(humSeries, 7);
  const humidityForecast = humFc
    ? humFc.forecast.map((f) => ({ day: f.step, value: Math.max(0, Math.min(100, f.value)) }))
    : Array.from({ length: 7 }, (_, i) => ({ day: i + 1, value: features.humidity_t }));
  const humidityConfidence = humFc?.confidence ?? 0;

  // Loss forecast: project weight 7 days ahead, compute expected % loss vs initial
  const wSeries = samples.map((s) => ({ t: (s.date.getTime() - t0) / 86_400_000, y: s.weight }));
  const wFc = forecastSeries(wSeries, 7);
  let lossForecast = 0;
  let lossConfidence = 0;
  if (wFc && lot.weightInitial > 0) {
    const projected = wFc.forecast[wFc.forecast.length - 1].value;
    const projectedLoss = ((lot.weightInitial - projected) / lot.weightInitial) * 100;
    lossForecast = Math.max(0, Math.min(100, projectedLoss));
    lossConfidence = wFc.confidence;
  } else if (lot.weightInitial > 0) {
    lossForecast = Math.max(0, ((lot.weightInitial - lot.weightCurrent) / lot.weightInitial) * 100);
  }

  const result: PredictionResult = {
    lotId: lot.id,
    code: lot.code,
    status: lot.status,
    humidityForecast,
    humidityConfidence: Number(humidityConfidence.toFixed(3)),
    lossForecast: Number(lossForecast.toFixed(2)),
    lossConfidence: Number(lossConfidence.toFixed(3)),
    riskScore: Number(finalScore.toFixed(3)),
    riskLevel: levelFromScore(finalScore),
    reasons: heur.reasons,
    isRainySeason: rainy,
    modelUsed,
    generatedAt: new Date().toISOString(),
  };
  return result;
}

// In-memory cache to avoid O(N) DB+ML hot-path collapse on /api/ai/risk-lots.
// Cron writes daily; cache TTL of 60s keeps page refreshes cheap while staying fresh.
const RISK_CACHE_TTL_MS = 60_000;
let cachedAll: { data: PredictionResult[]; expiresAt: number } | null = null;

export function invalidateRiskLotsCache(): void {
  cachedAll = null;
}

export async function predictAllLots(): Promise<PredictionResult[]> {
  const now = Date.now();
  if (cachedAll && cachedAll.expiresAt > now) return cachedAll.data;
  const lots = await db.select({ id: lotsTable.id }).from(lotsTable);
  const out: PredictionResult[] = [];
  for (const l of lots) {
    const p = await predictLot(l.id);
    if (p) out.push(p);
  }
  cachedAll = { data: out, expiresAt: now + RISK_CACHE_TTL_MS };
  return out;
}
