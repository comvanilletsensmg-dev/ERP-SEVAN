import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, lotsTable, suppliersTable } from "@workspace/db";
import { CreateLotBody, GetLotParams, UpdateLotBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/lots", requireAuth, async (_req, res): Promise<void> => {
  const lots = await db
    .select()
    .from(lotsTable)
    .leftJoin(suppliersTable, eq(lotsTable.supplierId, suppliersTable.id))
    .orderBy(lotsTable.createdAt);

  res.json(
    lots.map(({ lots: l, suppliers: s }) => ({
      ...l,
      createdAt: l.createdAt.toISOString(),
      supplier: s ? { ...s, createdAt: s.createdAt.toISOString() } : undefined,
    }))
  );
});

router.post("/lots", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateLotBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [lot] = await db.insert(lotsTable).values(parsed.data).returning();
  const [supplier] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, lot.supplierId));

  res.status(201).json({
    ...lot,
    createdAt: lot.createdAt.toISOString(),
    supplier: supplier ? { ...supplier, createdAt: supplier.createdAt.toISOString() } : undefined,
  });
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

  res.json({
    ...result.lots,
    createdAt: result.lots.createdAt.toISOString(),
    supplier: result.suppliers ? { ...result.suppliers, createdAt: result.suppliers.createdAt.toISOString() } : undefined,
  });
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

  const [lot] = await db
    .update(lotsTable)
    .set(parsed.data)
    .where(eq(lotsTable.id, params.data.id))
    .returning();

  if (!lot) {
    res.status(404).json({ error: "Lot introuvable" });
    return;
  }

  const [supplier] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, lot.supplierId));
  res.json({
    ...lot,
    createdAt: lot.createdAt.toISOString(),
    supplier: supplier ? { ...supplier, createdAt: supplier.createdAt.toISOString() } : undefined,
  });
});

export default router;
