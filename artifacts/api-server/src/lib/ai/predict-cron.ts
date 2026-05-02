/**
 * Daily AI cron:
 *  1. recompute predictions for all lots
 *  2. persist a Prediction row per lot (humidity J+7 + loss + risk)
 *  3. insert a RiskEvent row when risk level is HIGH
 *  4. log alerts for downstream notification
 */
import { db, predictionsTable, riskEventsTable } from "@workspace/db";
import { and, eq, gte } from "drizzle-orm";
import { logger } from "../logger";
import { predictAllLots, invalidateRiskLotsCache } from "./predict";

export async function runAiPredictions(): Promise<{ processed: number; highRisk: number; eventsCreated: number }> {
  const results = await predictAllLots();
  let highRisk = 0;
  let eventsCreated = 0;
  const now = new Date();
  const dayStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Wrap all DB writes in a single transaction to keep state consistent on failure.
  await db.transaction(async (tx) => {
    for (const r of results) {
      const j7 = r.humidityForecast[r.humidityForecast.length - 1];
      await tx.insert(predictionsTable).values([
        { lotId: r.lotId, type: "humidity", date: now, value: j7?.value ?? 0, confidence: r.humidityConfidence },
        { lotId: r.lotId, type: "loss", date: now, value: r.lossForecast, confidence: r.lossConfidence },
        { lotId: r.lotId, type: "risk", date: now, value: r.riskScore, confidence: r.modelUsed === "blend" ? 0.8 : 0.5 },
      ]);

      if (r.riskLevel === "HIGH") {
        highRisk += 1;
        // Dedupe: skip if a HIGH event for this lot already exists in the last 24h
        const [existing] = await tx
          .select({ id: riskEventsTable.id })
          .from(riskEventsTable)
          .where(and(
            eq(riskEventsTable.lotId, r.lotId),
            eq(riskEventsTable.riskLevel, "HIGH"),
            gte(riskEventsTable.createdAt, dayStart),
          ))
          .limit(1);
        if (existing) continue;
        const reason = r.reasons.length > 0
          ? r.reasons.join("; ")
          : `Score IA ${(r.riskScore * 100).toFixed(0)}%`;
        await tx.insert(riskEventsTable).values({
          lotId: r.lotId,
          riskLevel: r.riskLevel,
          score: r.riskScore,
          reason,
        });
        eventsCreated += 1;
        logger.warn({ lotCode: r.code, score: r.riskScore, reason }, "AI ALERT: HIGH risk lot");
      }
    }
  });

  // Invalidate the risk-lots cache so the UI sees fresh data after recompute.
  invalidateRiskLotsCache();
  return { processed: results.length, highRisk, eventsCreated };
}
