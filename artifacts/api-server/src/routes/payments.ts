import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, paymentsTable, salesTable, clientsTable, journalEntriesTable, journalLinesTable, accountsTable } from "@workspace/db";
import { CreatePaymentBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/payments", requireAuth, async (_req, res): Promise<void> => {
  const payments = await db
    .select()
    .from(paymentsTable)
    .leftJoin(salesTable, eq(paymentsTable.saleId, salesTable.id))
    .orderBy(paymentsTable.createdAt);

  res.json(
    payments.map(({ payments: p, sales: s }) => ({
      ...p,
      createdAt: p.createdAt.toISOString(),
      sale: s ? { ...s, createdAt: s.createdAt.toISOString() } : undefined,
    }))
  );
});

router.post("/payments", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreatePaymentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { saleId, amount, method } = parsed.data;

  // Verify the sale exists
  const [sale] = await db.select().from(salesTable).where(eq(salesTable.id, saleId));
  if (!sale) {
    res.status(404).json({ error: "Vente introuvable" });
    return;
  }

  // Create the payment record
  const [payment] = await db
    .insert(paymentsTable)
    .values({ saleId, amount, method })
    .returning();

  console.log(`[PAYMENT] Received ${amount} ${sale.currency} for sale ${saleId} via ${method}`);

  // Accounting: debit bank (512), credit client (411)
  const [bankAccount] = await db.select().from(accountsTable).where(eq(accountsTable.code, "512"));
  const [clientAccount] = await db.select().from(accountsTable).where(eq(accountsTable.code, "411"));

  if (bankAccount && clientAccount) {
    const [entry] = await db
      .insert(journalEntriesTable)
      .values({
        date: new Date(),
        reference: `PAIEMENT-${payment.id.slice(0, 8).toUpperCase()}`,
      })
      .returning();

    await db.insert(journalLinesTable).values([
      { entryId: entry.id, accountId: bankAccount.id, debit: amount, credit: 0 },
      { entryId: entry.id, accountId: clientAccount.id, debit: 0, credit: amount },
    ]);

    console.log(`[ACCOUNTING] Journal entry ${entry.reference}: D512 ${amount} / C411 ${amount}`);
  }

  const [client] = sale.clientId
    ? await db.select().from(clientsTable).where(eq(clientsTable.id, sale.clientId))
    : [undefined];

  res.status(201).json({
    ...payment,
    createdAt: payment.createdAt.toISOString(),
    sale: { ...sale, createdAt: sale.createdAt.toISOString(), client },
  });
});

export default router;
