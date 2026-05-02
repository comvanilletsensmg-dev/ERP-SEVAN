/**
 * Offline training script for the vanilla lot risk classifier.
 *
 * Usage:
 *   pnpm --filter @workspace/api-server run train-models
 *
 * Reads all lots + their lot_histories / lot_metrics, builds feature vectors,
 * uses persisted (isBlocked || riskLevel='HIGH') as the binary label, and
 * trains a RandomForestClassifier saved to ./models/risk-classifier.json.
 */
import { db, lotsTable, lotHistoriesTable, lotMetricsTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { buildFeatures, type MetricSample } from "../lib/ai/features";
import { trainRiskClassifier, type TrainingSample } from "../lib/ai/models";

async function gatherSamples(lotId: string): Promise<MetricSample[]> {
  const metrics = await db.select().from(lotMetricsTable).where(eq(lotMetricsTable.lotId, lotId)).orderBy(asc(lotMetricsTable.date));
  const histories = await db.select().from(lotHistoriesTable).where(eq(lotHistoriesTable.lotId, lotId)).orderBy(asc(lotHistoriesTable.createdAt));
  const samples: MetricSample[] = [];
  for (const m of metrics) samples.push({ date: m.date as Date, humidity: m.humidity, weight: m.weight, temp: m.temp, storage: m.storage });
  for (const h of histories) samples.push({ date: h.createdAt as Date, humidity: h.humidity, weight: h.weight });
  samples.sort((a, b) => a.date.getTime() - b.date.getTime());
  return samples;
}

async function main(): Promise<void> {
  const lots = await db.select().from(lotsTable);
  console.log(`[TRAIN] ${lots.length} lots found`);

  const samples: TrainingSample[] = [];
  for (const lot of lots) {
    const series = await gatherSamples(lot.id);
    if (series.length === 0) {
      series.push({ date: new Date(), humidity: lot.humidity, weight: lot.weightCurrent });
    }
    const features = buildFeatures({
      weightInitial: lot.weightInitial,
      status: lot.status,
      createdAt: lot.createdAt as Date,
      samples: series,
    });
    const label: 0 | 1 = lot.isBlocked || lot.riskLevel === "HIGH" ? 1 : 0;
    samples.push({ features, label });
  }

  const positives = samples.filter((s) => s.label === 1).length;
  console.log(`[TRAIN] ${samples.length} samples — ${positives} positives — ${samples.length - positives} negatives`);

  const meta = trainRiskClassifier(samples);
  if (meta) {
    console.log(`[TRAIN] OK — model saved at ${new Date(meta.trainedAt).toLocaleString()}`);
  } else {
    console.log("[TRAIN] No model produced — system falls back to heuristic scoring.");
    console.log("        Need ≥4 samples with both classes (HIGH/blocked vs others) AND enough rows for RandomForest.");
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("[TRAIN] failed:", err);
  process.exit(1);
});
