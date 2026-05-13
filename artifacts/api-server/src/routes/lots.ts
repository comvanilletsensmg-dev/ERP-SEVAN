import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, lotsTable, suppliersTable, stockMovementsTable } from "@workspace/db";
import { UpdateLotBody, GetLotParams } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { requireRole } from "../middlewares/roles";
import { z } from "zod/v4";

const router: IRouter = Router();

const STATUS_ORDER = ["raw", "curing", "PHENOLED", "drying", "ready", "SHIPPED", "sold"];

// ─── GET /lots  (KPIs + enriched list) ───────────────────────────────────────
router.get("/lots", requireAuth, async (_req, res): Promise<void> => {
  const [kpiRow] = (await db.execute(sql`
    SELECT
      COUNT(*)::int                                            AS total,
      COALESCE(SUM(weight_current), 0)                        AS kg_stock,
      COALESCE(SUM(weight_initial - weight_current), 0)       AS total_loss,
      COUNT(*) FILTER (WHERE risk_level = 'HIGH')::int        AS high_risk,
      COUNT(*) FILTER (WHERE risk_level = 'MEDIUM')::int      AS medium_risk,
      COUNT(*) FILTER (WHERE is_blocked)::int                 AS blocked,
      COUNT(*) FILTER (WHERE status = 'ready')::int           AS ready_count,
      COUNT(*) FILTER (WHERE status IN ('SHIPPED','sold'))::int AS exported
    FROM lots
  `)).rows as any[];

  const rows = (await db.execute(sql`
    SELECT
      l.id, l.code, l.status, l.risk_level, l.risk_score, l.is_blocked, l.blocked_reason,
      l.weight_initial, l.weight_current, l.humidity, l.grade, l.warehouse, l.region, l.created_at,
      s.name        AS supplier_name,
      s.supplier_code,
      s.region      AS supplier_region,
      p.total_amount AS purchase_amount,
      p.price_per_kg,
      eo.client_name AS export_client,
      eo.destination AS export_destination,
      eo.status      AS export_status,
      eo.reference   AS export_ref
    FROM lots l
    LEFT JOIN suppliers s        ON s.id = l.supplier_id
    LEFT JOIN purchases p        ON p.id = l.purchase_id
    LEFT JOIN export_orders eo   ON eo.lot_id = l.id
    ORDER BY l.created_at DESC
  `)).rows;

  res.json({
    lots: rows,
    kpis: {
      total:      Number(kpiRow?.total ?? 0),
      kgStock:    Number(kpiRow?.kg_stock ?? 0),
      totalLoss:  Number(kpiRow?.total_loss ?? 0),
      highRisk:   Number(kpiRow?.high_risk ?? 0),
      mediumRisk: Number(kpiRow?.medium_risk ?? 0),
      blocked:    Number(kpiRow?.blocked ?? 0),
      readyCount: Number(kpiRow?.ready_count ?? 0),
      exported:   Number(kpiRow?.exported ?? 0),
    },
  });
});

// ─── GET /lots/:id  (full detail) ────────────────────────────────────────────
router.get("/lots/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetLotParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "ID invalide" }); return; }

  const [row] = (await db.execute(sql`
    SELECT
      l.*,
      s.id            AS sup_id,
      s.name          AS sup_name,
      s.supplier_code AS sup_code,
      s.region        AS sup_region,
      s.email         AS sup_email,
      s.mobile        AS sup_mobile,
      s.city          AS sup_city,
      s.country       AS sup_country,
      p.id            AS pur_id,
      p.total_amount  AS pur_total,
      p.price_per_kg  AS pur_price_per_kg,
      p.payment_method AS pur_payment,
      p.humidity      AS pur_humidity,
      p.weight        AS pur_weight,
      p.created_at    AS pur_date,
      lc.purchase_cost, lc.process_cost, lc.transport_cost, lc.total_cost, lc.cost_per_kg AS real_cost_per_kg,
      eo.id           AS exp_id,
      eo.reference    AS exp_ref,
      eo.client_name  AS exp_client,
      eo.destination  AS exp_dest,
      eo.status       AS exp_status,
      eo.quantity_kg  AS exp_kg,
      eo.deadline     AS exp_deadline
    FROM lots l
    LEFT JOIN suppliers s      ON s.id = l.supplier_id
    LEFT JOIN purchases p      ON p.id = l.purchase_id
    LEFT JOIN lot_costs lc     ON lc.lot_id = l.id
    LEFT JOIN export_orders eo ON eo.lot_id = l.id
    WHERE l.id = ${params.data.id}
    LIMIT 1
  `)).rows as any[];

  if (!row) { res.status(404).json({ error: "Lot introuvable" }); return; }

  const [movements, history, riskEvents, metrics, predictions] = await Promise.all([
    db.execute(sql`SELECT id, type, quantity, note, created_at FROM stock_movements WHERE lot_id = ${params.data.id} ORDER BY created_at DESC`),
    db.execute(sql`SELECT id, status, humidity, weight, note, created_by, created_at FROM lot_histories WHERE lot_id = ${params.data.id} ORDER BY created_at ASC`),
    db.execute(sql`SELECT id, risk_level, score, reason, created_at FROM risk_events WHERE lot_id = ${params.data.id} ORDER BY created_at DESC LIMIT 20`),
    db.execute(sql`SELECT id, date, humidity, weight, temp, storage FROM lot_metrics WHERE lot_id = ${params.data.id} ORDER BY date DESC LIMIT 15`),
    db.execute(sql`SELECT id, type, date, value, confidence FROM predictions WHERE lot_id = ${params.data.id} ORDER BY date DESC LIMIT 10`),
  ]);

  const loss = Number(row.weight_initial) - Number(row.weight_current);
  const lossPct = Number(row.weight_initial) > 0 ? (loss / Number(row.weight_initial)) * 100 : 0;

  res.json({
    id: row.id, code: row.code, status: row.status,
    riskLevel: row.risk_level, riskScore: row.risk_score,
    isBlocked: row.is_blocked, blockedReason: row.blocked_reason,
    weightInitial: Number(row.weight_initial), weightCurrent: Number(row.weight_current),
    loss: Math.round(loss * 100) / 100, lossPct: Math.round(lossPct * 10) / 10,
    humidity: Number(row.humidity), grade: row.grade,
    warehouse: row.warehouse, region: row.region,
    createdAt: row.created_at,
    supplier: row.sup_id ? {
      id: row.sup_id, name: row.sup_name, code: row.sup_code,
      region: row.sup_region, email: row.sup_email, mobile: row.sup_mobile,
      city: row.sup_city, country: row.sup_country,
    } : null,
    purchase: row.pur_id ? {
      id: row.pur_id, totalAmount: Number(row.pur_total),
      pricePerKg: Number(row.pur_price_per_kg), paymentMethod: row.pur_payment,
      humidity: Number(row.pur_humidity), weight: Number(row.pur_weight),
      createdAt: row.pur_date,
    } : null,
    costs: row.purchase_cost != null ? {
      purchaseCost: Number(row.purchase_cost), processCost: Number(row.process_cost),
      transportCost: Number(row.transport_cost), totalCost: Number(row.total_cost),
      costPerKg: Number(row.real_cost_per_kg),
    } : null,
    export: row.exp_id ? {
      id: row.exp_id, reference: row.exp_ref, client: row.exp_client,
      destination: row.exp_dest, status: row.exp_status,
      quantityKg: Number(row.exp_kg), deadline: row.exp_deadline,
    } : null,
    movements: movements.rows,
    history: history.rows,
    riskEvents: riskEvents.rows,
    metrics: metrics.rows,
    predictions: predictions.rows,
  });
});

// ─── PUT /lots/:id ────────────────────────────────────────────────────────────
router.put("/lots/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetLotParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const parsed = UpdateLotBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [current] = await db.select().from(lotsTable).where(eq(lotsTable.id, params.data.id));
  if (!current) { res.status(404).json({ error: "Lot introuvable" }); return; }

  const { weightCurrent, ...rest } = parsed.data;

  if (weightCurrent !== undefined && weightCurrent !== null) {
    const weightRounded = Math.round(weightCurrent * 100) / 100;
    const loss = Math.round((current.weightCurrent - weightRounded) * 100) / 100;
    if (loss > 0) {
      await db.insert(stockMovementsTable).values({
        lotId: current.id, type: "LOSS", quantity: loss,
        note: `Perte transformation lot ${current.code}: ${current.weightCurrent}kg → ${weightRounded}kg`,
      });
    }
    const [lot] = await db.update(lotsTable).set({ ...rest, weightCurrent: weightRounded }).where(eq(lotsTable.id, params.data.id)).returning();
    const [supplier] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, lot.supplierId));

    // Write history entry
    if (rest.status && rest.status !== current.status) {
      await db.execute(sql`
        INSERT INTO lot_histories (id, lot_id, status, humidity, weight, note, created_by)
        VALUES (gen_random_uuid()::text, ${lot.id}, ${lot.status}, ${lot.humidity}, ${weightRounded}, ${'Changement statut ' + current.status + ' → ' + lot.status}, ${req.session?.userId ?? null})
      `);
    }

    req.log.info({ lotId: lot.id, status: lot.status, weight: weightRounded }, "Lot mis à jour");
    res.json({ ...lot, createdAt: lot.createdAt.toISOString(), supplier: supplier ? { ...supplier, createdAt: supplier.createdAt.toISOString() } : undefined });
    return;
  }

  const [lot] = await db.update(lotsTable).set(rest).where(eq(lotsTable.id, params.data.id)).returning();
  if (!lot) { res.status(404).json({ error: "Lot introuvable" }); return; }

  if (rest.status && rest.status !== current.status) {
    await db.execute(sql`
      INSERT INTO lot_histories (id, lot_id, status, humidity, weight, note, created_by)
      VALUES (gen_random_uuid()::text, ${lot.id}, ${lot.status}, ${lot.humidity}, ${lot.weightCurrent}, ${'Changement statut ' + current.status + ' → ' + lot.status}, ${req.session?.userId ?? null})
    `);
  }

  const [supplier] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, lot.supplierId));
  req.log.info({ lotId: lot.id, status: lot.status }, "Lot mis à jour");
  res.json({ ...lot, createdAt: lot.createdAt.toISOString(), supplier: supplier ? { ...supplier, createdAt: supplier.createdAt.toISOString() } : undefined });
});

// ─── POST /lots/:id/history  (add note) ──────────────────────────────────────
const historySchema = z.object({ note: z.string().min(1), status: z.string().optional() });

router.post("/lots/:id/history", requireAuth, async (req, res): Promise<void> => {
  const { id } = req.params;
  const parsed = historySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Note requise" }); return; }

  const [lot] = await db.select().from(lotsTable).where(eq(lotsTable.id, id));
  if (!lot) { res.status(404).json({ error: "Lot introuvable" }); return; }

  const [row] = (await db.execute(sql`
    INSERT INTO lot_histories (id, lot_id, status, humidity, weight, note, created_by)
    VALUES (gen_random_uuid()::text, ${lot.id}, ${parsed.data.status ?? lot.status}, ${lot.humidity}, ${lot.weightCurrent}, ${parsed.data.note}, ${req.session?.userId ?? null})
    RETURNING *
  `)).rows as any[];

  req.log.info({ lotId: id, note: parsed.data.note }, "Historique lot ajouté");
  res.status(201).json(row);
});

// ─── DELETE /lots/:id  (SUPER_ADMIN + LOGISTICS_MANAGER) ─────────────────────
router.delete("/lots/:id", requireAuth, requireRole("SUPER_ADMIN", "LOGISTICS_MANAGER"), async (req, res): Promise<void> => {
  const { id } = req.params;

  const [lot] = await db.select().from(lotsTable).where(eq(lotsTable.id, id));
  if (!lot) { res.status(404).json({ error: "Lot introuvable" }); return; }

  // Block if lot is exported or sold
  if (["SHIPPED", "sold"].includes(lot.status)) {
    res.status(409).json({ error: `Impossible de supprimer un lot en statut "${lot.status}". Le lot a déjà été exporté ou vendu.` });
    return;
  }

  // Block if linked to a shipped/delivered export order
  const [linkedExport] = (await db.execute(sql`
    SELECT id, reference, status FROM export_orders WHERE lot_id = ${id} AND status IN ('shipped','delivered') LIMIT 1
  `)).rows as any[];

  if (linkedExport) {
    res.status(409).json({ error: `Lot lié à la commande export ${linkedExport.reference} (${linkedExport.status}) — suppression impossible.` });
    return;
  }

  // Nullify lot_id on tables that use NO ACTION FK (bonuses, sale_items, stock_movements)
  // so the CASCADE tables can delete cleanly afterward
  try {
    await db.execute(sql`UPDATE bonuses        SET lot_id = NULL WHERE lot_id = ${id}`);
    await db.execute(sql`UPDATE sale_items     SET lot_id = NULL WHERE lot_id = ${id}`);
    await db.execute(sql`UPDATE stock_movements SET lot_id = NULL WHERE lot_id = ${id}`);

    // Now delete — CASCADE handles lot_histories, lot_metrics, lot_costs, risk_events, predictions
    await db.delete(lotsTable).where(eq(lotsTable.id, id));
  } catch (err: any) {
    req.log.error({ err, lotId: id }, "Erreur lors de la suppression du lot");
    res.status(500).json({ error: `Suppression échouée : ${err?.message ?? "erreur base de données"}` });
    return;
  }

  req.log.info({ lotId: id, lotCode: lot.code, status: lot.status, userId: req.session?.userId }, "Lot supprimé");

  res.json({ success: true, deletedId: id, lotCode: lot.code });
});

export default router;
