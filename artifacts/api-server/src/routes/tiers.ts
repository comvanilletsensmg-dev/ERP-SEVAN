import { Router, type IRouter } from "express";
import {
  db, partnersTable, accountingInvoicesTable,
  journalEntriesTable, journalLinesTable, accountsTable,
  invoicePaymentsTable,
} from "@workspace/db";
import { eq, desc, and, inArray, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import * as XLSX from "xlsx";

const router: IRouter = Router();

function daysSince(date: Date | null, today: Date): number {
  if (!date) return 0;
  return Math.floor((today.getTime() - date.getTime()) / 86_400_000);
}

function agingBucket(dueDate: Date | null, today: Date): "current" | "1-30" | "31-60" | "61+" {
  if (!dueDate) return "current";
  const days = daysSince(dueDate, today);
  if (days <= 0) return "current";
  if (days <= 30) return "1-30";
  if (days <= 60) return "31-60";
  return "61+";
}

// ─── POST /api/tiers/sync ─────────────────────────────────────────────────────
router.post("/tiers/sync", requireAuth, async (req, res): Promise<void> => {
  try {
    const existingPartners = await db.select().from(partnersTable);
    const today = new Date().toLocaleDateString("fr-FR");

    const crmResult = await db.execute(sql`
      SELECT id, name, email, phone, vat_number, address, country
      FROM clients WHERE name IS NOT NULL AND TRIM(name) <> '' ORDER BY name
    `);
    const suppResult = await db.execute(sql`
      SELECT id, name, phone, region
      FROM suppliers WHERE name IS NOT NULL AND TRIM(name) <> '' ORDER BY name
    `);

    let created = 0, updated = 0;

    for (const row of crmResult.rows) {
      const name = (row.name as string)?.trim();
      if (!name) continue;
      const existing = existingPartners.find(
        p => p.name.toLowerCase().trim() === name.toLowerCase() && p.type === "client"
      );
      const syncNote = `Synchronisé CRM le ${today}`;
      if (existing) {
        await db.update(partnersTable).set({
          email: (row.email as string | null) ?? existing.email,
          phone: (row.phone as string | null) ?? existing.phone,
          vatNumber: (row.vat_number as string | null) ?? existing.vatNumber,
          address: (row.address as string | null) ?? existing.address,
          notes: syncNote,
        }).where(eq(partnersTable.id, existing.id));
        updated++;
      } else {
        await db.insert(partnersTable).values({
          name, type: "client",
          email: (row.email as string | null) ?? null,
          phone: (row.phone as string | null) ?? null,
          vatNumber: (row.vat_number as string | null) ?? null,
          address: (row.address as string | null) ?? null,
          notes: syncNote,
        });
        created++;
      }
    }

    for (const row of suppResult.rows) {
      const name = (row.name as string)?.trim();
      if (!name) continue;
      const existing = existingPartners.find(
        p => p.name.toLowerCase().trim() === name.toLowerCase() && p.type === "supplier"
      );
      const syncNote = `Synchronisé Logistique le ${today}`;
      if (existing) {
        await db.update(partnersTable).set({
          phone: (row.phone as string | null) ?? existing.phone,
          notes: syncNote,
        }).where(eq(partnersTable.id, existing.id));
        updated++;
      } else {
        await db.insert(partnersTable).values({
          name, type: "supplier",
          phone: (row.phone as string | null) ?? null,
          notes: syncNote,
        });
        created++;
      }
    }

    res.json({
      created, updated,
      crmClients: crmResult.rows.length,
      suppliers: suppResult.rows.length,
      message: `${created} tiers créés, ${updated} mis à jour`,
    });
  } catch (e: any) {
    req.log.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /api/tiers/aging ─────────────────────────────────────────────────────
router.get("/tiers/aging", requireAuth, async (_req, res): Promise<void> => {
  const today = new Date();
  const [partners, invoices] = await Promise.all([
    db.select().from(partnersTable).orderBy(partnersTable.name),
    db.select().from(accountingInvoicesTable),
  ]);

  const result = partners.map(p => {
    const all = invoices.filter(inv => inv.partnerId === p.id);
    const open = all.filter(inv => inv.status !== "paid");
    const aging = { current: 0, "1-30": 0, "31-60": 0, "61+": 0, total: 0 };
    for (const inv of open) {
      const b = agingBucket(inv.dueDate, today);
      aging[b] += inv.amountTTC;
      aging.total += inv.amountTTC;
    }
    return { ...p, aging, openInvoices: open.length, totalInvoices: all.length };
  });

  res.json(result);
});

// ─── GET /api/tiers/export/excel ─────────────────────────────────────────────
router.get("/tiers/export/excel", requireAuth, async (_req, res): Promise<void> => {
  const today = new Date();
  const [partners, invoices] = await Promise.all([
    db.select().from(partnersTable).orderBy(partnersTable.name),
    db.select().from(accountingInvoicesTable),
  ]);

  const data = partners.map(p => {
    const all = invoices.filter(inv => inv.partnerId === p.id);
    const open = all.filter(inv => inv.status !== "paid");
    const total = open.reduce((s, i) => s + i.amountTTC, 0);
    const a30 = open.filter(i => agingBucket(i.dueDate, today) === "1-30").reduce((s, i) => s + i.amountTTC, 0);
    const a60 = open.filter(i => agingBucket(i.dueDate, today) === "31-60").reduce((s, i) => s + i.amountTTC, 0);
    const a61 = open.filter(i => agingBucket(i.dueDate, today) === "61+").reduce((s, i) => s + i.amountTTC, 0);
    return {
      "Nom": p.name,
      "Type": p.type === "client" ? "Client" : "Fournisseur",
      "Email": p.email ?? "",
      "Téléphone": p.phone ?? "",
      "N° TVA": p.vatNumber ?? "",
      "Encours Total (Ar)": total,
      "Courant (Ar)": total - a30 - a60 - a61,
      "1–30 jours (Ar)": a30,
      "31–60 jours (Ar)": a60,
      "61+ jours (Ar)": a61,
      "Total Factures": all.length,
      "Factures Ouvertes": open.length,
    };
  });

  const ws = XLSX.utils.json_to_sheet(data);
  ws["!cols"] = [20, 14, 28, 18, 16, 18, 16, 16, 16, 14, 14, 16].map(w => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Balance Tiers");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Disposition", `attachment; filename="balance-tiers-${today.toISOString().split("T")[0]}.xlsx"`);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(buf);
});

// ─── GET /api/tiers/:id ───────────────────────────────────────────────────────
router.get("/tiers/:id", requireAuth, async (req, res): Promise<void> => {
  const { id } = req.params as Record<string, string>;
  const today = new Date();

  const [partner] = await db.select().from(partnersTable).where(eq(partnersTable.id, id));
  if (!partner) { res.status(404).json({ error: "Tiers non trouvé" }); return; }

  const invoices = await db.select()
    .from(accountingInvoicesTable)
    .where(eq(accountingInvoicesTable.partnerId, id))
    .orderBy(desc(accountingInvoicesTable.createdAt));

  // Aging over open invoices
  const open = invoices.filter(inv => inv.status !== "paid");
  const aging = { current: 0, "1-30": 0, "31-60": 0, "61+": 0 };
  for (const inv of open) {
    const b = agingBucket(inv.dueDate, today);
    aging[b] += inv.amountTTC;
  }
  const totalEncours = open.reduce((s, i) => s + i.amountTTC, 0);
  const totalCA = invoices.filter(inv => inv.status === "paid").reduce((s, i) => s + i.amountTTC, 0);

  // Payments summary per invoice
  const invIds = invoices.map(i => i.id);
  const payments = invIds.length > 0
    ? await db.select().from(invoicePaymentsTable).where(inArray(invoicePaymentsTable.invoiceId, invIds))
    : [];
  const paidPerInvoice: Record<string, number> = {};
  for (const p of payments) {
    paidPerInvoice[p.invoiceId] = (paidPerInvoice[p.invoiceId] ?? 0) + p.amount;
  }

  // Ledger via journal entries linked to invoices
  const accountCode = partner.type === "client" ? "411" : "401";
  const accResult = await db.execute(sql`SELECT id FROM accounts WHERE code = ${accountCode} LIMIT 1`);
  const accountId = accResult.rows[0]?.id as string | undefined;

  let ledger: any[] = [];
  if (accountId) {
    const entryIds = invoices.filter(i => i.journalEntryId).map(i => i.journalEntryId!);
    if (entryIds.length > 0) {
      const [entries, lines] = await Promise.all([
        db.select().from(journalEntriesTable).where(inArray(journalEntriesTable.id, entryIds)),
        db.select().from(journalLinesTable).where(
          and(
            inArray(journalLinesTable.entryId, entryIds),
            eq(journalLinesTable.accountId, accountId)
          )
        ),
      ]);

      let running = 0;
      ledger = entries
        .map(entry => {
          const entryLines = lines.filter(l => l.entryId === entry.id);
          const debit = entryLines.reduce((s, l) => s + l.debit, 0);
          const credit = entryLines.reduce((s, l) => s + l.credit, 0);
          running += debit - credit;
          return {
            date: entry.date,
            reference: entry.reference,
            description: entry.description,
            debit, credit,
            balance: running,
            label: entryLines[0]?.label ?? "",
          };
        })
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }
  }

  // Purchases (suppliers only): join by supplier name
  let purchases: any[] = [];
  if (partner.type === "supplier") {
    const r = await db.execute(sql`
      SELECT p.id, p.created_at, p.total_amount, p.weight, p.price_per_kg,
             p.payment_method, p.lot_id, s.name AS supplier_name
      FROM purchases p
      JOIN suppliers s ON s.id = p.supplier_id
      WHERE LOWER(TRIM(s.name)) = LOWER(TRIM(${partner.name}))
      ORDER BY p.created_at DESC
      LIMIT 100
    `);
    purchases = r.rows as any[];
  }

  // CRM enrichment (clients only)
  let crmData: any = null;
  if (partner.type === "client") {
    const r = await db.execute(sql`
      SELECT id, name, email, phone, country, risk_level, credit_limit,
             payment_terms, total_revenue, last_order_date, currency, address
      FROM clients
      WHERE LOWER(TRIM(name)) = LOWER(TRIM(${partner.name}))
      LIMIT 1
    `);
    crmData = r.rows[0] ?? null;
  }

  res.json({
    partner,
    invoices: invoices.map(inv => ({
      ...inv,
      paidAmount: paidPerInvoice[inv.id] ?? 0,
      remaining: inv.amountTTC - (paidPerInvoice[inv.id] ?? 0),
    })),
    aging,
    totalEncours,
    totalCA,
    ledger,
    purchases,
    crmData,
  });
});

export default router;
