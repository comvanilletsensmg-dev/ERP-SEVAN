import { Router, type IRouter } from "express";
import { db, quotesTable, quoteItemsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { requireRole } from "../middlewares/roles";

const router: IRouter = Router();
const CRM_ROLES = ["SUPER_ADMIN", "COMMERCIAL", "ACCOUNTANT"] as const;
const CRM_WRITE = ["SUPER_ADMIN", "COMMERCIAL"] as const;

const safe = (q: any) => ({
  ...q,
  createdAt: q.createdAt instanceof Date ? q.createdAt.toISOString() : q.createdAt,
  updatedAt: q.updatedAt instanceof Date ? q.updatedAt.toISOString() : q.updatedAt,
  validUntil: q.validUntil instanceof Date ? q.validUntil.toISOString() : q.validUntil,
});

async function getNextQuoteNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const quotes = await db.select({ number: quotesTable.number }).from(quotesTable);
  const yearQuotes = quotes.filter(q => q.number.startsWith(`DEV-${year}-`));
  const seq = yearQuotes.length + 1;
  return `DEV-${year}-${String(seq).padStart(4, "0")}`;
}

router.get("/crm/quotes", requireAuth, requireRole(...CRM_ROLES), async (_req, res): Promise<void> => {
  const quotes = await db.select().from(quotesTable).orderBy(desc(quotesTable.createdAt));
  const items = await db.select().from(quoteItemsTable);
  const result = quotes.map(q => safe({ ...q, items: items.filter(i => i.quoteId === q.id) }));
  res.json(result);
});

router.get("/crm/quotes/:id", requireAuth, requireRole(...CRM_ROLES), async (req, res): Promise<void> => {
  const [quote] = await db.select().from(quotesTable).where(eq(quotesTable.id, req.params.id));
  if (!quote) { res.status(404).json({ error: "Devis introuvable" }); return; }
  const items = await db.select().from(quoteItemsTable).where(eq(quoteItemsTable.quoteId, quote.id));
  res.json(safe({ ...quote, items }));
});

router.post("/crm/quotes", requireAuth, requireRole(...CRM_WRITE), async (req, res): Promise<void> => {
  const { clientId, dealId, currency, items: rawItems, notes, validUntil } = req.body;
  if (!clientId || !rawItems?.length) { res.status(400).json({ error: "clientId et items requis" }); return; }

  const items: Array<{ description: string; quantity: number; unitPrice: number; lotId?: string }> = rawItems;
  const totalHT = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const tva = 0; // export 0%
  const totalTTC = totalHT + tva;

  // Block if >10000 USD and not SUPER_ADMIN
  if (totalHT > 10000 && req.currentUser?.role !== "SUPER_ADMIN") {
    res.status(403).json({ error: "Devis > 10 000 USD — validation Super Admin requise" });
    return;
  }

  const number = await getNextQuoteNumber();
  const validUntilDate = validUntil ? new Date(validUntil) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const [quote] = await db.insert(quotesTable).values({
    number, clientId, dealId: dealId ?? null, totalHT, tva, totalTTC,
    currency: currency ?? "USD", status: "draft", validUntil: validUntilDate,
    notes: notes ?? null,
  }).returning();

  const insertedItems = await db.insert(quoteItemsTable).values(
    items.map(i => ({
      quoteId: quote.id, lotId: i.lotId ?? null,
      description: i.description, quantity: i.quantity,
      unitPrice: i.unitPrice, total: i.quantity * i.unitPrice,
    }))
  ).returning();

  res.status(201).json(safe({ ...quote, items: insertedItems }));
});

router.patch("/crm/quotes/:id/send", requireAuth, requireRole(...CRM_WRITE), async (req, res): Promise<void> => {
  const [updated] = await db.update(quotesTable).set({ status: "sent", updatedAt: new Date() })
    .where(eq(quotesTable.id, req.params.id)).returning();
  if (!updated) { res.status(404).json({ error: "Devis introuvable" }); return; }
  res.json(safe(updated));
});

router.patch("/crm/quotes/:id/accept", requireAuth, requireRole(...CRM_WRITE), async (req, res): Promise<void> => {
  const [updated] = await db.update(quotesTable).set({ status: "accepted", updatedAt: new Date() })
    .where(eq(quotesTable.id, req.params.id)).returning();
  if (!updated) { res.status(404).json({ error: "Devis introuvable" }); return; }
  res.json(safe(updated));
});

router.patch("/crm/quotes/:id/reject", requireAuth, requireRole(...CRM_WRITE), async (req, res): Promise<void> => {
  const [updated] = await db.update(quotesTable).set({ status: "rejected", updatedAt: new Date() })
    .where(eq(quotesTable.id, req.params.id)).returning();
  if (!updated) { res.status(404).json({ error: "Devis introuvable" }); return; }
  res.json(safe(updated));
});

router.delete("/crm/quotes/:id", requireAuth, requireRole("SUPER_ADMIN", "COMMERCIAL"), async (req, res): Promise<void> => {
  await db.delete(quoteItemsTable).where(eq(quoteItemsTable.quoteId, req.params.id));
  const deleted = await db.delete(quotesTable).where(eq(quotesTable.id, req.params.id)).returning();
  if (!deleted.length) { res.status(404).json({ error: "Devis introuvable" }); return; }
  res.json({ success: true });
});

export default router;
