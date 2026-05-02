/**
 * AI routes — vanilla lot prediction & risk monitoring.
 *
 *   GET /api/ai/predict/:lotId   → full forecast (humidity J+1..7, loss, risk)
 *   GET /api/ai/risk-lots         → all lots with predicted risk MEDIUM|HIGH
 *   GET /api/ai/risk-events       → recent persisted HIGH-risk events
 *   POST /api/ai/recompute        → manual cron trigger (LOGISTICS_MANAGER)
 *
 * All write/heavy operations require LOGISTICS_MANAGER or SUPER_ADMIN.
 */
import { Router, type IRouter } from "express";
import { db, riskEventsTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { requireRole, ROLES } from "../middlewares/roles";
import { predictLot, predictAllLots } from "../lib/ai/predict";
import { runAiPredictions } from "../lib/ai/predict-cron";
import { getRiskModelMeta } from "../lib/ai/models";

const router: IRouter = Router();

const aiAccess = requireRole(ROLES.SUPER_ADMIN, ROLES.LOGISTICS_MANAGER);

router.get("/ai/predict/:lotId", requireAuth, aiAccess, async (req, res): Promise<void> => {
  const { lotId } = req.params;
  if (!lotId) { res.status(400).json({ error: "lotId requis" }); return; }
  const result = await predictLot(lotId);
  if (!result) { res.status(404).json({ error: "Lot introuvable" }); return; }
  res.json(result);
});

router.get("/ai/risk-lots", requireAuth, aiAccess, async (_req, res): Promise<void> => {
  const all = await predictAllLots();
  const filtered = all
    .filter((p) => p.riskLevel !== "LOW")
    .sort((a, b) => b.riskScore - a.riskScore);
  const total = all.length;
  const high = all.filter((p) => p.riskLevel === "HIGH").length;
  const medium = all.filter((p) => p.riskLevel === "MEDIUM").length;
  const meta = getRiskModelMeta();
  res.json({
    lots: filtered,
    summary: {
      total,
      high,
      medium,
      pctAtRisk: total === 0 ? 0 : Math.round(((high + medium) / total) * 100),
      avgLossForecast: total === 0 ? 0 : Math.round(all.reduce((s, p) => s + p.lossForecast, 0) / total * 10) / 10,
      modelTrainedAt: meta?.trainedAt ?? null,
      modelSamples: meta?.samplesUsed ?? 0,
    },
  });
});

router.get("/ai/risk-events", requireAuth, aiAccess, async (_req, res): Promise<void> => {
  const events = await db.select().from(riskEventsTable).orderBy(desc(riskEventsTable.createdAt)).limit(50);
  res.json(events);
});

router.post("/ai/recompute", requireAuth, aiAccess, async (_req, res): Promise<void> => {
  const result = await runAiPredictions();
  res.json({ success: true, ...result });
});

export default router;
