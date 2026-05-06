/**
 * Invoice Payments — Madagascar payment methods
 *
 *   GET  /invoices/:id/payments        — list + totalPaid + remaining
 *   POST /invoices/:id/payments        — record payment (auto-updates invoice status)
 *   POST /invoices/payments/proof      — upload proof image
 *   GET  /invoices/payments/stats      — totals by method type (dashboard)
 */
import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import multer from "multer";
import path from "path";
import fs from "fs";
import {
  db,
  accountingInvoicesTable,
  invoicePaymentsTable,
  accountsTable,
  journalEntriesTable,
  journalLinesTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { loadUser } from "../middlewares/roles";

const router: IRouter = Router();

// ── Upload config ─────────────────────────────────────────────────────────────
const paymentsDir = path.join(process.cwd(), "uploads", "payments");
if (!fs.existsSync(paymentsDir)) fs.mkdirSync(paymentsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, paymentsDir),
  filename: (_req, file, cb) =>
    cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`),
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// ── Madagascar payment methods (constants) ────────────────────────────────────
export const PAYMENT_METHODS = [
  { id: "cash",         name: "Liquide",              type: "cash",         provider: "Cash" },
  { id: "mvola",        name: "Mvola",                type: "mobile_money", provider: "Mvola" },
  { id: "orange_money", name: "Orange Money",         type: "mobile_money", provider: "Orange Money" },
  { id: "bni",          name: "BNI Madagascar",       type: "bank",         provider: "BNI Madagascar" },
  { id: "boa",          name: "BOA Madagascar",       type: "bank",         provider: "BOA Madagascar" },
  { id: "bfv",          name: "BFV Société Générale", type: "bank",         provider: "BFV Société Générale" },
  { id: "acces",        name: "Accès Banque",         type: "bank",         provider: "Accès Banque" },
] as const;

// ── Account lookup ────────────────────────────────────────────────────────────
async function findAccount(code: string) {
  const rows = await db.select().from(accountsTable).where(eq(accountsTable.code, code));
  return rows[0] ?? null;
}

// ── Compute totals + update invoice status ────────────────────────────────────
async function syncInvoiceStatus(invoiceId: string) {
  const [invoice] = await db
    .select()
    .from(accountingInvoicesTable)
    .where(eq(accountingInvoicesTable.id, invoiceId));
  if (!invoice) return;

  const payments = await db
    .select()
    .from(invoicePaymentsTable)
    .where(eq(invoicePaymentsTable.invoiceId, invoiceId));

  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  const remaining = Math.max(0, invoice.amountTTC - totalPaid);

  let newStatus = invoice.status;
  if (totalPaid <= 0) {
    newStatus = invoice.status === "draft" ? "draft" : "validated";
  } else if (totalPaid >= invoice.amountTTC - 0.01) {
    newStatus = "paid";
  } else {
    newStatus = "partial";
  }

  if (newStatus !== invoice.status) {
    await db
      .update(accountingInvoicesTable)
      .set({ status: newStatus })
      .where(eq(accountingInvoicesTable.id, invoiceId));
  }

  return { totalPaid, remaining, status: newStatus };
}

// ── POST /invoices/payments/proof — upload proof ──────────────────────────────
// MUST be registered before /:id routes to avoid param conflict
router.post(
  "/invoices/payments/proof",
  requireAuth,
  upload.single("proof"),
  async (req, res): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: "Aucun fichier reçu" });
      return;
    }
    const proofUrl = `/api/uploads/payments/${req.file.filename}`;
    res.json({ proofUrl, filename: req.file.originalname, size: req.file.size });
  },
);

// ── GET /invoices/payments/stats — dashboard totals ───────────────────────────
router.get("/invoices/payments/stats", requireAuth, async (_req, res): Promise<void> => {
  const payments = await db.select().from(invoicePaymentsTable);

  const totals = { cash: 0, mobile_money: 0, bank: 0, total: 0 };
  const byMethod: Record<string, number> = {};

  for (const p of payments) {
    const method = PAYMENT_METHODS.find(m => m.id === p.method);
    const type = method?.type ?? "bank";
    if (type in totals) totals[type as keyof typeof totals] += p.amount;
    totals.total += p.amount;
    byMethod[p.method] = (byMethod[p.method] ?? 0) + p.amount;
  }

  res.json({ totals, byMethod, count: payments.length });
});

// ── GET /invoices/:id/payments ────────────────────────────────────────────────
router.get("/invoices/:id/payments", requireAuth, async (req, res): Promise<void> => {
  const [invoice] = await db
    .select()
    .from(accountingInvoicesTable)
    .where(eq(accountingInvoicesTable.id, req.params.id));
  if (!invoice) { res.status(404).json({ error: "Facture introuvable" }); return; }

  const payments = await db
    .select()
    .from(invoicePaymentsTable)
    .where(eq(invoicePaymentsTable.invoiceId, req.params.id))
    .orderBy(invoicePaymentsTable.createdAt);

  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  const remaining = Math.max(0, invoice.amountTTC - totalPaid);
  const pct = invoice.amountTTC > 0 ? Math.min(100, (totalPaid / invoice.amountTTC) * 100) : 0;

  res.json({ payments, totalPaid, remaining, pct, invoice });
});

// ── POST /invoices/:id/payments ───────────────────────────────────────────────
router.post(
  "/invoices/:id/payments",
  requireAuth,
  loadUser,
  async (req, res): Promise<void> => {
    const [invoice] = await db
      .select()
      .from(accountingInvoicesTable)
      .where(eq(accountingInvoicesTable.id, req.params.id));
    if (!invoice) { res.status(404).json({ error: "Facture introuvable" }); return; }
    if (invoice.status === "draft") {
      res.status(400).json({ error: "Valider la facture avant d'enregistrer un paiement" });
      return;
    }
    if (invoice.status === "paid") {
      res.status(400).json({ error: "Facture déjà entièrement payée" });
      return;
    }

    const { amount, method, provider, reference, proofUrl, notes } = req.body as {
      amount: number; method: string; provider?: string;
      reference?: string; proofUrl?: string; notes?: string;
    };

    if (!amount || amount <= 0) {
      res.status(400).json({ error: "Montant invalide" });
      return;
    }
    if (!method) {
      res.status(400).json({ error: "Méthode de paiement requise" });
      return;
    }

    // Check remaining
    const existing = await db
      .select()
      .from(invoicePaymentsTable)
      .where(eq(invoicePaymentsTable.invoiceId, invoice.id));
    const alreadyPaid = existing.reduce((s, p) => s + p.amount, 0);
    const remaining = invoice.amountTTC - alreadyPaid;

    if (amount > remaining + 0.01) {
      res.status(400).json({
        error: `Montant dépasse le reste à payer (${remaining.toFixed(2)} MGA)`,
        remaining,
      });
      return;
    }

    // Find provider name from method id
    const methodMeta = PAYMENT_METHODS.find(m => m.id === method);
    const resolvedProvider = provider ?? methodMeta?.provider ?? method;

    const [payment] = await db
      .insert(invoicePaymentsTable)
      .values({
        id: crypto.randomUUID(),
        invoiceId: invoice.id,
        amount: Number(amount),
        method,
        provider: resolvedProvider,
        reference: reference || null,
        proofUrl: proofUrl || null,
        notes: notes || null,
      })
      .returning();

    // ── Sync invoice status ────────────────────────────────────────────────────
    const statusResult = await syncInvoiceStatus(invoice.id);

    // ── Generate journal entry for this payment ────────────────────────────────
    const acc512 = await findAccount("512");
    const acc411 = await findAccount("411");
    const acc401 = await findAccount("401");

    if (acc512) {
      const [entry] = await db
        .insert(journalEntriesTable)
        .values({
          id: crypto.randomUUID(),
          date: new Date(),
          reference: `PAY-${invoice.invoiceNumber}-${payment.id.slice(0, 6)}`,
          description: `Paiement ${methodMeta?.name ?? method} — Facture ${invoice.invoiceNumber}`,
          status: "validated",
        })
        .returning();

      const lines = [];
      if (invoice.type === "sale" && acc411) {
        lines.push(
          { id: crypto.randomUUID(), entryId: entry.id, accountId: acc512.id, debit: Number(amount), credit: 0, label: `Encaissement ${methodMeta?.name ?? method}` },
          { id: crypto.randomUUID(), entryId: entry.id, accountId: acc411.id, debit: 0, credit: Number(amount), label: `Client — ${invoice.invoiceNumber}` },
        );
      } else if (invoice.type === "purchase" && acc401) {
        lines.push(
          { id: crypto.randomUUID(), entryId: entry.id, accountId: acc401.id, debit: Number(amount), credit: 0, label: `Fournisseur — ${invoice.invoiceNumber}` },
          { id: crypto.randomUUID(), entryId: entry.id, accountId: acc512.id, debit: 0, credit: Number(amount), label: `Règlement ${methodMeta?.name ?? method}` },
        );
      }
      if (lines.length > 0) await db.insert(journalLinesTable).values(lines);
    }

    res.status(201).json({
      payment,
      totalPaid: alreadyPaid + Number(amount),
      remaining: Math.max(0, remaining - Number(amount)),
      newStatus: statusResult?.status ?? invoice.status,
    });
  },
);

// ── Serve uploaded payment proofs ─────────────────────────────────────────────
import { createReadStream, statSync } from "fs";

router.get("/uploads/payments/:filename", (req, res) => {
  const filePath = path.join(paymentsDir, req.params.filename);
  if (!fs.existsSync(filePath)) { res.status(404).send("Not found"); return; }
  const stat = statSync(filePath);
  res.setHeader("Content-Length", stat.size);
  createReadStream(filePath).pipe(res);
});

export default router;
