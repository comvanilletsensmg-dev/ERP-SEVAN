import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, salesTable, saleItemsTable, clientsTable, lotsTable, suppliersTable, journalEntriesTable, journalLinesTable, accountsTable } from "@workspace/db";
import { CreateSaleBody, GetSaleParams } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

async function buildSaleResponse(saleId: string) {
  const [result] = await db
    .select()
    .from(salesTable)
    .leftJoin(clientsTable, eq(salesTable.clientId, clientsTable.id))
    .where(eq(salesTable.id, saleId));

  if (!result) return null;

  const items = await db
    .select()
    .from(saleItemsTable)
    .leftJoin(lotsTable, eq(saleItemsTable.lotId, lotsTable.id))
    .leftJoin(suppliersTable, eq(lotsTable.supplierId, suppliersTable.id))
    .where(eq(saleItemsTable.saleId, saleId));

  return {
    ...result.sales,
    createdAt: result.sales.createdAt.toISOString(),
    client: result.clients || undefined,
    items: items.map(({ sale_items: si, lots: l, suppliers: s }) => ({
      ...si,
      lot: l
        ? { ...l, createdAt: l.createdAt.toISOString(), supplier: s ? { ...s, createdAt: s.createdAt.toISOString() } : undefined }
        : undefined,
    })),
  };
}

router.get("/sales", requireAuth, async (_req, res): Promise<void> => {
  const sales = await db
    .select()
    .from(salesTable)
    .leftJoin(clientsTable, eq(salesTable.clientId, clientsTable.id))
    .orderBy(salesTable.createdAt);

  const result = await Promise.all(
    sales.map(async ({ sales: s }) => buildSaleResponse(s.id))
  );

  res.json(result.filter(Boolean));
});

router.post("/sales", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateSaleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { items, ...saleData } = parsed.data;

  const [sale] = await db.insert(salesTable).values(saleData).returning();

  if (items && items.length > 0) {
    await db.insert(saleItemsTable).values(items.map((item) => ({ ...item, saleId: sale.id })));
  }

  // Automatic accounting: debit client (411), credit revenue (701)
  const [clientAccount] = await db.select().from(accountsTable).where(eq(accountsTable.code, "411"));
  const [revenueAccount] = await db.select().from(accountsTable).where(eq(accountsTable.code, "701"));

  if (clientAccount && revenueAccount) {
    const [entry] = await db
      .insert(journalEntriesTable)
      .values({
        date: new Date(),
        reference: `VENTE-${sale.id.slice(0, 8).toUpperCase()}`,
      })
      .returning();

    await db.insert(journalLinesTable).values([
      {
        entryId: entry.id,
        accountId: clientAccount.id,
        debit: saleData.totalAmount,
        credit: 0,
      },
      {
        entryId: entry.id,
        accountId: revenueAccount.id,
        debit: 0,
        credit: saleData.totalAmount,
      },
    ]);
  }

  const full = await buildSaleResponse(sale.id);
  res.status(201).json(full);
});

router.get("/sales/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetSaleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const sale = await buildSaleResponse(params.data.id);
  if (!sale) {
    res.status(404).json({ error: "Vente introuvable" });
    return;
  }

  res.json(sale);
});

export default router;
