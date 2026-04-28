import { Router, type IRouter } from "express";
import { db, lotsTable, lotCostsTable, purchasesTable, journalEntriesTable, journalLinesTable, accountsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

const safe = (c: any) => ({ ...c, createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt, updatedAt: c.updatedAt instanceof Date ? c.updatedAt.toISOString() : c.updatedAt });

// Get costs for a lot
router.get("/lots/:id/costs", requireAuth, async (req, res): Promise<void> => {
  const costs = await db.select().from(lotCostsTable).where(eq(lotCostsTable.lotId, req.params.id)).orderBy(desc(lotCostsTable.updatedAt));
  res.json(costs.map(safe));
});

// Calculate or update costs for a lot
router.post("/lots/:id/costs", requireAuth, async (req, res): Promise<void> => {
  const { id: lotId } = req.params;

  const [lot] = await db.select().from(lotsTable).where(eq(lotsTable.id, lotId));
  if (!lot) { res.status(404).json({ error: "Lot introuvable" }); return; }

  // Fetch linked purchase cost
  const [purchase] = await db.select().from(purchasesTable).where(eq(purchasesTable.lotId, lotId));
  const autoPurchaseCost = purchase ? purchase.totalAmount : 0;

  const { processCost = 0, transportCost = 0, notes } = req.body;
  const purchaseCost = req.body.purchaseCost ?? autoPurchaseCost;
  const totalCost = Number(purchaseCost) + Number(processCost) + Number(transportCost);
  const costPerKg = lot.weightCurrent > 0 ? totalCost / lot.weightCurrent : 0;

  // Upsert — update existing or create new
  const existing = await db.select().from(lotCostsTable).where(eq(lotCostsTable.lotId, lotId));

  let cost;
  if (existing.length > 0) {
    [cost] = await db.update(lotCostsTable).set({
      purchaseCost, processCost: Number(processCost), transportCost: Number(transportCost),
      totalCost, costPerKg, notes: notes ?? null, updatedAt: new Date(),
    }).where(eq(lotCostsTable.lotId, lotId)).returning();
  } else {
    [cost] = await db.insert(lotCostsTable).values({
      lotId, purchaseCost, processCost: Number(processCost), transportCost: Number(transportCost),
      totalCost, costPerKg, notes: notes ?? null,
    }).returning();
  }

  // Auto-post accounting entry if transport cost > 0: Débit 6xx / Crédit 401
  if (Number(transportCost) > 0) {
    const [acc602] = await db.select().from(accountsTable).where(eq(accountsTable.code, "602"));
    const [acc401] = await db.select().from(accountsTable).where(eq(accountsTable.code, "401"));
    if (acc602 && acc401) {
      const [entry] = await db.insert(journalEntriesTable).values({
        date: new Date(), reference: `TRANSPORT-${lot.code}`,
        description: `Frais de transport — lot ${lot.code}`,
      }).returning();
      await db.insert(journalLinesTable).values([
        { entryId: entry.id, accountId: acc602.id, label: `Transport lot ${lot.code}`, debit: Number(transportCost), credit: 0 },
        { entryId: entry.id, accountId: acc401.id, label: `Fournisseur transport ${lot.code}`, debit: 0, credit: Number(transportCost) },
      ]);
    }
  }

  res.json(safe(cost));
});

export default router;
