import { Router, type IRouter } from "express";
import {
  db, fixedAssetsTable, assetMaintenanceTable,
  accountsTable, journalEntriesTable, journalLinesTable,
} from "@workspace/db";
import { eq, desc, sql, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

// ─── helpers ───────────────────────────────────────────────────────────────────
async function findOrCreateAccount(code: string, name: string, type: string): Promise<string> {
  const [row] = await db.select().from(accountsTable).where(eq(accountsTable.code, code));
  if (row) return row.id;
  const [created] = await db.execute(sql`
    INSERT INTO accounts (id, code, name, type)
    VALUES (gen_random_uuid()::text, ${code}, ${name}, ${type})
    RETURNING id
  `).then(r => r.rows);
  return created.id as string;
}

const PCG_ACCOUNTS: Record<string, { code: string; name: string }> = {
  equipment: { code: "2154", name: "Matériel industriel et outillage" },
  vehicle:   { code: "2182", name: "Matériel de transport" },
  building:  { code: "213",  name: "Constructions" },
  furniture: { code: "2184", name: "Mobilier" },
  other:     { code: "218",  name: "Immobilisations corporelles" },
};

async function nextAssetNumber(): Promise<string> {
  const r = await db.execute(sql`
    SELECT asset_number FROM fixed_assets
    WHERE asset_number IS NOT NULL ORDER BY asset_number DESC LIMIT 1
  `);
  if (!r.rows.length) return "IMM-001";
  const last = (r.rows[0].asset_number as string).replace("IMM-", "");
  const n = parseInt(last, 10) + 1;
  return `IMM-${String(n).padStart(3, "0")}`;
}

// ─── PCG amortization table builder ────────────────────────────────────────────
function buildDepreciationTable(asset: {
  value: number; residualValue: number; accumulatedDepreciation: number;
  startDate: Date | string; durationMonths: number;
}) {
  const depreciableAmount = asset.value - asset.residualValue;
  const years = asset.durationMonths / 12;
  const annualDotation = depreciableAmount / years;
  const start = new Date(asset.startDate);
  const startYear = start.getFullYear();
  const currentYear = new Date().getFullYear();
  const rows = [];
  let cumulated = 0;

  for (let i = 0; i < Math.ceil(years); i++) {
    const year = startYear + i;
    const openingVNC = asset.value - cumulated;
    const remaining = openingVNC - asset.residualValue;
    const dotation = Math.max(0, Math.min(annualDotation, remaining));
    cumulated += dotation;
    const closingVNC = Math.max(asset.residualValue, asset.value - cumulated);

    rows.push({
      year,
      grossValue: asset.value,
      openingNetValue: Math.round(openingVNC),
      depreciation: Math.round(dotation),
      accumulatedDepreciation: Math.round(cumulated),
      closingNetValue: Math.round(closingVNC),
      isPast: year < currentYear,
      isCurrent: year === currentYear,
      isPosted: cumulated <= asset.accumulatedDepreciation + 1, // approximate
    });
  }
  return rows;
}

// ─── GET /api/assets/dashboard ────────────────────────────────────────────────
router.get("/assets/dashboard", requireAuth, async (_req, res): Promise<void> => {
  const assets = await db.select().from(fixedAssetsTable);

  const totalGross = assets.reduce((s, a) => s + a.value, 0);
  const totalVNC = assets.reduce((s, a) => s + (a.value - a.accumulatedDepreciation), 0);
  const totalAmort = assets.reduce((s, a) => s + a.accumulatedDepreciation, 0);
  const activeCount = assets.filter(a => a.status === "active").length;
  const fullyDepreciated = assets.filter(a => a.status === "fully_depreciated").length;
  const disposedCount = assets.filter(a => a.status === "disposed").length;

  // Monthly dotation théorique
  const monthlyDotation = assets
    .filter(a => a.status === "active")
    .reduce((s, a) => s + (a.value - a.residualValue) / a.durationMonths, 0);

  // Upcoming maintenances
  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 86400000);
  const upcomingMaintenance = assets.filter(a =>
    a.nextMaintenanceDate && new Date(a.nextMaintenanceDate) <= in30
  );

  // Category breakdown
  const byCategory: Record<string, { count: number; value: number }> = {};
  for (const a of assets) {
    if (!byCategory[a.category]) byCategory[a.category] = { count: 0, value: 0 };
    byCategory[a.category].count++;
    byCategory[a.category].value += a.value - a.accumulatedDepreciation;
  }

  res.json({
    kpis: { totalGross, totalVNC, totalAmort, activeCount, fullyDepreciated, disposedCount, monthlyDotation },
    byCategory,
    upcomingMaintenance,
    assets,
  });
});

// ─── GET /api/assets ──────────────────────────────────────────────────────────
router.get("/assets", requireAuth, async (_req, res): Promise<void> => {
  const assets = await db.select().from(fixedAssetsTable).orderBy(fixedAssetsTable.assetNumber);
  res.json(assets);
});

// ─── POST /api/assets ─────────────────────────────────────────────────────────
router.post("/assets", requireAuth, async (req, res): Promise<void> => {
  const {
    name, category, value, residualValue, startDate, durationMonths, currency, notes,
    location, serialNumber, acquisitionType, responsibleId, purchaseId, supplierId, lotId,
  } = req.body;
  if (!name || !value || !startDate || !durationMonths) {
    res.status(400).json({ error: "name, value, startDate, durationMonths required" });
    return;
  }
  const cat = category ?? "equipment";
  const pcg = PCG_ACCOUNTS[cat] ?? PCG_ACCOUNTS.other;
  await findOrCreateAccount(pcg.code, pcg.name, "asset");
  const assetNumber = await nextAssetNumber();

  const [asset] = await db.insert(fixedAssetsTable).values({
    name, category: cat,
    value: Number(value),
    residualValue: Number(residualValue ?? 0),
    accumulatedDepreciation: 0,
    startDate: new Date(startDate),
    durationMonths: Number(durationMonths),
    currency: currency ?? "MGA",
    notes,
    status: "active",
    assetNumber,
    pcgAccount: pcg.code,
    acquisitionType: acquisitionType ?? "purchase",
    location, serialNumber, responsibleId, purchaseId, supplierId, lotId,
  }).returning();
  res.status(201).json(asset);
});

// ─── GET /api/assets/:id ──────────────────────────────────────────────────────
router.get("/assets/:id", requireAuth, async (req, res): Promise<void> => {
  const { id } = req.params;
  const [asset] = await db.select().from(fixedAssetsTable).where(eq(fixedAssetsTable.id, id));
  if (!asset) { res.status(404).json({ error: "Actif non trouvé" }); return; }

  // Fetch linked entities in parallel
  const [maintenance, journalRows, supplierRow, employeeRow, purchaseRow, lotRow] = await Promise.all([
    db.select().from(assetMaintenanceTable)
      .where(eq(assetMaintenanceTable.assetId, id))
      .orderBy(desc(assetMaintenanceTable.date)),
    db.execute(sql`
      SELECT je.id, je.date, je.reference, je.description, je.status,
             SUM(jl.debit) as debit, SUM(jl.credit) as credit
      FROM journal_entries je
      JOIN journal_lines jl ON jl.entry_id = je.id
      WHERE je.reference LIKE ${'AMORT-' + asset.name.slice(0, 10).toUpperCase() + '%'}
         OR je.reference LIKE ${'AMORT-' + (asset.assetNumber ?? id).toUpperCase() + '%'}
      GROUP BY je.id ORDER BY je.date DESC LIMIT 24
    `),
    asset.supplierId
      ? db.execute(sql`SELECT id, name FROM suppliers WHERE id = ${asset.supplierId} LIMIT 1`)
      : Promise.resolve({ rows: [] }),
    asset.responsibleId
      ? db.execute(sql`SELECT id, name, position FROM employees WHERE id = ${asset.responsibleId} LIMIT 1`)
      : Promise.resolve({ rows: [] }),
    asset.purchaseId
      ? db.execute(sql`SELECT id, total_amount, payment_method, created_at FROM purchases WHERE id = ${asset.purchaseId} LIMIT 1`)
      : Promise.resolve({ rows: [] }),
    asset.lotId
      ? db.execute(sql`SELECT id, reference, status FROM lots WHERE id = ${asset.lotId} LIMIT 1`)
      : Promise.resolve({ rows: [] }),
  ]);

  const depreciationTable = buildDepreciationTable(asset);
  const currentNetValue = asset.value - asset.accumulatedDepreciation;
  const pctDepreciated = asset.value > 0 ? (asset.accumulatedDepreciation / asset.value) * 100 : 0;
  const monthlyDotation = (asset.value - asset.residualValue) / asset.durationMonths;

  res.json({
    asset,
    depreciationTable,
    maintenance,
    journalEntries: journalRows.rows,
    supplier: supplierRow.rows[0] ?? null,
    employee: employeeRow.rows[0] ?? null,
    purchase: purchaseRow.rows[0] ?? null,
    lot: lotRow.rows[0] ?? null,
    computed: { currentNetValue, pctDepreciated, monthlyDotation },
  });
});

// ─── PUT /api/assets/:id ──────────────────────────────────────────────────────
router.put("/assets/:id", requireAuth, async (req, res): Promise<void> => {
  const { id } = req.params;
  const {
    name, category, location, serialNumber, notes,
    responsibleId, nextMaintenanceDate, status,
  } = req.body;
  const [updated] = await db.update(fixedAssetsTable)
    .set({
      ...(name && { name }),
      ...(category && { category }),
      ...(location !== undefined && { location }),
      ...(serialNumber !== undefined && { serialNumber }),
      ...(notes !== undefined && { notes }),
      ...(responsibleId !== undefined && { responsibleId }),
      ...(nextMaintenanceDate && { nextMaintenanceDate: new Date(nextMaintenanceDate) }),
      ...(status && { status }),
    })
    .where(eq(fixedAssetsTable.id, id))
    .returning();
  res.json(updated);
});

// ─── GET /api/assets/:id/depreciation-table ───────────────────────────────────
router.get("/assets/:id/depreciation-table", requireAuth, async (req, res): Promise<void> => {
  const { id } = req.params;
  const [asset] = await db.select().from(fixedAssetsTable).where(eq(fixedAssetsTable.id, id));
  if (!asset) { res.status(404).json({ error: "Actif non trouvé" }); return; }
  res.json(buildDepreciationTable(asset));
});

// ─── POST /api/assets/:id/depreciate (existing — kept + enhanced) ─────────────
router.post("/assets/:id/depreciate", requireAuth, async (req, res): Promise<void> => {
  const { id } = req.params;
  const [asset] = await db.select().from(fixedAssetsTable).where(eq(fixedAssetsTable.id, id));
  if (!asset) { res.status(404).json({ error: "Asset not found" }); return; }
  if (asset.status !== "active") { res.status(400).json({ error: "Asset is not active" }); return; }

  const monthlyDepreciation = (asset.value - asset.residualValue) / asset.durationMonths;
  const newAccumulated = asset.accumulatedDepreciation + monthlyDepreciation;
  const isFullyDepreciated = newAccumulated >= (asset.value - asset.residualValue);

  const [updated] = await db.update(fixedAssetsTable)
    .set({
      accumulatedDepreciation: newAccumulated,
      status: isFullyDepreciated ? "fully_depreciated" : "active",
    })
    .where(eq(fixedAssetsTable.id, id))
    .returning();

  try {
    const debitId = await findOrCreateAccount("681", "Dotations aux amortissements", "expense");
    const creditId = await findOrCreateAccount("281", "Amortissements immobilisations", "liability");
    const ref = `AMORT-${(asset.assetNumber ?? asset.name.slice(0, 8)).toUpperCase()}`;
    const [entry] = await db.insert(journalEntriesTable).values({
      date: new Date(),
      reference: ref,
      description: `Dotation amortissement — ${asset.name}`,
      status: "validated",
    }).returning();
    await db.insert(journalLinesTable).values([
      { entryId: entry.id, accountId: debitId, debit: monthlyDepreciation, credit: 0, label: `Dotation ${asset.name}` },
      { entryId: entry.id, accountId: creditId, debit: 0, credit: monthlyDepreciation, label: `Amort. ${asset.name}` },
    ]);
  } catch (_) {}

  res.json({ asset: updated, monthlyDepreciation, totalAccumulated: newAccumulated });
});

// ─── GET /api/assets/:id/maintenance ─────────────────────────────────────────
router.get("/assets/:id/maintenance", requireAuth, async (req, res): Promise<void> => {
  const { id } = req.params;
  const rows = await db.select().from(assetMaintenanceTable)
    .where(eq(assetMaintenanceTable.assetId, id))
    .orderBy(desc(assetMaintenanceTable.date));
  res.json(rows);
});

// ─── POST /api/assets/:id/maintenance ────────────────────────────────────────
router.post("/assets/:id/maintenance", requireAuth, async (req, res): Promise<void> => {
  const { id } = req.params;
  const { date, description, cost, type, technician, nextMaintenanceDate } = req.body;
  if (!date || !description) {
    res.status(400).json({ error: "date and description required" });
    return;
  }
  const [row] = await db.insert(assetMaintenanceTable).values({
    assetId: id, date: new Date(date), description,
    cost: Number(cost ?? 0), type: type ?? "preventive",
    technician: technician ?? null,
    nextMaintenanceDate: nextMaintenanceDate ? new Date(nextMaintenanceDate) : null,
  }).returning();

  // Update asset's last/next maintenance dates
  await db.update(fixedAssetsTable)
    .set({
      lastMaintenanceDate: new Date(date),
      ...(nextMaintenanceDate && { nextMaintenanceDate: new Date(nextMaintenanceDate) }),
    })
    .where(eq(fixedAssetsTable.id, id));

  res.status(201).json(row);
});

// ─── PUT /api/assets/:id/dispose ─────────────────────────────────────────────
router.put("/assets/:id/dispose", requireAuth, async (req, res): Promise<void> => {
  const { id } = req.params;
  const { disposalDate, disposalValue, notes } = req.body;

  const [asset] = await db.select().from(fixedAssetsTable).where(eq(fixedAssetsTable.id, id));
  if (!asset) { res.status(404).json({ error: "Actif non trouvé" }); return; }

  const [updated] = await db.update(fixedAssetsTable)
    .set({
      status: "disposed",
      disposalDate: disposalDate ? new Date(disposalDate) : new Date(),
      disposalValue: disposalValue ? Number(disposalValue) : 0,
      ...(notes && { notes }),
    })
    .where(eq(fixedAssetsTable.id, id))
    .returning();

  // Écriture de cession: Crédit 2154/compte actif, Débit 281 (amort cumulés), Débit 675 ou Crédit 775 (plus/moins value)
  try {
    const pcgCode = asset.pcgAccount ?? "218";
    const assetAccId = await findOrCreateAccount(pcgCode, `Immobilisation ${pcgCode}`, "asset");
    const amortAccId = await findOrCreateAccount("281", "Amortissements immobilisations", "liability");
    const dispVal = Number(disposalValue ?? 0);
    const netBookValue = asset.value - asset.accumulatedDepreciation;
    const plusValue = dispVal - netBookValue;
    const gainLossAccId = plusValue >= 0
      ? await findOrCreateAccount("775", "Produits de cession d'éléments d'actif", "revenue")
      : await findOrCreateAccount("675", "Valeurs comptables des éléments d'actif cédés", "expense");

    const [entry] = await db.insert(journalEntriesTable).values({
      date: new Date(),
      reference: `CESS-${(asset.assetNumber ?? asset.name.slice(0, 8)).toUpperCase()}`,
      description: `Cession actif — ${asset.name}`,
      status: "validated",
    }).returning();

    const lines: any[] = [
      { entryId: entry.id, accountId: amortAccId, debit: asset.accumulatedDepreciation, credit: 0, label: "Reprise amortissements" },
      { entryId: entry.id, accountId: assetAccId, debit: 0, credit: asset.value, label: "Sortie actif" },
    ];
    if (dispVal > 0) {
      const bankId = await findOrCreateAccount("512", "Banques", "asset");
      lines.push({ entryId: entry.id, accountId: bankId, debit: dispVal, credit: 0, label: "Produit cession" });
    }
    if (Math.abs(plusValue) > 1) {
      lines.push({
        entryId: entry.id, accountId: gainLossAccId,
        debit: plusValue < 0 ? Math.abs(plusValue) : 0,
        credit: plusValue >= 0 ? plusValue : 0,
        label: plusValue >= 0 ? "Plus-value cession" : "Moins-value cession",
      });
    }
    await db.insert(journalLinesTable).values(lines);
  } catch (_) {}

  res.json(updated);
});

// ─── POST /api/assets/from-purchase/:purchaseId ──────────────────────────────
router.post("/assets/from-purchase/:purchaseId", requireAuth, async (req, res): Promise<void> => {
  const { purchaseId } = req.params;
  const { name, category, durationMonths, residualValue } = req.body;

  const r = await db.execute(sql`
    SELECT id, supplier_id, total_amount, created_at FROM purchases WHERE id = ${purchaseId} LIMIT 1
  `);
  if (!r.rows.length) { res.status(404).json({ error: "Achat non trouvé" }); return; }
  const purchase = r.rows[0] as any;

  const cat = category ?? "equipment";
  const pcg = PCG_ACCOUNTS[cat] ?? PCG_ACCOUNTS.other;
  await findOrCreateAccount(pcg.code, pcg.name, "asset");
  const assetNumber = await nextAssetNumber();

  const [asset] = await db.insert(fixedAssetsTable).values({
    name: name ?? `Actif issu achat ${purchaseId.slice(0, 8)}`,
    category: cat,
    value: Number(purchase.total_amount),
    residualValue: Number(residualValue ?? 0),
    accumulatedDepreciation: 0,
    startDate: new Date(purchase.created_at),
    durationMonths: Number(durationMonths ?? 60),
    currency: "MGA",
    status: "active",
    assetNumber,
    pcgAccount: pcg.code,
    acquisitionType: "purchase",
    purchaseId,
    supplierId: purchase.supplier_id,
  }).returning();

  res.status(201).json(asset);
});

export default router;
