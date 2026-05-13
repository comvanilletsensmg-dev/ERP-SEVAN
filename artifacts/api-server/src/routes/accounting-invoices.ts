import { Router, type IRouter } from "express";
import { db, accountingInvoicesTable, partnersTable, accountsTable, journalEntriesTable, journalLinesTable, lotsTable } from "@workspace/db";
import { eq, desc, sql, and, isNull, ne } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { requireRole } from "../middlewares/roles";
import multer from "multer";
import path from "path";
import fs from "fs";
import { z } from "zod/v4";

const uploadsDir = path.join(process.cwd(), "uploads", "invoices");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`),
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["application/pdf","image/jpeg","image/jpg","image/png"];
    cb(null, allowed.includes(file.mimetype));
  },
});

const router: IRouter = Router();

// ─── Helper: find account by code ────────────────────────────────────────────
async function findAccount(code: string) {
  const rows = await db.select().from(accountsTable).where(eq(accountsTable.code, code));
  return rows[0] ?? null;
}

// ─── Helper: post invoice to journal ─────────────────────────────────────────
async function postInvoiceToJournal(invoice: any, partner: any) {
  const isSale = invoice.type === "sale";
  const acc411 = await findAccount("411");
  const acc401 = await findAccount("401");
  const acc445 = await findAccount("445");
  const acc701 = await findAccount("701");
  const acc602 = await findAccount("602");
  const acc601 = await findAccount("601");

  if (!acc411 || !acc401 || !acc445) return null;

  const amountHT = invoice.amountHT;
  const tva = invoice.tvaMontant;

  const [entry] = await db.insert(journalEntriesTable).values({
    date: new Date(),
    reference: `INV-${invoice.invoiceNumber}`,
    description: `Facture ${isSale ? "vente" : "achat"} — ${partner?.name ?? invoice.partnerId}`,
  }).returning();

  const lines: any[] = [];

  if (isSale) {
    if (acc411) lines.push({ entryId: entry.id, accountId: acc411.id, debit: invoice.amountTTC, credit: 0, label: `Client ${partner?.name}` });
    if (acc701) lines.push({ entryId: entry.id, accountId: acc701.id, debit: 0, credit: amountHT, label: "Ventes produits finis" });
    if (tva > 0 && acc445) lines.push({ entryId: entry.id, accountId: acc445.id, debit: 0, credit: tva, label: "TVA collectée" });
  } else {
    const purchaseAcc = acc602 ?? acc601;
    if (purchaseAcc) lines.push({ entryId: entry.id, accountId: purchaseAcc.id, debit: amountHT, credit: 0, label: "Achats marchandises" });
    if (tva > 0 && acc445) lines.push({ entryId: entry.id, accountId: acc445.id, debit: tva, credit: 0, label: "TVA déductible" });
    if (acc401) lines.push({ entryId: entry.id, accountId: acc401.id, debit: 0, credit: invoice.amountTTC, label: `Fournisseur ${partner?.name}` });
  }

  if (lines.length > 0) await db.insert(journalLinesTable).values(lines);
  return entry.id;
}

// ─── Helper: enrich invoice with partner + lot ─────────────────────────────
async function enrichInvoice(inv: any) {
  const [partner] = await db.select().from(partnersTable).where(eq(partnersTable.id, inv.partnerId));
  let lot = null;
  if (inv.lotId) {
    const rows = await db.select().from(lotsTable).where(eq(lotsTable.id, inv.lotId));
    lot = rows[0] ?? null;
  }
  return { ...inv, partner: partner ?? null, lot };
}

// ─── Helper: detect duplicates ────────────────────────────────────────────────
async function detectDuplicates(invoices: any[]): Promise<Set<string>> {
  const dupIds = new Set<string>();
  for (let i = 0; i < invoices.length; i++) {
    for (let j = i + 1; j < invoices.length; j++) {
      const a = invoices[i], b = invoices[j];
      if (a.partnerId === b.partnerId && a.type === b.type) {
        const amountClose = Math.abs(a.amountTTC - b.amountTTC) / (Math.max(a.amountTTC, b.amountTTC) || 1) < 0.05;
        const dateClose = Math.abs(new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) < 30 * 86400 * 1000;
        const sameNumber = a.invoiceNumber === b.invoiceNumber;
        if (sameNumber || (amountClose && dateClose)) {
          dupIds.add(a.id);
          dupIds.add(b.id);
        }
      }
    }
  }
  return dupIds;
}

// ─── GET /invoices ────────────────────────────────────────────────────────────
router.get("/invoices", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(accountingInvoicesTable)
    .where(isNull((accountingInvoicesTable as any).deletedAt))
    .orderBy(desc(accountingInvoicesTable.createdAt));

  const enriched = await Promise.all(rows.map(enrichInvoice));
  const dupIds = await detectDuplicates(enriched);
  const result = enriched.map(inv => ({ ...inv, isDuplicate: dupIds.has(inv.id) }));

  res.json(result);
});

// ─── GET /invoices/kpis ───────────────────────────────────────────────────────
router.get("/invoices/kpis", requireAuth, async (_req, res): Promise<void> => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [row] = (await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE created_at >= ${startOfMonth.toISOString()} AND deleted_at IS NULL)::int        AS invoices_this_month,
      COALESCE(SUM(amount_ttc) FILTER (WHERE type='sale'     AND deleted_at IS NULL), 0)::float              AS total_sales,
      COALESCE(SUM(amount_ttc) FILTER (WHERE type='purchase' AND deleted_at IS NULL), 0)::float              AS total_purchases,
      COALESCE(SUM(tva_montant) FILTER (WHERE type='purchase' AND deleted_at IS NULL), 0)::float             AS tva_deductible,
      COALESCE(SUM(amount_ttc) FILTER (WHERE type='purchase' AND status NOT IN ('paid') AND deleted_at IS NULL), 0)::float AS supplier_debt,
      COUNT(*) FILTER (WHERE status='draft' AND deleted_at IS NULL)::int                                      AS pending_validation,
      COUNT(*) FILTER (WHERE due_date < NOW() AND status NOT IN ('paid') AND deleted_at IS NULL)::int         AS overdue
    FROM accounting_invoices
  `)).rows as any[];

  res.json(row);
});

// ─── POST /invoices ───────────────────────────────────────────────────────────
router.post("/invoices", requireAuth, async (req, res): Promise<void> => {
  const { invoiceNumber, partnerId, type, currency, amountHT, tvaRate, dueDate, notes, lotId, purchaseId } = req.body;
  if (!invoiceNumber || !partnerId || !type || amountHT === undefined) {
    res.status(400).json({ error: "invoiceNumber, partnerId, type, amountHT required" });
    return;
  }

  const [partner] = await db.select().from(partnersTable).where(eq(partnersTable.id, partnerId));
  if (!partner) { res.status(400).json({ error: "Partner not found" }); return; }

  const rate = Number(tvaRate ?? 20);
  const ht   = Number(amountHT);
  const tva  = ht * rate / 100;
  const ttc  = ht + tva;

  // Check for duplicates
  const existing = await db.select().from(accountingInvoicesTable)
    .where(and(
      eq(accountingInvoicesTable.invoiceNumber, invoiceNumber),
      isNull((accountingInvoicesTable as any).deletedAt)
    ));
  if (existing.length > 0) {
    res.status(409).json({ error: `Numéro de facture "${invoiceNumber}" déjà utilisé`, duplicateId: existing[0].id });
    return;
  }

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
    ...(lotId     ? { lotId }     : {}),
    ...(purchaseId? { purchaseId }: {}),
  } as any).returning();

  res.status(201).json({ ...invoice, partner });
});

// ─── PUT /invoices/:id/validate ───────────────────────────────────────────────
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

// ─── PUT /invoices/:id/pay ────────────────────────────────────────────────────
router.put("/invoices/:id/pay", requireAuth, async (req, res): Promise<void> => {
  const { id } = req.params;
  const [invoice] = await db.select().from(accountingInvoicesTable).where(eq(accountingInvoicesTable.id, id));
  if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }
  if (invoice.status !== "validated") { res.status(400).json({ error: "Invoice must be validated before marking paid" }); return; }

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
        { entryId: entry.id, accountId: acc512.id, debit: invoice.amountTTC, credit: 0, label: "Encaissement" },
        { entryId: entry.id, accountId: acc411.id, debit: 0, credit: invoice.amountTTC, label: `Client ${partner?.name}` },
      ]);
    } else if (invoice.type === "purchase" && acc401) {
      await db.insert(journalLinesTable).values([
        { entryId: entry.id, accountId: acc401.id, debit: invoice.amountTTC, credit: 0, label: `Fournisseur ${partner?.name}` },
        { entryId: entry.id, accountId: acc512.id, debit: 0, credit: invoice.amountTTC, label: "Règlement" },
      ]);
    }
  }

  const [updated] = await db.update(accountingInvoicesTable)
    .set({ status: "paid" })
    .where(eq(accountingInvoicesTable.id, id))
    .returning();

  res.json(updated);
});

// ─── POST /invoices/upload (with PDF text extraction) ────────────────────────
router.post("/invoices/upload", requireAuth, upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) { res.status(400).json({ error: "Aucun fichier fourni" }); return; }

  const fileUrl  = `/api/uploads/invoices/${req.file.filename}`;
  let ocrText    = "";
  let ocrFields: Record<string, string | null> = {};

  // PDF text extraction
  if (req.file.mimetype === "application/pdf") {
    try {
      const pdfParse = (await import("pdf-parse")).default;
      const buffer   = fs.readFileSync(req.file.path);
      const data     = await pdfParse(buffer);
      ocrText        = data.text ?? "";
    } catch (_e) {
      req.log.warn("PDF parse failed");
    }
  }

  // Smart field extraction from text
  if (ocrText) {
    const lines = ocrText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    // Invoice number: Facture N°, Invoice No, N° de facture, Reference
    const invNumMatch = ocrText.match(/(?:Facture\s*N[°o]?|Invoice\s*N[°o]?|N[°o]\s*Facture|Ref(?:erence)?)\s*[:.]?\s*([A-Z0-9\/\-]{4,20})/i);
    ocrFields.invoiceNumber = invNumMatch?.[1]?.trim() ?? null;

    // Date: common date patterns
    const dateMatch = ocrText.match(/(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/);
    ocrFields.date = dateMatch?.[1] ?? null;

    // Amounts — look for labeled amounts
    const htMatch  = ocrText.match(/(?:montant\s*HT|total\s*HT|sous.total|subtotal)\s*[:.]?\s*([0-9\s.,]+)/i);
    const tvaMatch = ocrText.match(/(?:TVA|VAT)\s*(?:\d+\s*%?)?\s*[:.]?\s*([0-9\s.,]+)/i);
    const ttcMatch = ocrText.match(/(?:montant\s*TTC|total\s*TTC|total\s*général|TOTAL)\s*[:.]?\s*([0-9\s.,]+)/i);

    const parseAmt = (s: string | undefined) => {
      if (!s) return null;
      return s.replace(/\s/g, "").replace(",", ".").replace(/[^0-9.]/g, "");
    };

    ocrFields.amountHT  = parseAmt(htMatch?.[1]);
    ocrFields.tvaMontant= parseAmt(tvaMatch?.[1]);
    ocrFields.amountTTC = parseAmt(ttcMatch?.[1]);

    // Currency
    const curMatch = ocrText.match(/\b(EUR|USD|MGA|GBP|JPY|CHF)\b/);
    ocrFields.currency = curMatch?.[1] ?? null;

    // Supplier name — usually company name near top
    const supplierMatch = ocrText.match(/(?:Fournisseur|Supplier|From|De)\s*[:.]?\s*([^\n]{3,50})/i);
    if (supplierMatch) {
      ocrFields.supplierName = supplierMatch[1].trim();
    } else if (lines.length > 0) {
      ocrFields.supplierName = lines[0].length > 3 && lines[0].length < 60 ? lines[0] : null;
    }
  }

  req.log.info({ filename: req.file.filename, ocrFields }, "Facture uploadée avec extraction OCR");

  res.json({
    fileUrl,
    filename:    req.file.originalname,
    size:        req.file.size,
    mimetype:    req.file.mimetype,
    ocrText:     ocrText ? ocrText.slice(0, 1000) : null,
    ocrFields,
    hasOcr:      Object.values(ocrFields).some(v => v !== null),
  });
});

// Serve uploaded invoice files
router.get("/uploads/invoices/:filename", (_req, res): void => {
  const filename = _req.params.filename;
  const filepath = path.join(uploadsDir, filename);
  if (!fs.existsSync(filepath)) { res.status(404).json({ error: "File not found" }); return; }
  res.sendFile(filepath);
});

// ─── DELETE /invoices/:id (SUPER_ADMIN only, soft delete) ────────────────────
router.delete("/invoices/:id",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  async (req, res): Promise<void> => {
    const { id }    = req.params;
    const user      = (req as any).currentUser;
    const reason    = (req.body?.reason ?? "").trim();

    if (!reason) { res.status(400).json({ error: "La raison de suppression est obligatoire" }); return; }

    const [invoice] = await db.select().from(accountingInvoicesTable).where(eq(accountingInvoicesTable.id, id));
    if (!invoice) { res.status(404).json({ error: "Facture introuvable" }); return; }

    // Block if paid
    if (invoice.status === "paid") {
      res.status(403).json({ error: "Impossible de supprimer une facture déjà payée" }); return;
    }

    // Soft delete with audit trail
    await db.execute(sql`
      UPDATE accounting_invoices
      SET deleted_at    = NOW(),
          deleted_by    = ${user?.email ?? user?.id ?? "unknown"},
          delete_reason = ${reason}
      WHERE id = ${id}
    `);

    req.log.info(
      { invoiceId: id, invoiceNumber: invoice.invoiceNumber, status: invoice.status, deletedBy: user?.email, reason },
      "Facture supprimée (soft delete) par SUPER_ADMIN"
    );

    res.json({ success: true });
  }
);

// ─── POST /invoices/from-purchase ─────────────────────────────────────────────
// Auto-generate a purchase invoice from a validated purchase
const fromPurchaseSchema = z.object({
  partnerId:  z.string().min(1),
  lotId:      z.string().optional(),
  amountHT:   z.number().positive(),
  tvaRate:    z.number().min(0).max(100).optional(),
  currency:   z.string().optional(),
  dueDate:    z.string().optional(),
  notes:      z.string().optional(),
  purchaseId: z.string().optional(),
});

router.post("/invoices/from-purchase", requireAuth, async (req, res): Promise<void> => {
  const parsed = fromPurchaseSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Données invalides" }); return; }

  const { partnerId, lotId, amountHT, tvaRate = 20, currency = "MGA", dueDate, notes, purchaseId } = parsed.data;
  const [partner] = await db.select().from(partnersTable).where(eq(partnersTable.id, partnerId));
  if (!partner) { res.status(404).json({ error: "Fournisseur introuvable" }); return; }

  const year = new Date().getFullYear();
  const count = await db.execute(sql`SELECT COUNT(*) FROM accounting_invoices WHERE type='purchase'`);
  const seq   = String(Number((count.rows[0] as any).count ?? 0) + 1).padStart(3, "0");
  const invoiceNumber = `ACH-${year}-${seq}`;

  const ht  = Number(amountHT);
  const tva = ht * tvaRate / 100;
  const ttc = ht + tva;

  const [invoice] = await db.insert(accountingInvoicesTable).values({
    invoiceNumber,
    partnerId,
    type: "purchase",
    currency,
    amountHT: ht,
    tvaRate,
    tvaMontant: tva,
    amountTTC: ttc,
    status: "draft",
    dueDate: dueDate ? new Date(dueDate) : null,
    notes: notes ?? `Facture achat vanille — auto-générée depuis achat`,
    ...(lotId      ? { lotId }      : {}),
    ...(purchaseId ? { purchaseId } : {}),
  } as any).returning();

  req.log.info({ invoiceNumber, partnerId, amountHT: ht }, "Facture achat auto-générée");
  res.status(201).json({ ...invoice, partner });
});

// ─── Invoice payments endpoints (existing, kept) ─────────────────────────────
export default router;
