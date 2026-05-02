import { Router, type IRouter } from "express";
import { eq, ilike, or } from "drizzle-orm";
import { db, productsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/products", requireAuth, async (req, res): Promise<void> => {
  const { category, search, availability } = req.query as Record<string, string>;

  let query = db.select().from(productsTable);

  const conditions: any[] = [];
  if (category && category !== "all") {
    conditions.push(eq(productsTable.category, category));
  }
  if (availability) {
    conditions.push(eq(productsTable.availability, availability));
  }
  if (search) {
    conditions.push(
      or(
        ilike(productsTable.reference, `%${search}%`),
        ilike(productsTable.name, `%${search}%`),
        ilike(productsTable.description, `%${search}%`),
        ilike(productsTable.aromaticProfile, `%${search}%`)
      )
    );
  }

  const products = await db.select().from(productsTable).orderBy(productsTable.category, productsTable.name);

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
    createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
    updatedAt: p.updatedAt instanceof Date ? p.updatedAt.toISOString() : p.updatedAt,
  })));
});

router.get("/products/:id", requireAuth, async (req, res): Promise<void> => {
  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, req.params.id));
  if (!product) { res.status(404).json({ error: "Produit introuvable" }); return; }
  res.json({ ...product, createdAt: product.createdAt.toISOString(), updatedAt: product.updatedAt.toISOString() });
});

router.delete("/products/:id", requireAuth, async (req, res): Promise<void> => {
  await db.delete(productsTable).where(eq(productsTable.id, req.params.id));
  res.json({ success: true });
});

export default router;
