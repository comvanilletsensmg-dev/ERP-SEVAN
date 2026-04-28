import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, lotsTable, suppliersTable, stockMovementsTable } from "@workspace/db";
import { GetLotParams, UpdateLotBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

function formatLot(lot: typeof lotsTable.$inferSelect, supplier?: typeof suppliersTable.$inferSelect | null) {
  return {
    ...lot,
    createdAt: lot.createdAt.toISOString(),
    supplier: supplier ? { ...supplier, createdAt: supplier.createdAt.toISOString() } : undefined,
  };
}

router.get("/lots", requireAuth, async (_req, res): Promise<void> => {
  const lots = await db
    .select()
    .from(lotsTable)
    .leftJoin(suppliersTable, eq(lotsTable.supplierId, suppliersTable.id))
    .orderBy(lotsTable.createdAt);

  res.json(lots.map(({ lots: l, suppliers: s }) => formatLot(l, s)));
});

router.get("/lots/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetLotParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [result] = await db
    .select()
    .from(lotsTable)
    .leftJoin(suppliersTable, eq(lotsTable.supplierId, suppliersTable.id))
    .where(eq(lotsTable.id, params.data.id));

  if (!result) {
    res.status(404).json({ error: "Lot introuvable" });
    return;
  }

  res.json(formatLot(result.lots, result.suppliers));
});

router.put("/lots/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetLotParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateLotBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Fetch current lot to compute weight loss
  const [current] = await db.select().from(lotsTable).where(eq(lotsTable.id, params.data.id));
  if (!current) {
    res.status(404).json({ error: "Lot introuvable" });
    return;
  }

  const { weightCurrent, ...rest } = parsed.data;

  // If weightCurrent provided, record LOSS movement
  if (weightCurrent !== undefined && weightCurrent !== null) {
    const weightCurrentRounded = Math.round(weightCurrent * 100) / 100;
    const loss = Math.round((current.weightCurrent - weightCurrentRounded) * 100) / 100;

    if (loss > 0) {
      await db.insert(stockMovementsTable).values({
        lotId: current.id,
        type: "LOSS",
        quantity: loss,
        note: `Perte transformation lot ${current.code}: ${current.weightCurrent}kg → ${weightCurrentRounded}kg`,
      });

      console.log(`[STOCK] Movement LOSS: -${loss}kg for lot ${current.code} (transformation)`);
    }

    const [lot] = await db
      .update(lotsTable)
      .set({ ...rest, weightCurrent: weightCurrentRounded })
      .where(eq(lotsTable.id, params.data.id))
      .returning();

    const [supplier] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, lot.supplierId));
    console.log(`[LOT] Updated ${lot.code}: status=${lot.status}, weight=${lot.weightCurrent}kg, humidity=${lot.humidity}`);
    res.json(formatLot(lot, supplier));
    return;
  }

  // No weight change — just update fields
  const [lot] = await db
    .update(lotsTable)
    .set(rest)
    .where(eq(lotsTable.id, params.data.id))
    .returning();

  if (!lot) {
    res.status(404).json({ error: "Lot introuvable" });
    return;
  }

  const [supplier] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, lot.supplierId));
  console.log(`[LOT] Updated ${lot.code}: status=${lot.status}`);
  res.json(formatLot(lot, supplier));
});

export default router;
