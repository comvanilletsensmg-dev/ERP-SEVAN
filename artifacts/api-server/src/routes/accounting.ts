/**
 * Accounting journal routes
 *
 *   GET    /api/accounts
 *   GET    /api/journal?dateFrom=&dateTo=&accountCode=&reference=&status=
 *   POST   /api/journal                       — create entry + lines
 *   PATCH  /api/journal/:id                   — edit (draft only)
 *   DELETE /api/journal/:id                   — delete (draft only)
 *   POST   /api/journal/:id/validate          — draft → validated
 *   POST   /api/journal/:id/lock              — validated → locked
 *   GET    /api/journal/export/excel          — XLSX download
 *   GET    /api/journal/export/pdf            — HTML for print-to-PDF
 *   GET    /api/journal/:id/audit             — audit trail for one entry
 */
import { Router, type IRouter } from "express";
import { eq, desc, and, gte, lte, ilike, sql } from "drizzle-orm";
import { z } from "zod/v4";
import * as XLSX from "xlsx";
import {
  db,
  accountsTable,
  journalEntriesTable,
  journalLinesTable,
  journalAuditLogsTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { loadUser } from "../middlewares/roles";

const router: IRouter = Router();

// ── Helpers ────────────────────────────────────────────────────────────────────
async function enrichEntry(entry: typeof journalEntriesTable.$inferSelect) {
  const lines = await db
    .select()
    .from(journalLinesTable)
    .leftJoin(accountsTable, eq(journalLinesTable.accountId, accountsTable.id))
    .where(eq(journalLinesTable.entryId, entry.id));
  return {
    ...entry,
    date: entry.date.toISOString(),
    lines: lines.map(({ journal_lines: jl, accounts: a }) => ({
      ...jl,
      account: a ?? undefined,
    })),
  };
}

async function logAudit(
  entryId: string,
  action: string,
  changes: object | null,
  userEmail: string | null,
) {
  await db.insert(journalAuditLogsTable).values({
    id: crypto.randomUUID(),
    entryId,
    action,
    changes: changes ?? {},
    userEmail: userEmail ?? "system",
  });
}

function checkBalance(lines: { debit: number; credit: number }[]) {
  const totalDebit  = lines.reduce((s, l) => s + (l.debit  ?? 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (l.credit ?? 0), 0);
  return Math.abs(totalDebit - totalCredit) < 0.01;
}

// ── GET /accounts ─────────────────────────────────────────────────────────────
router.get("/accounts", requireAuth, async (_req, res): Promise<void> => {
  const accounts = await db.select().from(accountsTable).orderBy(accountsTable.code);
  res.json(accounts);
});

// ── GET /journal ──────────────────────────────────────────────────────────────
router.get("/journal", requireAuth, async (req, res): Promise<void> => {
  const { dateFrom, dateTo, accountCode, reference, status } = req.query as Record<string, string | undefined>;

  // Build entry-level filters
  const entryConditions = [];
  if (dateFrom) entryConditions.push(gte(journalEntriesTable.date, new Date(dateFrom)));
  if (dateTo)   entryConditions.push(lte(journalEntriesTable.date, new Date(dateTo + "T23:59:59")));
  if (reference) entryConditions.push(ilike(journalEntriesTable.reference, `%${reference}%`));
  if (status)   entryConditions.push(eq(journalEntriesTable.status, status));

  const entries = await db.select().from(journalEntriesTable)
    .where(entryConditions.length > 0 ? and(...entryConditions) : undefined)
    .orderBy(desc(journalEntriesTable.date));

  // Filter by account code requires joining lines
  let filtered = entries;
  if (accountCode) {
    const [acc] = await db.select().from(accountsTable).where(ilike(accountsTable.code, `%${accountCode}%`));
    if (acc) {
      const matchingEntryIds = await db
        .selectDistinct({ entryId: journalLinesTable.entryId })
        .from(journalLinesTable)
        .where(eq(journalLinesTable.accountId, acc.id));
      const ids = new Set(matchingEntryIds.map(r => r.entryId));
      filtered = entries.filter(e => ids.has(e.id));
    } else {
      filtered = [];
    }
  }

  const result = await Promise.all(filtered.map(enrichEntry));
  res.json(result);
});

// ── POST /journal (create) ────────────────────────────────────────────────────
const CreateEntryBody = z.object({
  reference:   z.string().min(1),
  date:        z.string().optional(),
  description: z.string().optional(),
  lines: z.array(z.object({
    accountId: z.string().min(1),
    debit:     z.number().min(0).default(0),
    credit:    z.number().min(0).default(0),
    label:     z.string().optional(),
  })).min(1),
});

router.post("/journal", loadUser, async (req, res): Promise<void> => {
  const p = CreateEntryBody.safeParse(req.body);
  if (!p.success) { res.status(400).json({ error: p.error.message }); return; }
  const { reference, date, description, lines } = p.data;

  if (!checkBalance(lines)) {
    res.status(422).json({ error: "Déséquilibre débit/crédit : les totaux doivent être égaux." });
    return;
  }

  const [entry] = await db.insert(journalEntriesTable).values({
    id: crypto.randomUUID(),
    date: date ? new Date(date) : new Date(),
    reference,
    description: description ?? null,
    status: "draft",
  }).returning();

  await db.insert(journalLinesTable).values(
    lines.map(l => ({
      id: crypto.randomUUID(),
      entryId: entry.id,
      accountId: l.accountId,
      debit: l.debit,
      credit: l.credit,
      label: l.label ?? null,
    })),
  );

  await logAudit(entry.id, "created", { reference, lines: lines.length }, req.currentUser?.email ?? null);
  req.log.info({ entryId: entry.id, ref: reference }, "Journal entry created");
  res.status(201).json(await enrichEntry(entry));
});

// ── PATCH /journal/:id ────────────────────────────────────────────────────────
const UpdateEntryBody = z.object({
  reference:   z.string().min(1).optional(),
  date:        z.string().optional(),
  description: z.string().optional().nullable(),
  lines: z.array(z.object({
    accountId: z.string().min(1),
    debit:     z.number().min(0).default(0),
    credit:    z.number().min(0).default(0),
    label:     z.string().optional(),
  })).optional(),
});

router.patch("/journal/:id", loadUser, async (req, res): Promise<void> => {
  const [entry] = await db.select().from(journalEntriesTable).where(eq(journalEntriesTable.id, String(req.params.id)));
  if (!entry) { res.status(404).json({ error: "Écriture introuvable" }); return; }
  if (entry.status === "locked") { res.status(403).json({ error: "Écriture verrouillée — modification impossible" }); return; }

  const p = UpdateEntryBody.safeParse(req.body);
  if (!p.success) { res.status(400).json({ error: p.error.message }); return; }
  const d = p.data;

  if (d.lines && !checkBalance(d.lines)) {
    res.status(422).json({ error: "Déséquilibre débit/crédit : les totaux doivent être égaux." });
    return;
  }

  const updates: Partial<typeof journalEntriesTable.$inferInsert> = {};
  if (d.reference   !== undefined) updates.reference   = d.reference;
  if (d.date        !== undefined) updates.date        = new Date(d.date);
  if (d.description !== undefined) updates.description = d.description;
  if (entry.status === "validated") updates.status = "draft"; // revert to draft on edit

  const [updated] = await db.update(journalEntriesTable).set(updates)
    .where(eq(journalEntriesTable.id, entry.id)).returning();

  if (d.lines) {
    await db.delete(journalLinesTable).where(eq(journalLinesTable.entryId, entry.id));
    await db.insert(journalLinesTable).values(
      d.lines.map(l => ({
        id: crypto.randomUUID(),
        entryId: entry.id,
        accountId: l.accountId,
        debit: l.debit,
        credit: l.credit,
        label: l.label ?? null,
      })),
    );
  }

  await logAudit(entry.id, "updated", { before: { reference: entry.reference, status: entry.status }, after: d }, req.currentUser?.email ?? null);
  res.json(await enrichEntry(updated));
});

// ── DELETE /journal/:id ───────────────────────────────────────────────────────
router.delete("/journal/:id", loadUser, async (req, res): Promise<void> => {
  const [entry] = await db.select().from(journalEntriesTable).where(eq(journalEntriesTable.id, String(req.params.id)));
  if (!entry) { res.status(404).json({ error: "Écriture introuvable" }); return; }
  if (entry.status !== "draft") { res.status(403).json({ error: "Seules les écritures en brouillon peuvent être supprimées" }); return; }
  await db.delete(journalEntriesTable).where(eq(journalEntriesTable.id, entry.id));
  await logAudit(entry.id, "deleted", { reference: entry.reference }, req.currentUser?.email ?? null).catch(() => {});
  res.json({ ok: true });
});

// ── POST /journal/:id/validate ────────────────────────────────────────────────
router.post("/journal/:id/validate", loadUser, async (req, res): Promise<void> => {
  const [entry] = await db.select().from(journalEntriesTable).where(eq(journalEntriesTable.id, String(req.params.id)));
  if (!entry) { res.status(404).json({ error: "Écriture introuvable" }); return; }
  if (entry.status !== "draft") { res.status(400).json({ error: `Statut actuel : ${entry.status} — validation impossible` }); return; }

  // Re-check balance
  const lines = await db.select().from(journalLinesTable).where(eq(journalLinesTable.entryId, entry.id));
  if (!checkBalance(lines)) {
    res.status(422).json({ error: "Déséquilibre débit/crédit — validation impossible" });
    return;
  }

  const [updated] = await db.update(journalEntriesTable).set({ status: "validated" })
    .where(eq(journalEntriesTable.id, entry.id)).returning();
  await logAudit(entry.id, "validated", null, req.currentUser?.email ?? null);
  res.json(await enrichEntry(updated));
});

// ── POST /journal/:id/lock ────────────────────────────────────────────────────
router.post("/journal/:id/lock", loadUser, async (req, res): Promise<void> => {
  const [entry] = await db.select().from(journalEntriesTable).where(eq(journalEntriesTable.id, String(req.params.id)));
  if (!entry) { res.status(404).json({ error: "Écriture introuvable" }); return; }
  if (entry.status !== "validated") { res.status(400).json({ error: `Statut actuel : ${entry.status} — verrouillage impossible` }); return; }

  const [updated] = await db.update(journalEntriesTable).set({ status: "locked" })
    .where(eq(journalEntriesTable.id, entry.id)).returning();
  await logAudit(entry.id, "locked", null, req.currentUser?.email ?? null);
  res.json(await enrichEntry(updated));
});

// ── GET /journal/:id/audit ────────────────────────────────────────────────────
router.get("/journal/:id/audit", requireAuth, async (req, res): Promise<void> => {
  const logs = await db.select().from(journalAuditLogsTable)
    .where(eq(journalAuditLogsTable.entryId, String(req.params.id)))
    .orderBy(desc(journalAuditLogsTable.createdAt));
  res.json(logs.map(l => ({ ...l, createdAt: l.createdAt.toISOString() })));
});

// ── GET /journal/export/excel ─────────────────────────────────────────────────
router.get("/journal/export/excel", requireAuth, async (req, res): Promise<void> => {
  const { dateFrom, dateTo, status } = req.query as Record<string, string | undefined>;

  const conditions = [];
  if (dateFrom) conditions.push(gte(journalEntriesTable.date, new Date(dateFrom)));
  if (dateTo)   conditions.push(lte(journalEntriesTable.date, new Date(dateTo + "T23:59:59")));
  if (status)   conditions.push(eq(journalEntriesTable.status, status));

  const entries = await db.select().from(journalEntriesTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(journalEntriesTable.date);

  // Build flat rows for export
  const rows: object[] = [];
  for (const entry of entries) {
    const lines = await db.select()
      .from(journalLinesTable)
      .leftJoin(accountsTable, eq(journalLinesTable.accountId, accountsTable.id))
      .where(eq(journalLinesTable.entryId, entry.id));

    for (const { journal_lines: jl, accounts: a } of lines) {
      rows.push({
        Date:        entry.date.toLocaleDateString("fr-FR"),
        Référence:   entry.reference,
        Description: entry.description ?? "",
        Statut:      entry.status,
        Compte:      a?.code ?? "",
        Intitulé:    a?.name ?? "",
        Libellé:     (jl as typeof jl & { label?: string }).label ?? "",
        Débit:       jl.debit  > 0 ? jl.debit  : "",
        Crédit:      jl.credit > 0 ? jl.credit : "",
      });
    }
  }

  const ws = XLSX.utils.json_to_sheet(rows);

  // Column widths
  ws["!cols"] = [
    { wch: 12 }, { wch: 14 }, { wch: 30 }, { wch: 12 },
    { wch: 10 }, { wch: 30 }, { wch: 25 }, { wch: 14 }, { wch: 14 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Journal comptable");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const filename = `journal_${new Date().toISOString().slice(0, 10)}.xlsx`;

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buf);
});

// ── GET /journal/export/pdf ───────────────────────────────────────────────────
router.get("/journal/export/pdf", requireAuth, async (req, res): Promise<void> => {
  const { dateFrom, dateTo, status } = req.query as Record<string, string | undefined>;

  const conditions = [];
  if (dateFrom) conditions.push(gte(journalEntriesTable.date, new Date(dateFrom)));
  if (dateTo)   conditions.push(lte(journalEntriesTable.date, new Date(dateTo + "T23:59:59")));
  if (status)   conditions.push(eq(journalEntriesTable.status, status));

  const entries = await db.select().from(journalEntriesTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(journalEntriesTable.date);

  type LineRow = { journal_lines: typeof journalLinesTable.$inferSelect; accounts: typeof accountsTable.$inferSelect | null };
  const enrichedEntries: Array<{ entry: typeof journalEntriesTable.$inferSelect; lines: LineRow[] }> = [];
  for (const entry of entries) {
    const lines = await db.select()
      .from(journalLinesTable)
      .leftJoin(accountsTable, eq(journalLinesTable.accountId, accountsTable.id))
      .where(eq(journalLinesTable.entryId, entry.id));
    enrichedEntries.push({ entry, lines });
  }

  const fmtNum = (n: number) => n > 0 ? n.toLocaleString("fr-FR", { minimumFractionDigits: 2 }) : "";
  const fmtDate = (d: Date) => d.toLocaleDateString("fr-FR");

  const STATUS_LABEL: Record<string, string> = { draft: "Brouillon", validated: "Validé", locked: "Verrouillé" };

  const rows = enrichedEntries.map(({ entry, lines }) => {
    const lineRows = lines.map(({ journal_lines: jl, accounts: a }) => `
      <tr>
        <td></td><td></td>
        <td class="mono">${a?.code ?? ""}</td>
        <td>${a?.name ?? ""}</td>
        <td class="right mono">${fmtNum(jl.debit)}</td>
        <td class="right mono">${fmtNum(jl.credit)}</td>
      </tr>`).join("");

    const totalDebit  = lines.reduce((s, { journal_lines: jl }) => s + jl.debit,  0);
    const totalCredit = lines.reduce((s, { journal_lines: jl }) => s + jl.credit, 0);
    const statusLabel = STATUS_LABEL[entry.status] ?? entry.status;

    return `
      <tr class="entry-header">
        <td>${fmtDate(entry.date)}</td>
        <td class="mono">${entry.reference}</td>
        <td colspan="2">${entry.description ?? ""} <span class="badge badge-${entry.status}">${statusLabel}</span></td>
        <td class="right mono total">${fmtNum(totalDebit)}</td>
        <td class="right mono total">${fmtNum(totalCredit)}</td>
      </tr>
      ${lineRows}
      <tr class="separator"><td colspan="6"></td></tr>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Journal Comptable — Vanilla Madagascar</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #111; padding: 20px; }
  h1 { font-size: 18px; color: #1a3a2a; margin-bottom: 4px; }
  p.sub { font-size: 10px; color: #666; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #1a3a2a; color: #fff; padding: 6px 8px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; }
  td { padding: 4px 8px; border-bottom: 1px solid #eee; }
  .entry-header td { background: #f5f9f6; font-weight: 600; border-top: 2px solid #c5d9cb; }
  .separator td { height: 6px; border: none; }
  .right { text-align: right; }
  .mono  { font-family: 'Courier New', monospace; }
  .total { font-weight: 700; }
  .badge { display: inline-block; padding: 1px 6px; border-radius: 10px; font-size: 9px; font-weight: 700; text-transform: uppercase; }
  .badge-draft     { background: #fef3c7; color: #92400e; }
  .badge-validated { background: #d1fae5; color: #065f46; }
  .badge-locked    { background: #e0e7ff; color: #3730a3; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
<h1>Journal Comptable — Vanilla Madagascar ERP</h1>
<p class="sub">Exporté le ${new Date().toLocaleDateString("fr-FR")} · ${enrichedEntries.length} écriture(s)${dateFrom ? ` · du ${dateFrom}` : ""}${dateTo ? ` au ${dateTo}` : ""}</p>
<table>
  <thead>
    <tr>
      <th style="width:90px">Date</th>
      <th style="width:110px">Référence</th>
      <th style="width:70px">Compte</th>
      <th>Intitulé</th>
      <th style="width:120px;text-align:right">Débit</th>
      <th style="width:120px;text-align:right">Crédit</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
<script>window.onload = () => window.print();</script>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

export default router;
