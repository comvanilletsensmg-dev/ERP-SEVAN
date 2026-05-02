/**
 * ML model train/load/save for vanilla lot AI.
 * - Risk classifier: ml-random-forest (HIGH=1, else=0)
 * - Humidity / loss forecast: ml-regression-simple-linear (per-lot time series)
 *
 * Models persist to JSON files under MODELS_DIR.
 * If insufficient training data, the system falls back to heuristic scoring
 * (handled in predict.ts), so this module never throws on missing models.
 */
import fs from "node:fs";
import path from "node:path";
import { RandomForestClassifier } from "ml-random-forest";
import { SimpleLinearRegression } from "ml-regression-simple-linear";
import { logger } from "../logger";
import { FEATURE_ORDER, type FeatureVector, toVector } from "./features";

const MODELS_DIR = path.resolve(process.cwd(), "models");
const RISK_MODEL_PATH = path.join(MODELS_DIR, "risk-classifier.json");

export interface TrainingSample {
  features: FeatureVector;
  label: 0 | 1; // 1 = HIGH risk
}

export interface RiskModelMeta {
  trainedAt: string;
  samplesUsed: number;
  positives: number;
  featureOrder: string[];
  // serialized model
  model: unknown;
}

function ensureDir() {
  if (!fs.existsSync(MODELS_DIR)) fs.mkdirSync(MODELS_DIR, { recursive: true });
}

// ─── Risk classifier (Random Forest) ─────────────────────────────────────────

export function trainRiskClassifier(samples: TrainingSample[]): RiskModelMeta | null {
  if (samples.length < 4) {
    logger.warn({ samples: samples.length }, "AI: not enough samples to train risk classifier");
    return null;
  }
  const X = samples.map((s) => toVector(s.features));
  const y = samples.map((s) => s.label);
  // Need at least 2 classes
  const positives = y.filter((v) => v === 1).length;
  if (positives === 0 || positives === samples.length) {
    logger.warn({ positives, total: samples.length }, "AI: risk classifier needs both classes");
    return null;
  }

  // Auto-tune parameters to dataset size — RandomForest needs maxFeatures ≤ samples.length
  const maxFeatures = Math.max(2, Math.min(4, samples.length - 1, FEATURE_ORDER.length));
  const rf = new RandomForestClassifier({
    nEstimators: samples.length < 10 ? 15 : 25,
    maxFeatures,
    replacement: true,
    seed: 42,
  });
  try {
    rf.train(X, y);
  } catch (err) {
    logger.warn({ err: (err as Error).message, samples: samples.length }, "AI: RandomForest training failed — keeping heuristic only");
    return null;
  }

  const meta: RiskModelMeta = {
    trainedAt: new Date().toISOString(),
    samplesUsed: samples.length,
    positives,
    featureOrder: FEATURE_ORDER as unknown as string[],
    model: rf.toJSON(),
  };
  ensureDir();
  fs.writeFileSync(RISK_MODEL_PATH, JSON.stringify(meta));
  logger.info({ path: RISK_MODEL_PATH, samples: samples.length, positives }, "AI: risk classifier trained");
  return meta;
}

let cachedRisk: { meta: RiskModelMeta; rf: RandomForestClassifier } | null = null;
let cachedRiskMtime = 0;

export function loadRiskClassifier(): { meta: RiskModelMeta; rf: RandomForestClassifier } | null {
  if (!fs.existsSync(RISK_MODEL_PATH)) return null;
  const stat = fs.statSync(RISK_MODEL_PATH);
  if (cachedRisk && cachedRiskMtime === stat.mtimeMs) return cachedRisk;
  try {
    const meta = JSON.parse(fs.readFileSync(RISK_MODEL_PATH, "utf-8")) as RiskModelMeta;
    const rf = RandomForestClassifier.load(meta.model as never);
    cachedRisk = { meta, rf };
    cachedRiskMtime = stat.mtimeMs;
    return cachedRisk;
  } catch (err) {
    logger.error({ err }, "AI: failed to load risk classifier");
    return null;
  }
}

export function predictRiskWithModel(features: FeatureVector): { score: number; label: 0 | 1 } | null {
  const m = loadRiskClassifier();
  if (!m) return null;
  const x = toVector(features);
  const pred = m.rf.predict([x])[0] as number;
  // RF doesn't expose probability directly in all versions; do a tiny ensemble vote estimate
  // by predicting the same vector; ml-random-forest returns the majority class.
  // We provide a confidence of 0.5 + 0.5*|vote-0.5| at minimum and store score as a fraction of trees voting positive.
  const trees = (m.rf as unknown as { estimators: { predict: (x: number[][]) => number[] }[] }).estimators;
  let positiveVotes = 0;
  if (Array.isArray(trees) && trees.length > 0) {
    for (const t of trees) {
      const v = t.predict([x])[0];
      if (v === 1) positiveVotes += 1;
    }
    const score = positiveVotes / trees.length;
    return { score, label: pred === 1 ? 1 : 0 };
  }
  return { score: pred === 1 ? 0.9 : 0.1, label: pred === 1 ? 1 : 0 };
}

// ─── Time-series forecast (per-lot, fit on the fly) ──────────────────────────

/**
 * Fit y = a + b*t on a small series and forecast n future steps.
 * Returns { slope, intercept, forecast: [{step, value}], confidence } or null if too few points.
 */
export function forecastSeries(
  series: { t: number; y: number }[],
  steps: number,
): { slope: number; intercept: number; forecast: { step: number; value: number }[]; confidence: number } | null {
  if (series.length < 2) return null;
  const xs = series.map((s) => s.t);
  const ys = series.map((s) => s.y);
  const reg = new SimpleLinearRegression(xs, ys);
  // R² as confidence proxy
  const meanY = ys.reduce((a, b) => a + b, 0) / ys.length;
  const ssTot = ys.reduce((a, b) => a + (b - meanY) ** 2, 0);
  const ssRes = xs.reduce((a, x, i) => a + (ys[i] - reg.predict(x)) ** 2, 0);
  const r2 = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);
  const lastT = xs[xs.length - 1];
  const forecast: { step: number; value: number }[] = [];
  for (let i = 1; i <= steps; i += 1) {
    forecast.push({ step: i, value: reg.predict(lastT + i) });
  }
  return { slope: reg.slope, intercept: reg.intercept, forecast, confidence: r2 };
}

export function getRiskModelMeta(): { trainedAt: string; samplesUsed: number; positives: number } | null {
  const m = loadRiskClassifier();
  if (!m) return null;
  return { trainedAt: m.meta.trainedAt, samplesUsed: m.meta.samplesUsed, positives: m.meta.positives };
}
