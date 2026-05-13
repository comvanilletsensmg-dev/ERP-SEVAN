import { Router, type IRouter } from "express";
import { db, purchasesTable, suppliersTable, lotsTable, stockMovementsTable, journalEntriesTable, journalLinesTable, accountsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { eq, sql } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

function generateLotCode(): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `VAN-${year}-${rand}`;
}

// ─── GET /purchases/analytics ─────────────────────────────────────────────────
router.get("/purchases/analytics", requireAuth, async (_req, res): Promise<void> => {
  const [kpiRow] = (await db.execute(sql`
    SELECT
      COUNT(*)::int                          AS nb,
      COALESCE(SUM(total_amount), 0)         AS total,
      COALESCE(AVG(price_per_kg), 0)         AS avg_price,
      COALESCE(SUM(weight), 0)               AS kg_total,
      COALESCE(MIN(price_per_kg), 0)         AS prix_min,
      COALESCE(MAX(price_per_kg), 0)         AS prix_max,
      COALESCE(AVG(humidity), 0)             AS avg_humidity,
      COUNT(DISTINCT supplier_id)::int       AS nb_suppliers
    FROM purchases
  `)).rows as any[];

  const monthly = (await db.execute(sql`
    SELECT
      TO_CHAR(created_at, 'YYYY-MM')   AS month,
      TO_CHAR(created_at, 'Mon YY')    AS label,
      ROUND(AVG(price_per_kg)::numeric, 0) AS avg_price,
      ROUND(SUM(weight)::numeric, 1)   AS kg,
      COUNT(*)::int                    AS nb
    FROM purchases
    WHERE created_at >= NOW() - INTERVAL '12 months'
    GROUP BY TO_CHAR(created_at, 'YYYY-MM'), TO_CHAR(created_at, 'Mon YY')
    ORDER BY month
  `)).rows;

  const topSuppliers = (await db.execute(sql`
    SELECT
      s.name,
      s.supplier_code  AS code,
      s.region,
      COUNT(p.id)::int AS nb,
      ROUND(SUM(p.total_amount)::numeric, 0) AS total,
      ROUND(SUM(p.weight)::numeric, 1)       AS kg,
      ROUND(AVG(p.price_per_kg)::numeric, 0) AS avg_price,
      ROUND(AVG(p.humidity)::numeric, 1)     AS avg_humidity
    FROM purchases p
    JOIN suppliers s ON s.id = p.supplier_id
    GROUP BY s.id, s.name, s.supplier_code, s.region
    ORDER BY total DESC
    LIMIT 5
  `)).rows;

  // Quality alerts: humidity > 45%
  const qualityAlerts = (await db.execute(sql`
    SELECT p.id, p.weight, p.price_per_kg, p.humidity, p.total_amount, p.created_at,
           s.name AS supplier_name
    FROM purchases p
    LEFT JOIN suppliers s ON s.id = p.supplier_id
    WHERE p.humidity > 45
    ORDER BY p.created_at DESC
    LIMIT 5
  `)).rows;

  // Price alerts: price > avg * 1.25
  const priceAlerts = (await db.execute(sql`
    WITH avg_p AS (SELECT AVG(price_per_kg) AS avg FROM purchases)
    SELECT p.id, p.weight, p.price_per_kg, p.humidity, p.total_amount, p.created_at,
           s.name AS supplier_name, a.avg AS avg_price
    FROM purchases p
    LEFT JOIN suppliers s ON s.id = p.supplier_id
    CROSS JOIN avg_p a
    WHERE p.price_per_kg > a.avg * 1.25
    ORDER BY p.price_per_kg DESC
    LIMIT 5
  `)).rows;

  res.json({
    kpis: {
      nb: Number(kpiRow?.nb ?? 0),
      total: Number(kpiRow?.total ?? 0),
      avgPrice: Number(kpiRow?.avg_price ?? 0),
      kgTotal: Number(kpiRow?.kg_total ?? 0),
      prixMin: Number(kpiRow?.prix_min ?? 0),
      prixMax: Number(kpiRow?.prix_max ?? 0),
      avgHumidity: Number(kpiRow?.avg_humidity ?? 0),
      nbSuppliers: Number(kpiRow?.nb_suppliers ?? 0),
    },
    monthly,
    topSuppliers,
    alerts: {
      quality: qualityAlerts,
      price: priceAlerts,
    },
  });
});

// ─── GET /purchases ───────────────────────────────────────────────────────────
router.get("/purchases", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db.execute(sql`
    SELECT
      p.id, p.supplier_id, p.total_amount, p.payment_method,
      p.created_at, p.weight, p.price_per_kg, p.humidity, p.lot_id,
      s.name        AS supplier_name,
      s.supplier_code,
      s.region      AS supplier_region,
      l.code        AS lot_code,
      l.status      AS lot_status
    FROM purchases p
    LEFT JOIN suppliers s ON s.id = p.supplier_id
    LEFT JOIN lots      l ON l.id = p.lot_id
    ORDER BY p.created_at DESC
  `);

  res.json(rows.rows);
});

// ─── POST /purchases ──────────────────────────────────────────────────────────
const createSchema = z.object({
  supplierId: z.string().min(1),
  weight: z.number().min(0.1),
  pricePerKg: z.number().min(1),
  totalAmount: z.number().min(1),
  paymentMethod: z.string().min(1),
  humidity: z.number().min(0).max(100),
});

router.post("/purchases", requireAuth, async (req, res): Promise<void> => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: String(parsed.error) });
    return;
  }

  const { supplierId, weight, pricePerKg, totalAmount, paymentMethod, humidity } = parsed.data;

  // 1. Create the purchase
  const [purchase] = await db
    .insert(purchasesTable)
    .values({ supplierId, weight, pricePerKg, totalAmount, paymentMethod, humidity })
    .returning();

  // 2. Generate unique lot code
  let lotCode = generateLotCode();
  for (let i = 0; i < 5; i++) {
    const existing = await db.select().from(lotsTable).where(eq(lotsTable.code, lotCode));
    if (existing.length === 0) break;
    lotCode = generateLotCode();
  }

  // 3. Create lot (status = "raw")
  const weightRounded = Math.round(weight * 100) / 100;
  const [lot] = await db
    .insert(lotsTable)
    .values({ code: lotCode, supplierId, purchaseId: purchase.id, weightInitial: weightRounded, weightCurrent: weightRounded, humidity, status: "raw" })
    .returning();

  // 4. Link lot to purchase
  await db.update(purchasesTable).set({ lotId: lot.id }).where(eq(purchasesTable.id, purchase.id));

  // 5. Stock movement IN
  await db.insert(stockMovementsTable).values({
    lotId: lot.id, type: "IN", quantity: weightRounded,
    note: `Achat ${purchase.id.slice(0, 8).toUpperCase()} — fournisseur ${supplierId}`,
  });

  // 6. Accounting: D601 + D44566 / C401
  const [achat601]  = await db.select().from(accountsTable).where(eq(accountsTable.code, "601"));
  const [tva44566]  = await db.select().from(accountsTable).where(eq(accountsTable.code, "44566"));
  const [frn401]    = await db.select().from(accountsTable).where(eq(accountsTable.code, "401"));

  if (achat601 && frn401) {
    const [entry] = await db.insert(journalEntriesTable).values({
      date: new Date(),
      reference: `ACH-${purchase.id.slice(0, 8).toUpperCase()}`,
    }).returning();

    const tvaAmount = Math.round(totalAmount * 0.2);
    const htAmount  = totalAmount - tvaAmount;

    const lines: any[] = [
      { entryId: entry.id, accountId: achat601.id, debit: htAmount,  credit: 0 },
      { entryId: entry.id, accountId: frn401.id,   debit: 0,         credit: totalAmount },
    ];
    if (tva44566) {
      lines.splice(1, 0, { entryId: entry.id, accountId: tva44566.id, debit: tvaAmount, credit: 0 });
    }
    await db.insert(journalLinesTable).values(lines);
  }

  const [supplier] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, supplierId));

  res.status(201).json({
    purchase: { ...purchase, lotId: lot.id, createdAt: purchase.createdAt.toISOString(),
      supplier: supplier ? { ...supplier, createdAt: supplier.createdAt.toISOString() } : undefined },
    lot: { ...lot, createdAt: lot.createdAt.toISOString() },
  });
});

export default router;
