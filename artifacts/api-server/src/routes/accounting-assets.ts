import { Router, type IRouter } from "express";
import { db, fixedAssetsTable, accountsTable, journalEntriesTable, journalLinesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

async function findAccountId(code: string): Promise<string | null> {
  const rows = await db.select().from(accountsTable).where(eq(accountsTable.code, code));
  return rows[0]?.id ?? null;
}

router.get("/assets", requireAuth, async (_req, res): Promise<void> => {
  const assets = await db.select().from(fixedAssetsTable).orderBy(fixedAssetsTable.name);
  res.json(assets);
});

router.post("/assets", requireAuth, async (req, res): Promise<void> => {
  const { name, category, value, residualValue, startDate, durationMonths, currency, notes } = req.body;
  if (!name || !value || !startDate || !durationMonths) {
    res.status(400).json({ error: "name, value, startDate, durationMonths required" });
    return;
  }
  const [asset] = await db.insert(fixedAssetsTable).values({
    name,
    category: category ?? "equipment",
    value: Number(value),
    residualValue: Number(residualValue ?? 0),
    accumulatedDepreciation: 0,
    startDate: new Date(startDate),
    durationMonths: Number(durationMonths),
    currency: currency ?? "MGA",
    notes,
    status: "active",
  }).returning();
  res.status(201).json(asset);
});

// Post one month depreciation
router.post("/assets/:id/depreciate", requireAuth, async (req, res): Promise<void> => {
  const { id } = req.params;
  const [asset] = await db.select().from(fixedAssetsTable).where(eq(fixedAssetsTable.id, id));
  if (!asset) { res.status(404).json({ error: "Asset not found" }); return; }
  if (asset.status !== "active") { res.status(400).json({ error: "Asset is not active" }); return; }

  const monthlyDepreciation = (asset.value - asset.residualValue) / asset.durationMonths;
  const newAccumulated = asset.accumulatedDepreciation + monthlyDepreciation;
  const isFullyDepreciated = newAccumulated >= (asset.value - asset.residualValue);

  const [updated] = await db.update(fixedAssetsTable)
    .set({
      accumulatedDepreciation: newAccumulated,
      status: isFullyDepreciated ? "fully_depreciated" : "active",
    })
    .where(eq(fixedAssetsTable.id, id))
    .returning();

  // Post journal entry: Debit 681 (dotation amortissement) / Credit 281 (amortissement)
  try {
    const debitId = await findAccountId("681");
    const creditId = await findAccountId("281");
    if (debitId && creditId) {
      const [entry] = await db.insert(journalEntriesTable).values({
        date: new Date(),
        reference: `AMORT-${asset.name.slice(0, 12).toUpperCase()}`,
        description: `Dotation amortissement — ${asset.name}`,
      }).returning();
      await db.insert(journalLinesTable).values([
        { entryId: entry.id, accountId: debitId, debit: monthlyDepreciation, credit: 0 },
        { entryId: entry.id, accountId: creditId, debit: 0, credit: monthlyDepreciation },
      ]);
    }
  } catch (_) {}

  res.json({ asset: updated, monthlyDepreciation, totalAccumulated: newAccumulated });
});

export default router;
