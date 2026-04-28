import { Router, type IRouter } from "express";
import { db, accountsTable, journalLinesTable } from "@workspace/db";
import { eq, sql, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

// Balance générale: solde débit - crédit par compte
router.get("/reports/balance", requireAuth, async (req, res): Promise<void> => {
  const accounts = await db.select().from(accountsTable).orderBy(accountsTable.code);
  const lines = await db
    .select({
      accountId: journalLinesTable.accountId,
      totalDebit: sql<number>`COALESCE(SUM(${journalLinesTable.debit}), 0)`,
      totalCredit: sql<number>`COALESCE(SUM(${journalLinesTable.credit}), 0)`,
    })
    .from(journalLinesTable)
    .groupBy(journalLinesTable.accountId);

  const lineMap = new Map(lines.map(l => [l.accountId, l]));

  const report = accounts.map(a => {
    const l = lineMap.get(a.id);
    const debit = l ? Number(l.totalDebit) : 0;
    const credit = l ? Number(l.totalCredit) : 0;
    return { ...a, debit, credit, solde: debit - credit };
  }).filter(a => a.debit !== 0 || a.credit !== 0);

  res.json(report);
});

// Compte de résultat
router.get("/reports/income", requireAuth, async (req, res): Promise<void> => {
  const accounts = await db.select().from(accountsTable);
  const lines = await db
    .select({
      accountId: journalLinesTable.accountId,
      totalDebit: sql<number>`COALESCE(SUM(${journalLinesTable.debit}), 0)`,
      totalCredit: sql<number>`COALESCE(SUM(${journalLinesTable.credit}), 0)`,
    })
    .from(journalLinesTable)
    .groupBy(journalLinesTable.accountId);

  const lineMap = new Map(lines.map(l => [l.accountId, l]));

  let totalRevenue = 0;
  let totalCharges = 0;

  const revenues: any[] = [];
  const charges: any[] = [];

  for (const a of accounts) {
    const l = lineMap.get(a.id);
    if (!l) continue;
    const debit = Number(l.totalDebit);
    const credit = Number(l.totalCredit);
    if (a.type === "revenue") {
      const amount = credit - debit;
      if (amount !== 0) { revenues.push({ ...a, amount }); totalRevenue += amount; }
    } else if (a.type === "expense") {
      const amount = debit - credit;
      if (amount !== 0) { charges.push({ ...a, amount }); totalCharges += amount; }
    }
  }

  res.json({ revenues, charges, totalRevenue, totalCharges, resultat: totalRevenue - totalCharges });
});

// Rapport TVA — aggregate from journal entries on all TVA accounts (445, 44566, 44571)
router.get("/reports/tva", requireAuth, async (req, res): Promise<void> => {
  const accounts = await db.select().from(accountsTable);
  // TVA accounts: 445 (generic), 44566 (déductible/debit), 44571 (collectée/credit)
  const tvaAccounts = accounts.filter(a => ["445", "44566", "44571"].includes(a.code));
  if (tvaAccounts.length === 0) { res.json({ tvaCollectee: 0, tvaDeduite: 0, solde: 0, fromJournal: {}, fromInvoices: {} }); return; }

  const tvaIds = tvaAccounts.map(a => a.id);
  const lines = await db
    .select({
      accountId: journalLinesTable.accountId,
      totalDebit: sql<number>`COALESCE(SUM(${journalLinesTable.debit}), 0)`,
      totalCredit: sql<number>`COALESCE(SUM(${journalLinesTable.credit}), 0)`,
    })
    .from(journalLinesTable)
    .where(inArray(journalLinesTable.accountId, tvaIds))
    .groupBy(journalLinesTable.accountId);

  let tvaCollectee = 0;
  let tvaDeduite = 0;

  for (const l of lines) {
    const acc = tvaAccounts.find(a => a.id === l.accountId);
    if (!acc) continue;
    const debit = Number(l.totalDebit);
    const credit = Number(l.totalCredit);
    if (acc.code === "44566") { tvaDeduite += debit - credit; }
    else if (acc.code === "44571") { tvaCollectee += credit - debit; }
    else { // 445: credits = collected, debits = deductible
      tvaCollectee += credit;
      tvaDeduite += debit;
    }
  }

  res.json({
    tvaCollectee,
    tvaDeduite,
    solde: tvaCollectee - tvaDeduite,
    fromJournal: { tvaCollectee, tvaDeduite },
    fromInvoices: {},
  });
});

// Grand livre — toutes les lignes d'un compte
router.get("/reports/ledger/:accountCode", requireAuth, async (req, res): Promise<void> => {
  const { accountCode } = req.params;
  const [account] = await db.select().from(accountsTable).where(eq(accountsTable.code, accountCode));
  if (!account) { res.status(404).json({ error: "Account not found" }); return; }

  const lines = await db
    .select()
    .from(journalLinesTable)
    .where(eq(journalLinesTable.accountId, account.id));

  res.json({ account, lines });
});

export default router;
