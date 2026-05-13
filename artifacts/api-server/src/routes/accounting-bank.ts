import { Router, type IRouter } from "express";
import { db, bankTransactionsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/bank", requireAuth, async (_req, res): Promise<void> => {
  const txns = await db.select().from(bankTransactionsTable).orderBy(desc(bankTransactionsTable.date));
  res.json(txns);
});

router.post("/bank", requireAuth, async (req, res): Promise<void> => {
  const { date, description, amount, currency, reference } = req.body;
  if (!date || !description || amount === undefined) { res.status(400).json({ error: "date, description, amount required" }); return; }
  const [txn] = await db.insert(bankTransactionsTable).values({
    date: new Date(date),
    description,
    amount: Number(amount),
    currency: currency ?? "MGA",
    reference,
  }).returning();
  res.status(201).json(txn);
});

// CSV import — expects body: { rows: [{date,description,amount,reference}] }
router.post("/bank/import", requireAuth, async (req, res): Promise<void> => {
  const { rows } = req.body;
  if (!Array.isArray(rows) || rows.length === 0) { res.status(400).json({ error: "rows array required" }); return; }
  const inserted = await db.insert(bankTransactionsTable).values(
    rows.map((r: any) => ({
      date: new Date(r.date),
      description: r.description ?? "",
      amount: Number(r.amount),
      currency: r.currency ?? "MGA",
      reference: r.reference ?? null,
    }))
  ).returning();
  res.status(201).json({ imported: inserted.length, rows: inserted });
});

router.put("/bank/:id/match", requireAuth, async (req, res): Promise<void> => {
  const { id } = req.params as Record<string, string>;
  const { matchedRef } = req.body;
  const [updated] = await db.update(bankTransactionsTable)
    .set({ matched: true, matchedRef })
    .where(eq(bankTransactionsTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Transaction not found" }); return; }
  res.json(updated);
});

router.put("/bank/:id/unmatch", requireAuth, async (req, res): Promise<void> => {
  const { id } = req.params as Record<string, string>;
  const [updated] = await db.update(bankTransactionsTable)
    .set({ matched: false, matchedRef: null })
    .where(eq(bankTransactionsTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Transaction not found" }); return; }
  res.json(updated);
});

export default router;
