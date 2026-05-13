import { Router, type IRouter } from "express";
import { db, priceHistoryTable, pricePredictionsTable } from "@workspace/db";
import { desc, gte } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

const safe = (r: any) => ({
  ...r,
  date: r.date instanceof Date ? r.date.toISOString() : r.date,
  createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
  generatedAt: r.generatedAt instanceof Date ? r.generatedAt.toISOString() : r.generatedAt,
});

// ─── Price History ────────────────────────────────────────────────────────────

router.get("/ai/price-history", requireAuth, async (_req, res): Promise<void> => {
  const history = await db.select().from(priceHistoryTable).orderBy(desc(priceHistoryTable.date)).limit(120);
  res.json(history.map(safe));
});

router.post("/ai/price-history", requireAuth, async (req, res): Promise<void> => {
  const { date, price, market = "export", notes } = req.body;
  if (!date || !price) { res.status(400).json({ error: "date et price requis" }); return; }
  const [entry] = await db.insert(priceHistoryTable).values({
    date: new Date(date), price: Number(price), market, notes: notes ?? null,
  }).returning();
  res.status(201).json(safe(entry));
});

router.delete("/ai/price-history/:id", requireAuth, async (req, res): Promise<void> => {
  const { id } = req.params as Record<string, string>;
  const deleted = await db.delete(priceHistoryTable).where(
    (await import("drizzle-orm")).eq(priceHistoryTable.id, id)
  ).returning();
  if (!deleted.length) { res.status(404).json({ error: "Entrée introuvable" }); return; }
  res.json({ success: true });
});

// ─── Prediction Engine ────────────────────────────────────────────────────────

function computePrediction(history: { date: Date; price: number }[], forecastDays = 30) {
  if (history.length === 0) return null;

  // Sort ascending
  const sorted = [...history].sort((a, b) => a.date.getTime() - b.date.getTime());

  // Moving average over last 30 data points
  const window = sorted.slice(-30);
  const movingAvg = window.reduce((s, p) => s + p.price, 0) / window.length;

  // Trend: linear regression slope over all points
  const n = sorted.length;
  let trend = 0;
  if (n >= 2) {
    const firstPrice = sorted[0].price;
    const lastPrice = sorted[n - 1].price;
    const daySpan = Math.max(1, (sorted[n - 1].date.getTime() - sorted[0].date.getTime()) / 86_400_000);
    trend = (lastPrice - firstPrice) / daySpan; // price change per day
  }

  const predicted = Math.max(0, movingAvg + trend * forecastDays);

  // Confidence: high if we have 30+ data points, medium if 10+, low otherwise
  const confidence = n >= 30 ? "high" : n >= 10 ? "medium" : "low";

  return { predicted, movingAvg, trend, confidence };
}

router.post("/ai/predict", requireAuth, async (_req, res): Promise<void> => {
  const since = new Date(Date.now() - 365 * 86_400_000); // 1 year
  const history = await db.select().from(priceHistoryTable).where(gte(priceHistoryTable.date, since)).orderBy(desc(priceHistoryTable.date));

  const result = computePrediction(history);
  if (!result) { res.status(400).json({ error: "Pas assez de données historiques (minimum 1 point)" }); return; }

  const [prediction] = await db.insert(pricePredictionsTable).values({
    date: new Date(Date.now() + 30 * 86_400_000),
    predicted: result.predicted,
    movingAvg: result.movingAvg,
    trend: result.trend,
    confidence: result.confidence,
  }).returning();

  res.json(safe(prediction));
});

router.get("/ai/prediction", requireAuth, async (_req, res): Promise<void> => {
  // Return latest prediction or auto-compute if none
  const [latest] = await db.select().from(pricePredictionsTable).orderBy(desc(pricePredictionsTable.generatedAt)).limit(1);
  const history = await db.select().from(priceHistoryTable).orderBy(desc(priceHistoryTable.date)).limit(90);

  const computation = computePrediction(history);
  const currentPrice = history.length > 0 ? [...history].sort((a, b) => b.date.getTime() - a.date.getTime())[0].price : null;
  const trend7d = history.length >= 2 ? (() => {
    const sorted = [...history].sort((a, b) => b.date.getTime() - a.date.getTime());
    const recent = sorted.slice(0, Math.min(7, sorted.length));
    const oldest7 = sorted[Math.min(6, sorted.length - 1)];
    return oldest7 ? ((sorted[0].price - oldest7.price) / oldest7.price) * 100 : 0;
  })() : 0;

  // Alerts
  let alert: string | null = null;
  if (computation && currentPrice) {
    const diff = computation.predicted - currentPrice;
    const pct = (diff / currentPrice) * 100;
    if (pct <= -10) alert = "drop";
    else if (pct >= 10) alert = "opportunity";
  }

  res.json({
    latest: latest ? safe(latest) : null,
    current: computation ? {
      ...computation,
      date: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    } : null,
    currentPrice,
    trend7dPct: Math.round(trend7d * 10) / 10,
    alert,
    dataPoints: history.length,
  });
});

export default router;
