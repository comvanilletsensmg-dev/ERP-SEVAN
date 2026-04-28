import { Router, type IRouter } from "express";
import { db, accountingInvoicesTable, partnersTable, accountsTable, journalEntriesTable, journalLinesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import multer from "multer";
import path from "path";
import fs from "fs";

const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`),
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

const router: IRouter = Router();

async function findAccount(code: string) {
  const rows = await db.select().from(accountsTable).where(eq(accountsTable.code, code));
  return rows[0] ?? null;
}

async function postInvoiceToJournal(invoice: any, partner: any) {
  // SALE: Debit 411 (Client) / Credit 701 (Revenue) + Credit 445 (TVA)
  // PURCHASE: Debit 6xx + Debit 445 (TVA) / Credit 401 (Supplier)
  const isSale = invoice.type === "sale";
  const acc411 = await findAccount("411");
  const acc401 = await findAccount("401");
  const acc445 = await findAccount("445");
  const acc701 = await findAccount("701");
  const acc601 = await findAccount("601");

  if (!acc411 || !acc401 || !acc445) return;

  const amountHT = invoice.amountHT;
  const tva = invoice.tvaMontant;

  const [entry] = await db.insert(journalEntriesTable).values({
    date: new Date(),
    reference: `INV-${invoice.invoiceNumber}`,
    description: `Facture ${invoice.type === "sale" ? "vente" : "achat"} — ${partner?.name ?? invoice.partnerId}`,
  }).returning();

  const lines: any[] = [];

  if (isSale) {
    if (acc411) lines.push({ entryId: entry.id, accountId: acc411.id, debit: invoice.amountTTC, credit: 0 });
    if (acc701) lines.push({ entryId: entry.id, accountId: acc701.id, debit: 0, credit: amountHT });
    if (tva > 0 && acc445) lines.push({ entryId: entry.id, accountId: acc445.id, debit: 0, credit: tva });
  } else {
    if (acc601) lines.push({ entryId: entry.id, accountId: acc601.id, debit: amountHT, credit: 0 });
    if (tva > 0 && acc445) lines.push({ entryId: entry.id, accountId: acc445.id, debit: tva, credit: 0 });
    if (acc401) lines.push({ entryId: entry.id, accountId: acc401.id, debit: 0, credit: invoice.amountTTC });
  }

  if (lines.length > 0) await db.insert(journalLinesTable).values(lines);
  return entry.id;
}

router.get("/invoices", requireAuth, async (req, res): Promise<void> => {
  const { type, status, partnerId } = req.query as Record<string, string>;
  let query = db.select().from(accountingInvoicesTable).$dynamic();
  const invoices = await db.select().from(accountingInvoicesTable).orderBy(desc(accountingInvoicesTable.createdAt));

  // Enrich with partner
  const result = await Promise.all(invoices.map(async (inv) => {
    const [partner] = await db.select().from(partnersTable).where(eq(partnersTable.id, inv.partnerId));
    return { ...inv, partner };
  }));

  const filtered = result.filter(i => {
    if (type && i.type !== type) return false;
    if (status && i.status !== status) return false;
    if (partnerId && i.partnerId !== partnerId) return false;
    return true;
  });

  res.json(filtered);
});

router.post("/invoices", requireAuth, async (req, res): Promise<void> => {
  const { invoiceNumber, partnerId, type, currency, amountHT, tvaRate, dueDate, notes } = req.body;
  if (!invoiceNumber || !partnerId || !type || amountHT === undefined) {
    res.status(400).json({ error: "invoiceNumber, partnerId, type, amountHT required" });
    return;
  }
  const [partner] = await db.select().from(partnersTable).where(eq(partnersTable.id, partnerId));
  if (!partner) { res.status(400).json({ error: "Partner not found" }); return; }

  const rate = Number(tvaRate ?? (type === "sale" ? 20 : 20));
  const ht = Number(amountHT);
  const tva = ht * rate / 100;
  const ttc = ht + tva;

  const [invoice] = await db.insert(accountingInvoicesTable).values({
    invoiceNumber,
    partnerId,
    type,
    currency: currency ?? "MGA",
    amountHT: ht,
    tvaRate: rate,
    tvaMontant: tva,
    amountTTC: ttc,
    status: "draft",
    dueDate: dueDate ? new Date(dueDate) : null,
    notes,
  }).returning();

  res.status(201).json({ ...invoice, partner });
});

router.put("/invoices/:id/validate", requireAuth, async (req, res): Promise<void> => {
  const { id } = req.params;
  const [invoice] = await db.select().from(accountingInvoicesTable).where(eq(accountingInvoicesTable.id, id));
  if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }
  if (invoice.status !== "draft") { res.status(400).json({ error: "Only draft invoices can be validated" }); return; }

  const [partner] = await db.select().from(partnersTable).where(eq(partnersTable.id, invoice.partnerId));
  const journalEntryId = await postInvoiceToJournal(invoice, partner);

  const [updated] = await db.update(accountingInvoicesTable)
    .set({ status: "validated", journalEntryId })
    .where(eq(accountingInvoicesTable.id, id))
    .returning();

  res.json({ ...updated, partner });
});

router.put("/invoices/:id/pay", requireAuth, async (req, res): Promise<void> => {
  const { id } = req.params;
  const [invoice] = await db.select().from(accountingInvoicesTable).where(eq(accountingInvoicesTable.id, id));
  if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }
  if (invoice.status !== "validated") { res.status(400).json({ error: "Invoice must be validated before marking paid" }); return; }

  // Post payment entry: Debit 512 / Credit 411 (sale) or Debit 401 / Credit 512 (purchase)
  const acc512 = await findAccount("512");
  const acc411 = await findAccount("411");
  const acc401 = await findAccount("401");
  if (acc512) {
    const [partner] = await db.select().from(partnersTable).where(eq(partnersTable.id, invoice.partnerId));
    const [entry] = await db.insert(journalEntriesTable).values({
      date: new Date(),
      reference: `PAY-${invoice.invoiceNumber}`,
      description: `Paiement facture — ${partner?.name ?? invoice.partnerId}`,
    }).returning();
    if (invoice.type === "sale" && acc411) {
      await db.insert(journalLinesTable).values([
        { entryId: entry.id, accountId: acc512.id, debit: invoice.amountTTC, credit: 0 },
        { entryId: entry.id, accountId: acc411.id, debit: 0, credit: invoice.amountTTC },
      ]);
    } else if (invoice.type === "purchase" && acc401) {
      await db.insert(journalLinesTable).values([
        { entryId: entry.id, accountId: acc401.id, debit: invoice.amountTTC, credit: 0 },
        { entryId: entry.id, accountId: acc512.id, debit: 0, credit: invoice.amountTTC },
      ]);
    }
  }

  const [updated] = await db.update(accountingInvoicesTable)
    .set({ status: "paid" })
    .where(eq(accountingInvoicesTable.id, id))
    .returning();

  res.json(updated);
});

// Upload document for invoice (OCR-ready)
router.post("/invoices/upload", requireAuth, upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }
  const fileUrl = `/uploads/${req.file.filename}`;

  // Basic text extraction from filename/metadata (full OCR would use tesseract)
  const extracted = {
    fileUrl,
    filename: req.file.originalname,
    size: req.file.size,
    mimetype: req.file.mimetype,
    message: "File uploaded. Fill invoice fields manually or use OCR scanning.",
  };
  res.json(extracted);
});

export default router;
