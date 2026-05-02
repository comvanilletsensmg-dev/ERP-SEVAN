import { Router, type IRouter } from "express";
import { eq, sql, desc } from "drizzle-orm";
import { db, productsTable, lotsTable, productAdjustmentsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { requireRole } from "../middlewares/roles";
import { z } from "zod";

const router: IRouter = Router();

const ADJUST_ROLES = ["SUPER_ADMIN", "LOGISTICS_MANAGER"] as const;

const AdjustSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().refine((n) => n !== 0, { message: "La quantité ne peut pas être 0" }),
  reason: z.string().optional(),
});

// ─── POST /api/stock/adjust ─────────────────────────────────────────────────
router.post("/stock/adjust", requireAuth, requireRole(...ADJUST_ROLES), async (req, res): Promise<void> => {
  const parsed = AdjustSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Données invalides", details: parsed.error.issues });
    return;
  }
  const { productId, quantity, reason } = parsed.data;
  const userId = (req as any).session?.userId ?? null;

  try {
    // Run inside a serializable transaction so concurrent OUTs cannot
    // jointly drive stock below zero. Lock the product row to serialize
    // adjustments per-product, then compute current ledger and reject
    // any movement that would breach the non-negative invariant.
    const result = await db.transaction(async (tx) => {
      // Lock the product row (FOR UPDATE) — serializes adjustments per product
      const [product] = await tx.execute<{ id: string }>(
        sql`SELECT id FROM ${productsTable} WHERE ${productsTable.id} = ${productId} FOR UPDATE`
      ).then((r: any) => Array.isArray(r) ? r : (r.rows ?? []));

      if (!product) {
        return { status: 404, body: { error: "Produit introuvable" } };
      }

      // Compute current stock = lots + previous adjustments
      const [lotAgg] = await tx
        .select({ total: sql<number>`COALESCE(SUM(${lotsTable.weightCurrent}), 0)` })
        .from(lotsTable)
        .where(eq(lotsTable.productId, productId));

      const [adjAgg] = await tx
        .select({ total: sql<number>`COALESCE(SUM(${productAdjustmentsTable.quantity}), 0)` })
        .from(productAdjustmentsTable)
        .where(eq(productAdjustmentsTable.productId, productId));

      const currentStock = Number(lotAgg?.total ?? 0) + Number(adjAgg?.total ?? 0);
      const projected = currentStock + quantity;

      if (projected < 0) {
        return {
          status: 409,
          body: {
            error: "Stock insuffisant",
            currentStock: Math.max(0, currentStock),
            requested: Math.abs(quantity),
            shortfall: Math.abs(projected),
          },
        };
      }

      const type = quantity > 0 ? "IN" : "OUT";
      const [adjustment] = await tx
        .insert(productAdjustmentsTable)
        .values({ productId, type, quantity, reason: reason ?? null, createdBy: userId })
        .returning();

      return { status: 200, body: { adjustment, newStock: projected } };
    });

    if (result.status !== 200) {
      res.status(result.status).json(result.body);
      return;
    }

    const adjustment = (result.body as any).adjustment;
    req.log.info(
      { productId, quantity, type: adjustment.type, reason, by: userId, newStock: (result.body as any).newStock },
      "Stock adjustment recorded"
    );

    res.json({
      success: true,
      newStock: Number((result.body as any).newStock.toFixed(2)),
      adjustment: {
        ...adjustment,
        createdAt: adjustment.createdAt instanceof Date ? adjustment.createdAt.toISOString() : adjustment.createdAt,
      },
    });
  } catch (err) {
    req.log.error({ err, productId, quantity }, "Stock adjustment failed");
    res.status(500).json({ error: "Erreur serveur lors de l'ajustement" });
  }
});

// ─── GET /api/stock/movements/:productId ────────────────────────────────────
router.get("/stock/movements/:productId", requireAuth, async (req, res): Promise<void> => {
  const movements = await db
    .select()
    .from(productAdjustmentsTable)
    .where(eq(productAdjustmentsTable.productId, req.params.productId))
    .orderBy(desc(productAdjustmentsTable.createdAt));

  res.json(
    movements.map((m) => ({
      ...m,
      createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : m.createdAt,
    }))
  );
});

// ─── GET /api/stock/summary ─────────────────────────────────────────────────
// Returns stockKg per product (lots + adjustments) for use anywhere
router.get("/stock/summary", requireAuth, async (_req, res): Promise<void> => {
  const lotSums = await db
    .select({
      productId: lotsTable.productId,
      total: sql<number>`COALESCE(SUM(${lotsTable.weightCurrent}), 0)`,
    })
    .from(lotsTable)
    .groupBy(lotsTable.productId);

  const adjSums = await db
    .select({
      productId: productAdjustmentsTable.productId,
      total: sql<number>`COALESCE(SUM(${productAdjustmentsTable.quantity}), 0)`,
    })
    .from(productAdjustmentsTable)
    .groupBy(productAdjustmentsTable.productId);

  const stockMap: Record<string, number> = {};
  for (const r of lotSums) {
    if (r.productId) stockMap[r.productId] = (stockMap[r.productId] ?? 0) + Number(r.total ?? 0);
  }
  for (const r of adjSums) {
    if (r.productId) stockMap[r.productId] = (stockMap[r.productId] ?? 0) + Number(r.total ?? 0);
  }
  // Clamp to >=0 to align with /api/products semantics (single source of truth)
  for (const id of Object.keys(stockMap)) {
    stockMap[id] = Math.max(0, Number(stockMap[id]!.toFixed(2)));
  }
  res.json(stockMap);
});

export default router;
