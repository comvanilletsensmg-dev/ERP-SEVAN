import { Router, type IRouter } from "express";
import { db, purchasesTable, suppliersTable, journalEntriesTable, journalLinesTable, accountsTable } from "@workspace/db";
import { CreatePurchaseBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

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

  const [purchase] = await db.insert(purchasesTable).values(parsed.data).returning();

  // Automatic accounting: debit stock (31), credit supplier (401)
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
      {
        entryId: entry.id,
        accountId: stockAccount.id,
        debit: parsed.data.totalAmount,
        credit: 0,
      },
      {
        entryId: entry.id,
        accountId: supplierAccount.id,
        debit: 0,
        credit: parsed.data.totalAmount,
      },
    ]);
  }

  const [supplier] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, purchase.supplierId));

  res.status(201).json({
    ...purchase,
    createdAt: purchase.createdAt.toISOString(),
    supplier: supplier ? { ...supplier, createdAt: supplier.createdAt.toISOString() } : undefined,
  });
});

export default router;
