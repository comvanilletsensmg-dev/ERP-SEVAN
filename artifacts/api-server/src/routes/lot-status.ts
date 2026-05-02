/**
 * Vanilla lot status & risk routes.
 *  POST /api/lots/update-status
 *  GET  /api/lots/risk
 *  GET  /api/lots/:id/history
 */
import { Router, type IRouter } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { db, lotsTable, lotHistoriesTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { requireRole } from "../middlewares/roles";
import { z } from "zod";
import {
  calculateRisk,
  isValidTransition,
  normalizeStatus,
  STATUSES,
} from "../lib/lot-risk";

const router: IRouter = Router();
const STATUS_ROLES = ["SUPER_ADMIN", "LOGISTICS_MANAGER"] as const;

const UpdateStatusSchema = z.object({
  lotId: z.string().min(1),
  status: z.enum(STATUSES as unknown as [string, ...string[]]),
  humidity: z.number().min(0).max(100),
  weight: z.number().positive(),
  note: z.string().optional(),
});

// ─── POST /api/lots/update-status ───────────────────────────────────────────
router.post(
  "/lots/update-status",
  requireAuth,
  requireRole(...STATUS_ROLES),
  async (req, res): Promise<void> => {
    const parsed = UpdateStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Données invalides", details: parsed.error.issues });
      return;
    }
    const { lotId, status, humidity, weight, note } = parsed.data;
    const userId = (req as any).session?.userId ?? null;

    try {
      const result = await db.transaction(async (tx) => {
        // Lock the lot row for the duration of the transaction to prevent
        // concurrent transitions from racing the validation check.
        const [lot] = await tx
          .select()
          .from(lotsTable)
          .where(eq(lotsTable.id, lotId))
          .for("update");
        if (!lot) return { status: 404, body: { error: "Lot introuvable" } };

        if (!isValidTransition(lot.status, status)) {
          return {
            status: 409,
            body: {
              error: "Transition de statut interdite",
              currentStatus: normalizeStatus(lot.status),
              requestedStatus: status,
            },
          };
        }

        // Build history including the new entry for accurate risk
        const prevHistory = await tx
          .select({ humidity: lotHistoriesTable.humidity, createdAt: lotHistoriesTable.createdAt })
          .from(lotHistoriesTable)
          .where(eq(lotHistoriesTable.lotId, lotId));

        const fullHistory = [
          ...prevHistory,
          { humidity, createdAt: new Date() },
        ];

        const risk = calculateRisk({
          humidity,
          weightInitial: lot.weightInitial,
          weightCurrent: weight,
          status,
          createdAt: lot.createdAt,
          history: fullHistory,
        });

        // Insert history row
        const [history] = await tx
          .insert(lotHistoriesTable)
          .values({
            lotId,
            status,
            humidity,
            weight,
            note: note ?? null,
            createdBy: userId,
          })
          .returning();

        // Update lot
        const [updated] = await tx
          .update(lotsTable)
          .set({
            status,
            humidity,
            weightCurrent: weight,
            riskScore: risk.score,
            riskLevel: risk.level,
            isBlocked: risk.shouldBlock,
            blockedReason: risk.blockedReason,
            lastRiskCheck: new Date(),
          })
          .where(eq(lotsTable.id, lotId))
          .returning();

        return {
          status: 200,
          body: {
            success: true,
            lot: {
              ...updated,
              createdAt: updated.createdAt instanceof Date ? updated.createdAt.toISOString() : updated.createdAt,
              lastRiskCheck: updated.lastRiskCheck instanceof Date ? updated.lastRiskCheck.toISOString() : updated.lastRiskCheck,
            },
            history: {
              ...history,
              createdAt: history.createdAt instanceof Date ? history.createdAt.toISOString() : history.createdAt,
            },
            risk,
          },
        };
      });

      res.status(result.status).json(result.body);
      if (result.status === 200) {
        req.log.info(
          { lotId, status, humidity, weight, by: userId, risk: (result.body as any).risk.level },
          "Lot status updated"
        );
      }
    } catch (err) {
      req.log.error({ err, lotId }, "Update lot status failed");
      res.status(500).json({ error: "Erreur serveur lors de la mise à jour" });
    }
  }
);

// ─── GET /api/lots/risk ─────────────────────────────────────────────────────
// Returns risk info for ALL lots (computed live from current row + history)
router.get("/lots/risk", requireAuth, async (_req, res): Promise<void> => {
  const lots = await db.select().from(lotsTable);
  const allHist = await db.select().from(lotHistoriesTable);

  const histByLot = new Map<string, { humidity: number; createdAt: Date }[]>();
  for (const h of allHist) {
    const arr = histByLot.get(h.lotId) ?? [];
    arr.push({ humidity: h.humidity, createdAt: h.createdAt as Date });
    histByLot.set(h.lotId, arr);
  }

  const result = lots.map((lot) => {
    const risk = calculateRisk({
      humidity: lot.humidity,
      weightInitial: lot.weightInitial,
      weightCurrent: lot.weightCurrent,
      status: lot.status,
      createdAt: lot.createdAt,
      history: histByLot.get(lot.id) ?? [],
    });
    return {
      lotId: lot.id,
      code: lot.code,
      status: normalizeStatus(lot.status),
      humidity: lot.humidity,
      weightCurrent: lot.weightCurrent,
      weightInitial: lot.weightInitial,
      riskScore: risk.score,
      level: risk.level,
      reasons: risk.reasons,
      suggestions: risk.suggestions,
      isBlocked: risk.shouldBlock,
      blockedReason: risk.blockedReason,
    };
  });

  res.json(result);
});

// ─── GET /api/lots/:id/history ──────────────────────────────────────────────
router.get("/lots/:id/history", requireAuth, async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(lotHistoriesTable)
    .where(eq(lotHistoriesTable.lotId, req.params.id))
    .orderBy(desc(lotHistoriesTable.createdAt));

  res.json(
    rows.map((r) => ({
      ...r,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    }))
  );
});

export default router;
