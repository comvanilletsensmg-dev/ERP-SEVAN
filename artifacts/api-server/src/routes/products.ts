import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, productsTable, lotsTable, productAdjustmentsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { requireRole } from "../middlewares/roles";

const router: IRouter = Router();
const ADMIN_ROLES = ["SUPER_ADMIN", "LOGISTICS_MANAGER"] as const;

// Compute stock map: productId -> totalKg (sum of lots.weightCurrent + adjustments)
async function computeStockMap(): Promise<Record<string, number>> {
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

  const map: Record<string, number> = {};
  for (const r of lotSums) {
    if (r.productId) map[r.productId] = (map[r.productId] ?? 0) + Number(r.total ?? 0);
  }
  for (const r of adjSums) {
    if (r.productId) map[r.productId] = (map[r.productId] ?? 0) + Number(r.total ?? 0);
  }
  return map;
}

router.get("/products", requireAuth, async (req, res): Promise<void> => {
  const { category, search, availability } = req.query as Record<string, string>;

  const products = await db.select().from(productsTable).orderBy(productsTable.category, productsTable.name);
  const stockMap = await computeStockMap();

  let result = products;
  if (category && category !== "all") result = result.filter(p => p.category === category);
  if (availability) result = result.filter(p => p.availability === availability);
  if (search) {
    const s = search.toLowerCase();
    result = result.filter(p =>
      p.reference.toLowerCase().includes(s) ||
      p.name.toLowerCase().includes(s) ||
      (p.description ?? "").toLowerCase().includes(s) ||
      (p.aromaticProfile ?? "").toLowerCase().includes(s)
    );
  }

  res.json(result.map(p => ({
    ...p,
    stockKg: Math.max(0, Number((stockMap[p.id] ?? 0).toFixed(2))),
    createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
    updatedAt: p.updatedAt instanceof Date ? p.updatedAt.toISOString() : p.updatedAt,
  })));
});

router.get("/products/:id", requireAuth, async (req, res): Promise<void> => {
  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, req.params.id));
  if (!product) { res.status(404).json({ error: "Produit introuvable" }); return; }
  const stockMap = await computeStockMap();
  res.json({
    ...product,
    stockKg: Math.max(0, Number((stockMap[product.id] ?? 0).toFixed(2))),
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  });
});

router.delete("/products/:id", requireAuth, requireRole(...ADMIN_ROLES), async (req, res): Promise<void> => {
  await db.delete(productsTable).where(eq(productsTable.id, req.params.id));
  req.log.info({ productId: req.params.id, by: (req as any).session?.userId }, "Product deleted");
  res.json({ success: true });
});

export default router;
