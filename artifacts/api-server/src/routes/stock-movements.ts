import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import {
  db, stockMovementsTable, lotsTable, suppliersTable,
  journalEntriesTable, journalLinesTable, accountsTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { requireRole } from "../middlewares/roles";
import { z } from "zod/v4";

const router: IRouter = Router();

// ─── GET /stock-movements ──────────────────────────────────────────────────────
router.get("/stock-movements", requireAuth, async (_req, res): Promise<void> => {
  const movements = (await db.execute(sql`
    SELECT
      sm.id, sm.lot_id, sm.type, sm.quantity, sm.note,
      sm.unit_cost, sm.warehouse, sm.reference, sm.sale_id, sm.purchase_id,
      sm.created_at,
      l.code       AS lot_code,
      l.status     AS lot_status,
      l.region     AS lot_region,
      l.warehouse  AS lot_warehouse,
      s.id         AS supplier_id,
      s.name       AS supplier_name,
      sa.id        AS linked_sale_id,
      sa.total_amount AS sale_amount,
      sa.currency     AS sale_currency,
      cl.id        AS client_id,
      cl.name      AS client_name
    FROM stock_movements sm
    LEFT JOIN lots     l  ON l.id  = sm.lot_id
    LEFT JOIN suppliers s ON s.id  = l.supplier_id
    LEFT JOIN sales    sa ON sa.id = sm.sale_id
    LEFT JOIN clients  cl ON cl.id = sa.client_id
    WHERE sm.deleted_at IS NULL
    ORDER BY sm.created_at DESC
  `)).rows;

  const [kpis] = (await db.execute(sql`
    SELECT
      COALESCE(SUM(CASE WHEN type IN ('IN','RETURN')                      THEN quantity ELSE 0 END), 0)::float AS total_in,
      COALESCE(SUM(CASE WHEN type IN ('OUT','EXPORT')                     THEN quantity ELSE 0 END), 0)::float AS total_out,
      COALESCE(SUM(CASE WHEN type = 'LOSS'                                THEN quantity ELSE 0 END), 0)::float AS total_loss,
      COALESCE(SUM(CASE WHEN type IN ('TRANSFER','TRANSFORMATION')        THEN quantity ELSE 0 END), 0)::float AS total_transfer,
      COALESCE(SUM(CASE WHEN type = 'ADJUSTMENT'                          THEN quantity ELSE 0 END), 0)::float AS total_adjustment,
      COUNT(*)::int AS total_movements,
      COALESCE(SUM(CASE WHEN unit_cost IS NOT NULL THEN quantity * unit_cost ELSE 0 END), 0)::float AS total_value
    FROM stock_movements
    WHERE deleted_at IS NULL
  `)).rows as any[];

  res.json({ movements, kpis });
});

// ─── POST /stock-movements ────────────────────────────────────────────────────
const MOVEMENT_TYPES = ["IN","OUT","LOSS","TRANSFER","ADJUSTMENT","RETURN","EXPORT","TRANSFORMATION"] as const;

const createSchema = z.object({
  lotId:      z.string().min(1),
  type:       z.enum(MOVEMENT_TYPES),
  quantity:   z.number().positive(),
  note:       z.string().optional(),
  unitCost:   z.number().optional(),
  warehouse:  z.string().optional(),
  reference:  z.string().optional(),
  saleId:     z.string().optional(),
  purchaseId: z.string().optional(),
  withAccounting: z.boolean().optional(),
});

router.post("/stock-movements", requireAuth, async (req, res): Promise<void> => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Données invalides" }); return; }

  const { lotId, type, quantity, note, unitCost, warehouse, reference, saleId, purchaseId, withAccounting } = parsed.data;

  // Verify lot exists
  const [lot] = await db.select().from(lotsTable).where(eq(lotsTable.id, lotId));
  if (!lot) { res.status(404).json({ error: "Lot introuvable" }); return; }

  // Insert movement using raw SQL (new columns not in Drizzle model)
  const newId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  await db.execute(sql`
    INSERT INTO stock_movements
      (id, lot_id, type, quantity, note, unit_cost, warehouse, reference, sale_id, purchase_id)
    VALUES
      (${newId}, ${lotId}, ${type}, ${quantity},
       ${note ?? null}, ${unitCost ?? null}, ${warehouse ?? null},
       ${reference ?? null}, ${saleId ?? null}, ${purchaseId ?? null})
  `);

  // Optional accounting entry for stock valuation
  if (unitCost && withAccounting && (type === "OUT" || type === "LOSS" || type === "EXPORT")) {
    const stockChargeCode = type === "LOSS" ? "603" : "607";
    const [chargeAcc] = await db.select().from(accountsTable).where(eq(accountsTable.code, stockChargeCode));
    const [stockAcc]  = await db.select().from(accountsTable).where(eq(accountsTable.code, "31"));

    if (chargeAcc && stockAcc) {
      const value = quantity * unitCost;
      const [entry] = await db.insert(journalEntriesTable).values({
        date:        new Date(),
        reference:   `STK-${newId.slice(0, 8).toUpperCase()}`,
        description: `Variation stock — ${type} ${lot.code} — ${quantity} kg`,
      }).returning();
      await db.insert(journalLinesTable).values([
        { entryId: entry.id, accountId: chargeAcc.id, debit: value, credit: 0,     label: `${type} stock ${lot.code}` },
        { entryId: entry.id, accountId: stockAcc.id,  debit: 0,     credit: value, label: `Stocks marchandises` },
      ]);
    }
  }

  req.log.info({ id: newId, lotId, type, quantity }, "Mouvement stock créé");
  res.status(201).json({ id: newId, lotId, type, quantity, note, unitCost, warehouse, reference, createdAt: new Date().toISOString() });
});

// ─── DELETE /stock-movements/:id  (soft delete + journal) ────────────────────
router.delete("/stock-movements/:id",
  requireAuth,
  requireRole("SUPER_ADMIN", "ACCOUNTANT"),
  async (req, res): Promise<void> => {
    const { id } = req.params;
    const user   = (req as any).user;

    const [movement] = (await db.execute(sql`
      SELECT * FROM stock_movements WHERE id = ${id} AND deleted_at IS NULL LIMIT 1
    `)).rows as any[];

    if (!movement) { res.status(404).json({ error: "Mouvement introuvable" }); return; }

    // Soft delete — keep record for audit trail
    await db.execute(sql`
      UPDATE stock_movements
      SET deleted_at = NOW(),
          deleted_by = ${user?.email ?? user?.id ?? "system"}
      WHERE id = ${id}
    `);

    req.log.info(
      { movementId: id, type: movement.type, quantity: movement.quantity, deletedBy: user?.email },
      "Mouvement stock supprimé (soft delete)"
    );
    res.json({ success: true });
  }
);

export default router;
