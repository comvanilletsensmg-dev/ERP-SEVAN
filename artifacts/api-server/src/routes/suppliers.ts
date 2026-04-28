import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, suppliersTable } from "@workspace/db";
import { CreateSupplierBody, GetSupplierParams, UpdateSupplierBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/suppliers", requireAuth, async (_req, res): Promise<void> => {
  const suppliers = await db.select().from(suppliersTable).orderBy(suppliersTable.createdAt);
  res.json(
    suppliers.map((s) => ({
      ...s,
      createdAt: s.createdAt.toISOString(),
    }))
  );
});

router.post("/suppliers", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateSupplierBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [supplier] = await db.insert(suppliersTable).values(parsed.data).returning();
  res.status(201).json({
    ...supplier,
    createdAt: supplier.createdAt.toISOString(),
  });
});

router.get("/suppliers/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetSupplierParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [supplier] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, params.data.id));
  if (!supplier) {
    res.status(404).json({ error: "Fournisseur introuvable" });
    return;
  }

  res.json({ ...supplier, createdAt: supplier.createdAt.toISOString() });
});

router.put("/suppliers/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetSupplierParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateSupplierBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [supplier] = await db
    .update(suppliersTable)
    .set(parsed.data)
    .where(eq(suppliersTable.id, params.data.id))
    .returning();

  if (!supplier) {
    res.status(404).json({ error: "Fournisseur introuvable" });
    return;
  }

  res.json({ ...supplier, createdAt: supplier.createdAt.toISOString() });
});

export default router;
