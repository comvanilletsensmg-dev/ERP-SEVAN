/**
 * Daily cron: recalculate risk for every lot, persist isBlocked when HIGH.
 */
import { eq } from "drizzle-orm";
import { db, lotsTable, lotHistoriesTable } from "@workspace/db";
import { calculateRisk } from "./lot-risk";

export async function recalcAllLotRisks(): Promise<{
  total: number;
  updated: number;
  blocked: number;
  high: number;
  medium: number;
  low: number;
}> {
  const lots = await db.select().from(lotsTable);
  const allHist = await db
    .select({
      lotId: lotHistoriesTable.lotId,
      humidity: lotHistoriesTable.humidity,
      createdAt: lotHistoriesTable.createdAt,
    })
    .from(lotHistoriesTable);

  const histByLot = new Map<string, { humidity: number; createdAt: Date }[]>();
  for (const h of allHist) {
    const arr = histByLot.get(h.lotId) ?? [];
    arr.push({ humidity: h.humidity, createdAt: h.createdAt as Date });
    histByLot.set(h.lotId, arr);
  }

  let updated = 0, blocked = 0, high = 0, medium = 0, low = 0;

  for (const lot of lots) {
    const r = calculateRisk({
      humidity: lot.humidity,
      weightInitial: lot.weightInitial,
      weightCurrent: lot.weightCurrent,
      status: lot.status,
      createdAt: lot.createdAt,
      history: histByLot.get(lot.id) ?? [],
    });

    if (r.level === "HIGH") high += 1;
    else if (r.level === "MEDIUM") medium += 1;
    else low += 1;

    if (r.shouldBlock) blocked += 1;

    const changed =
      lot.riskScore !== r.score ||
      lot.riskLevel !== r.level ||
      lot.isBlocked !== r.shouldBlock ||
      lot.blockedReason !== r.blockedReason;

    if (changed) {
      await db
        .update(lotsTable)
        .set({
          riskScore: r.score,
          riskLevel: r.level,
          isBlocked: r.shouldBlock,
          blockedReason: r.blockedReason,
          lastRiskCheck: new Date(),
        })
        .where(eq(lotsTable.id, lot.id));
      updated += 1;
    }
  }

  return { total: lots.length, updated, blocked, high, medium, low };
}
