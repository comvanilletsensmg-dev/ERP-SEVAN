import { Router, type IRouter } from "express";
import { db, lotsTable, lotCostsTable, priceHistoryTable } from "@workspace/db";
import { desc, eq, avg, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { normalizeStatus } from "../lib/lot-risk";

const router: IRouter = Router();

function computePrediction(history: { date: Date; price: number }[], forecastDays = 30) {
  if (history.length === 0) return null;
  const sorted = [...history].sort((a, b) => a.date.getTime() - b.date.getTime());
  const window = sorted.slice(-30);
  const movingAvg = window.reduce((s, p) => s + p.price, 0) / window.length;
  const n = sorted.length;
  let trend = 0;
  if (n >= 2) {
    const daySpan = Math.max(1, (sorted[n - 1].date.getTime() - sorted[0].date.getTime()) / 86_400_000);
    trend = (sorted[n - 1].price - sorted[0].price) / daySpan;
  }
  return { predicted: Math.max(0, movingAvg + trend * forecastDays), movingAvg, trend };
}

router.get("/logistics/dashboard", requireAuth, async (_req, res): Promise<void> => {
  // ─── Lot status counters (uses persisted riskLevel/isBlocked from cron) ──
  // We only fetch the columns we need; risk recomputation is delegated to the
  // daily cron + per-update transaction, so this stays O(N rows) with no joins.
  const lotRows = await db
    .select({
      status: lotsTable.status,
      isBlocked: lotsTable.isBlocked,
      riskLevel: lotsTable.riskLevel,
    })
    .from(lotsTable);

  let totalLots = 0, readyLots = 0, blockedLots = 0, riskLots = 0;
  for (const lot of lotRows) {
    totalLots += 1;
    const norm = normalizeStatus(lot.status);
    if (norm === "READY" || norm === "AVAILABLE") readyLots += 1;
    if (lot.isBlocked) blockedLots += 1;
    if (lot.riskLevel === "HIGH") riskLots += 1;
  }

  // Average cost per kg across all lots with cost data
  const [avgCostRow] = await db.select({ val: avg(lotCostsTable.costPerKg) }).from(lotCostsTable);
  const avgCostPerKg = Number(avgCostRow?.val ?? 0);

  // Recent price history (last 60 points for chart)
  const priceHistory = await db.select().from(priceHistoryTable).orderBy(desc(priceHistoryTable.date)).limit(60);
  const priceHistoryChart = [...priceHistory].reverse().map(p => ({
    date: p.date.toISOString().slice(0, 10),
    price: p.price,
    market: p.market,
  }));

  // Prediction
  const computation = computePrediction(priceHistory);
  const predictedPrice = computation?.predicted ?? 0;
  const currentPrice = priceHistory.length > 0 ? priceHistory[0].price : 0; // most recent

  // Margin: predicted price - avg cost per kg
  const marginEstimate = predictedPrice > 0 && avgCostPerKg > 0 ? predictedPrice - avgCostPerKg : 0;
  const marginPercent = avgCostPerKg > 0 && marginEstimate > 0 ? Math.round((marginEstimate / predictedPrice) * 100) : 0;

  // Alert
  let alert: string | null = null;
  if (computation && currentPrice > 0) {
    const pct = ((computation.predicted - currentPrice) / currentPrice) * 100;
    if (pct <= -10) alert = "drop";
    else if (pct >= 10) alert = "opportunity";
  }

  // Lot costs summary (last 10 lots with costs)
  const lotCosts = await db.select({
    lotId: lotCostsTable.lotId,
    code: lotsTable.code,
    status: lotsTable.status,
    weightCurrent: lotsTable.weightCurrent,
    costPerKg: lotCostsTable.costPerKg,
    totalCost: lotCostsTable.totalCost,
    updatedAt: lotCostsTable.updatedAt,
  })
    .from(lotCostsTable)
    .leftJoin(lotsTable, eq(lotCostsTable.lotId, lotsTable.id))
    .orderBy(desc(lotCostsTable.updatedAt))
    .limit(10);

  // Cost vs price chart (compare costPerKg vs currentPrice per lot)
  const costVsPrice = lotCosts.map(l => ({
    lot: l.code ?? l.lotId,
    cost: Math.round(l.costPerKg ?? 0),
    price: currentPrice,
    margin: currentPrice > 0 ? Math.round(currentPrice - (l.costPerKg ?? 0)) : 0,
  }));

  res.json({
    totalLots,
    readyLots,
    blockedLots,
    riskLots,
    avgCostPerKg: Math.round(avgCostPerKg),
    predictedPrice: Math.round(predictedPrice),
    currentPrice: Math.round(currentPrice),
    marginEstimate: Math.round(marginEstimate),
    marginPercent,
    alert,
    trend7d: computation ? Math.round(computation.trend * 7) : 0,
    dataPoints: priceHistory.length,
    priceHistoryChart,
    costVsPrice,
    lotCosts: lotCosts.map(l => ({
      ...l,
      updatedAt: l.updatedAt instanceof Date ? l.updatedAt.toISOString() : l.updatedAt,
    })),
  });
});

export default router;
