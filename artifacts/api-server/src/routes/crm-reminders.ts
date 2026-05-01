import { Router, type IRouter } from "express";
import { db, remindersTable, emailTemplatesTable, accountingInvoicesTable, partnersTable } from "@workspace/db";
import { eq, desc, and, lt, ne } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { sendEmail } from "../services/email";

const router: IRouter = Router();
const safe = (r: any) => ({
  ...r,
  createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
  dueDate: r.dueDate instanceof Date ? r.dueDate.toISOString() : r.dueDate,
  sentAt: r.sentAt instanceof Date ? r.sentAt.toISOString() : r.sentAt,
});

router.get("/crm/reminders", requireAuth, async (_req, res): Promise<void> => {
  const reminders = await db.select().from(remindersTable).orderBy(desc(remindersTable.createdAt));
  res.json(reminders.map(safe));
});

router.post("/crm/reminders", requireAuth, async (req, res): Promise<void> => {
  const { clientEmail, clientName, invoiceRef, type, dueDate, notes } = req.body;
  if (!clientEmail || !dueDate) { res.status(400).json({ error: "clientEmail et dueDate requis" }); return; }
  const [reminder] = await db.insert(remindersTable).values({
    clientEmail, clientName: clientName ?? null, invoiceRef: invoiceRef ?? null,
    type: type ?? "payment", dueDate: new Date(dueDate), notes: notes ?? null,
  }).returning();
  res.status(201).json(safe(reminder));
});

router.patch("/crm/reminders/:id/send", requireAuth, async (req, res): Promise<void> => {
  const [reminder] = await db.select().from(remindersTable).where(eq(remindersTable.id, req.params.id));
  if (!reminder) { res.status(404).json({ error: "Relance introuvable" }); return; }

  // Find reminder template
  const [tmpl] = await db.select().from(emailTemplatesTable).where(eq(emailTemplatesTable.category, "reminder")).limit(1);
  const result = await sendEmail({
    to: reminder.clientEmail,
    templateId: tmpl?.id,
    subject: `Relance ${reminder.type === "payment" ? "paiement" : "suivi"} — ${reminder.invoiceRef ?? ""}`,
    body: tmpl ? undefined : `Bonjour ${reminder.clientName ?? ""},\n\nNous vous rappelons que le paiement de la facture ${reminder.invoiceRef ?? ""} est en attente.\n\nCordialement,\nVanilla ERP Madagascar`,
    data: { name: reminder.clientName ?? "", invoice: reminder.invoiceRef ?? "" },
  });

  const [updated] = await db.update(remindersTable).set({ status: "sent", sentAt: new Date() }).where(eq(remindersTable.id, reminder.id)).returning();
  res.json({ ...safe(updated), emailResult: result });
});

router.patch("/crm/reminders/:id/cancel", requireAuth, async (req, res): Promise<void> => {
  const [updated] = await db.update(remindersTable).set({ status: "cancelled" }).where(eq(remindersTable.id, req.params.id)).returning();
  if (!updated) { res.status(404).json({ error: "Relance introuvable" }); return; }
  res.json(safe(updated));
});

// ─── Cron trigger: check overdue invoices ────────────────────────────────────

export async function checkOverdueInvoices() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);
  const overdue = await db.select({
    invoice: accountingInvoicesTable,
    partner: partnersTable,
  })
    .from(accountingInvoicesTable)
    .leftJoin(partnersTable, eq(accountingInvoicesTable.partnerId, partnersTable.id))
    .where(and(
      ne(accountingInvoicesTable.status, "paid"),
      lt(accountingInvoicesTable.dueDate, sevenDaysAgo),
    ));

  let created = 0;
  for (const { invoice, partner } of overdue) {
    if (!partner?.email) continue;
    // Check if reminder already exists for this invoice
    const existing = await db.select().from(remindersTable)
      .where(and(eq(remindersTable.invoiceRef, invoice.invoiceNumber), eq(remindersTable.status, "pending")));
    if (existing.length > 0) continue;

    await db.insert(remindersTable).values({
      clientEmail: partner.email,
      clientName: partner.name,
      invoiceRef: invoice.invoiceNumber,
      type: "payment",
      dueDate: invoice.dueDate ?? new Date(),
      notes: `Relance automatique — facture ${invoice.invoiceNumber} en retard`,
    });
    created++;
  }
  return { checked: overdue.length, created };
}

router.post("/crm/reminders/check-overdue", requireAuth, async (_req, res): Promise<void> => {
  const result = await checkOverdueInvoices();
  res.json(result);
});

export default router;
