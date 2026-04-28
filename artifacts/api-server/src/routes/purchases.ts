import { Router, type IRouter } from "express";
import { db, purchasesTable, suppliersTable, lotsTable, stockMovementsTable, journalEntriesTable, journalLinesTable, accountsTable } from "@workspace/db";
import { CreatePurchaseBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { eq, sql } from "drizzle-orm";

const router: IRouter = Router();

function generateLotCode(): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `VAN-${year}-${rand}`;
}

router.get("/purchases", requireAuth, async (_req, res): Promise<void> => {
  const purchases = await db
    .select()
    .from(purchasesTable)
    .leftJoin(suppliersTable, eq(purchasesTable.supplierId, suppliersTable.id))
    .orderBy(purchasesTable.createdAt);

  res.json(
    purchases.map(({ purchases: p, suppliers: s }) => ({
      ...p,
      createdAt: p.createdAt.toISOString(),
      supplier: s ? { ...s, createdAt: s.createdAt.toISOString() } : undefined,
    }))
  );
});

router.post("/purchases", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreatePurchaseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { supplierId, weight, pricePerKg, totalAmount, paymentMethod, humidity } = parsed.data;

  // 1. Create the purchase
  const [purchase] = await db
    .insert(purchasesTable)
    .values({ supplierId, weight, pricePerKg, totalAmount, paymentMethod, humidity })
    .returning();

  console.log(`[PURCHASE] Created purchase ${purchase.id} for ${weight}kg at ${pricePerKg} MGA/kg`);

  // 2. Generate unique lot code (retry if collision)
  let lotCode = generateLotCode();
  let tries = 0;
  while (tries < 5) {
    const existing = await db.select().from(lotsTable).where(eq(lotsTable.code, lotCode));
    if (existing.length === 0) break;
    lotCode = generateLotCode();
    tries++;
  }

  // 3. Create the lot (status = "raw")
  const weightRounded = Math.round(weight * 100) / 100;
  const [lot] = await db
    .insert(lotsTable)
    .values({
      code: lotCode,
      supplierId,
      purchaseId: purchase.id,
      weightInitial: weightRounded,
      weightCurrent: weightRounded,
      humidity,
      status: "raw",
    })
    .returning();

  console.log(`[LOT] Created lot ${lot.code} (${lot.id}) — status: raw, weight: ${weightRounded}kg`);

  // 4. Link the lot back to the purchase
  await db.update(purchasesTable).set({ lotId: lot.id }).where(eq(purchasesTable.id, purchase.id));

  // 5. Create stock movement IN
  await db.insert(stockMovementsTable).values({
    lotId: lot.id,
    type: "IN",
    quantity: weightRounded,
    note: `Achat ${purchase.id.slice(0, 8).toUpperCase()} — fournisseur ${supplierId}`,
  });

  console.log(`[STOCK] Movement IN: +${weightRounded}kg for lot ${lot.code}`);

  // 6. Automatic accounting: debit stock (31), credit supplier (401)
  const [stockAccount] = await db.select().from(accountsTable).where(eq(accountsTable.code, "31"));
  const [supplierAccount] = await db.select().from(accountsTable).where(eq(accountsTable.code, "401"));

  if (stockAccount && supplierAccount) {
    const [entry] = await db
      .insert(journalEntriesTable)
      .values({
        date: new Date(),
        reference: `ACHAT-${purchase.id.slice(0, 8).toUpperCase()}`,
      })
      .returning();

    await db.insert(journalLinesTable).values([
      { entryId: entry.id, accountId: stockAccount.id, debit: totalAmount, credit: 0 },
      { entryId: entry.id, accountId: supplierAccount.id, debit: 0, credit: totalAmount },
    ]);

    console.log(`[ACCOUNTING] Journal entry ${entry.reference}: D31 ${totalAmount} / C401 ${totalAmount}`);
  }

  const [supplier] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, supplierId));

  res.status(201).json({
    purchase: {
      ...purchase,
      lotId: lot.id,
      createdAt: purchase.createdAt.toISOString(),
      supplier: supplier ? { ...supplier, createdAt: supplier.createdAt.toISOString() } : undefined,
    },
    lot: { ...lot, createdAt: lot.createdAt.toISOString() },
  });
});

export default router;
