import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  salesTable,
  saleItemsTable,
  clientsTable,
  lotsTable,
  suppliersTable,
  stockMovementsTable,
  journalEntriesTable,
  journalLinesTable,
  accountsTable,
} from "@workspace/db";
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
        ? {
            ...l,
            createdAt: l.createdAt.toISOString(),
            supplier: s ? { ...s, createdAt: s.createdAt.toISOString() } : undefined,
          }
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

  const result = await Promise.all(sales.map(async ({ sales: s }) => buildSaleResponse(s.id)));
  res.json(result.filter(Boolean));
});

router.post("/sales", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateSaleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { items, clientId, currency, incoterm } = parsed.data;

  if (!items || items.length === 0) {
    res.status(400).json({ error: "Au moins un article est requis" });
    return;
  }

  // ------------------------------------------------------------------
  // BUSINESS RULES: validate all items BEFORE any DB writes
  // ------------------------------------------------------------------
  for (const item of items) {
    const [lot] = await db.select().from(lotsTable).where(eq(lotsTable.id, item.lotId));

    if (!lot) {
      res.status(400).json({ error: `Lot ${item.lotId} introuvable` });
      return;
    }

    if (lot.status !== "ready") {
      res.status(400).json({
        error: `Le lot ${lot.code} n'est pas prêt à la vente (statut actuel: ${lot.status}). Statut requis: "ready".`,
      });
      return;
    }

    if (lot.weightCurrent < item.quantity) {
      res.status(400).json({
        error: `Stock insuffisant pour le lot ${lot.code}: disponible ${lot.weightCurrent}kg, demandé ${item.quantity}kg.`,
      });
      return;
    }

    console.log(`[SALE] Lot ${lot.code} validé: status=ready, stock=${lot.weightCurrent}kg >= requis=${item.quantity}kg`);
  }

  // ------------------------------------------------------------------
  // Compute total amount
  // ------------------------------------------------------------------
  const totalAmount = Math.round(items.reduce((sum, i) => sum + i.quantity * i.price, 0) * 100) / 100;

  // ------------------------------------------------------------------
  // Create the sale
  // ------------------------------------------------------------------
  const [sale] = await db
    .insert(salesTable)
    .values({ clientId, currency, incoterm, totalAmount })
    .returning();

  console.log(`[SALE] Created sale ${sale.id} — total ${totalAmount} ${currency}`);

  // ------------------------------------------------------------------
  // Process each item: decrement stock + OUT movement
  // ------------------------------------------------------------------
  for (const item of items) {
    const [lot] = await db.select().from(lotsTable).where(eq(lotsTable.id, item.lotId));

    // Insert sale item
    await db.insert(saleItemsTable).values({ saleId: sale.id, lotId: item.lotId, quantity: item.quantity, price: item.price });

    // Decrement lot weight
    const newWeight = Math.round((lot.weightCurrent - item.quantity) * 100) / 100;
    const newStatus = newWeight <= 0 ? "sold" : lot.status;
    await db.update(lotsTable).set({ weightCurrent: newWeight, status: newStatus }).where(eq(lotsTable.id, item.lotId));

    // Create OUT stock movement
    await db.insert(stockMovementsTable).values({
      lotId: item.lotId,
      type: "OUT",
      quantity: item.quantity,
      note: `Vente ${sale.id.slice(0, 8).toUpperCase()} — ${item.quantity}kg @ ${item.price} ${currency}`,
    });

    console.log(`[STOCK] Movement OUT: -${item.quantity}kg for lot ${lot.code} (new weight: ${newWeight}kg, status: ${newStatus})`);
  }

  // ------------------------------------------------------------------
  // Automatic accounting: debit client (411), credit revenue (701)
  // ------------------------------------------------------------------
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
      { entryId: entry.id, accountId: clientAccount.id, debit: totalAmount, credit: 0 },
      { entryId: entry.id, accountId: revenueAccount.id, debit: 0, credit: totalAmount },
    ]);

    console.log(`[ACCOUNTING] Journal entry ${entry.reference}: D411 ${totalAmount} / C701 ${totalAmount}`);
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
