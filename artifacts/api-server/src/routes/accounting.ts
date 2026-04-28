import { Router, type IRouter } from "express";
import { db, accountsTable, journalEntriesTable, journalLinesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/accounts", requireAuth, async (_req, res): Promise<void> => {
  const accounts = await db.select().from(accountsTable).orderBy(accountsTable.code);
  res.json(accounts);
});

router.get("/journal", requireAuth, async (_req, res): Promise<void> => {
  const entries = await db
    .select()
    .from(journalEntriesTable)
    .orderBy(journalEntriesTable.date);

  const result = await Promise.all(
    entries.map(async (entry) => {
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
          account: a || undefined,
        })),
      };
    })
  );

  res.json(result);
});

export default router;
