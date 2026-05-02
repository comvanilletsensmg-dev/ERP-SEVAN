/**
 * Feature engineering for vanilla lot AI.
 * Pure functions — no DB access. Inputs are time-ordered series of measurements.
 */

export interface MetricSample {
  date: Date;
  humidity: number;
  weight: number;
  temp?: number | null;
  storage?: string | null;
}

export interface LotContext {
  weightInitial: number;
  status: string;
  createdAt: Date;
  samples: MetricSample[]; // chronological (oldest first)
}

export interface FeatureVector {
  humidity_t: number;
  delta_humidity: number;        // last - prev
  weight_loss_rate: number;      // (initial - current) / days_since_creation
  weight_loss_pct: number;       // (initial - current) / initial * 100
  days_in_curing: number;
  temp: number;
  storage_code: number;          // hashed bucket
  month: number;                 // 1..12
  week_of_year: number;          // 1..52
  is_rainy_season: number;       // 0|1
  humidity_mean_7d: number;
  humidity_std_7d: number;
  weight_loss_7d: number;
}

const STORAGE_BUCKETS = ["warehouse", "box", "bag"] as const;
const RAINY_MONTHS = new Set([11, 12, 1, 2, 3]); // Madagascar: Nov–Mar

function weekOfYear(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 1);
  const diff = (d.getTime() - start.getTime()) / 86_400_000;
  return Math.min(52, Math.max(1, Math.ceil((diff + start.getDay() + 1) / 7)));
}

function storageCode(s?: string | null): number {
  if (!s) return 0;
  const i = STORAGE_BUCKETS.indexOf(s.toLowerCase() as (typeof STORAGE_BUCKETS)[number]);
  return i < 0 ? 0 : i + 1;
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const v = xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}

/**
 * Build the feature vector representing the *current* state of a lot.
 */
export function buildFeatures(ctx: LotContext, asOf: Date = new Date()): FeatureVector {
  const samples = [...ctx.samples].sort((a, b) => a.date.getTime() - b.date.getTime());
  const last = samples[samples.length - 1];
  const prev = samples[samples.length - 2];

  const humidity_t = last?.humidity ?? 0;
  const delta_humidity = last && prev ? last.humidity - prev.humidity : 0;

  const weightCurrent = last?.weight ?? ctx.weightInitial;
  const ageDays = Math.max(1, (asOf.getTime() - ctx.createdAt.getTime()) / 86_400_000);
  const weight_loss_rate = (ctx.weightInitial - weightCurrent) / ageDays;
  const weight_loss_pct = ctx.weightInitial > 0
    ? ((ctx.weightInitial - weightCurrent) / ctx.weightInitial) * 100
    : 0;

  const status = ctx.status.toUpperCase();
  const days_in_curing = status === "CURING" ? Math.floor(ageDays) : 0;

  const temp = last?.temp ?? 25;
  const storage_code = storageCode(last?.storage);

  const month = asOf.getMonth() + 1;
  const week_of_year = weekOfYear(asOf);
  const is_rainy_season = RAINY_MONTHS.has(month) ? 1 : 0;

  // 7-day window
  const sevenDaysAgo = asOf.getTime() - 7 * 86_400_000;
  const recent = samples.filter((s) => s.date.getTime() >= sevenDaysAgo);
  const humidity_mean_7d = mean(recent.map((s) => s.humidity));
  const humidity_std_7d = std(recent.map((s) => s.humidity));
  const weight_loss_7d = recent.length >= 2
    ? recent[0].weight - recent[recent.length - 1].weight
    : 0;

  return {
    humidity_t,
    delta_humidity,
    weight_loss_rate,
    weight_loss_pct,
    days_in_curing,
    temp,
    storage_code,
    month,
    week_of_year,
    is_rainy_season,
    humidity_mean_7d,
    humidity_std_7d,
    weight_loss_7d,
  };
}

/** Numerical vector in stable order — used by ML libraries. */
export const FEATURE_ORDER: (keyof FeatureVector)[] = [
  "humidity_t",
  "delta_humidity",
  "weight_loss_rate",
  "weight_loss_pct",
  "days_in_curing",
  "temp",
  "storage_code",
  "month",
  "week_of_year",
  "is_rainy_season",
  "humidity_mean_7d",
  "humidity_std_7d",
  "weight_loss_7d",
];

export function toVector(f: FeatureVector): number[] {
  return FEATURE_ORDER.map((k) => f[k]);
}

export function isRainySeason(date: Date = new Date()): boolean {
  return RAINY_MONTHS.has(date.getMonth() + 1);
}
