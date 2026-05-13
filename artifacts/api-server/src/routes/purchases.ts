import { Router, type IRouter } from "express";
import {
  db, purchasesTable, purchaseReceptionsTable, suppliersTable,
  lotsTable, stockMovementsTable, journalEntriesTable, journalLinesTable,
  accountsTable, fixedAssetsTable, consumablesTable, productsTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { requireRole, ROLES } from "../middlewares/roles";
import { eq, sql, desc, and, isNull } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

const ADMIN_ROLES = [ROLES.SUPER_ADMIN, ROLES.ADMIN];

// ─── PCG account mapping by type ─────────────────────────────────────────────
const DEBIT_ACCOUNT: Record<string, string> = {
  VANILLE:       "31",   // Stocks matières premières (PCG 2005)
  CONSOMMABLE:   "602",
  BUREAU:        "6064",
  INFORMATIQUE:  "615",
  IMMOBILISATION:"2183",
  SERVICE:       "614",
};

const ASSET_PCG: Record<string, string> = {
  informatique: "2183",
  mobilier:     "2184",
  transport:    "2154",
  installation: "2135",
  equipment:    "2183",
  default:      "2183",
};

const ASSET_DURATION: Record<string, number> = {
  informatique: 36, mobilier: 60, transport: 60,
  installation: 120, equipment: 60, default: 48,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Generate intelligent lot code: VAN-YYYY-MMDD-REGION-TYPE-LENGTHcm-HUMIDITY */
async function generateIntelligentLotCode(opts: {
  supplierId: string;
  productType?: string;
  lengthCm?: number;
  humidity?: number;
  purchaseDate?: string;
}): Promise<string> {
  const date = opts.purchaseDate ? new Date(opts.purchaseDate) : new Date();
  const year = date.getFullYear();
  const mmdd = `${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;

  const [sup] = await db.select({ region: suppliersTable.region, supplierCode: suppliersTable.supplierCode })
    .from(suppliersTable).where(eq(suppliersTable.id, opts.supplierId));

  const rawRegion = (sup?.region ?? sup?.supplierCode ?? "VAN");
  const regionCode = rawRegion.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4) || "VAN";

  const typeMap: Record<string, string> = {
    GOUSSE: "GOUSSE", POUDRE: "POUDRE", EXTRAIT: "EXTRAIT", PATE_VANILLE: "PATE",
  };
  const typeCode = typeMap[opts.productType ?? ""] ?? "VAN";

  const parts: string[] = [`VAN-${year}-${mmdd}`, regionCode, typeCode];
  if (opts.lengthCm && opts.lengthCm > 0)   parts.push(`${Math.round(opts.lengthCm)}CM`);
  if (opts.humidity  && opts.humidity  > 0)  parts.push(`H${Math.round(opts.humidity)}`);

  let code = parts.join("-");
  const [exists] = await db.select({ id: lotsTable.id }).from(lotsTable).where(eq(lotsTable.code, code));
  if (exists) code = `${code}-${Math.floor(100 + Math.random() * 900)}`;

  return code;
}

/** AI risk detection for vanilla lots */
function computeVanillaRisk(opts: {
  humidity: number;
  quality?: string;
  moldStatus?: string;
  vanillinRate?: number;
}): { riskScore: number; riskLevel: "LOW" | "MEDIUM" | "HIGH"; risks: string[] } {
  const risks: string[] = [];
  let score = 0;

  if (opts.humidity > 42)      { risks.push(`Humidité critique (${opts.humidity}%)`); score += 50; }
  else if (opts.humidity > 38) { risks.push(`Humidité élevée (${opts.humidity}%)`);   score += 25; }
  else if (opts.humidity < 18) { risks.push(`Humidité trop faible (${opts.humidity}%)`); score += 15; }

  if (opts.moldStatus === "failed") { risks.push("Moisissures détectées"); score += 50; }
  else if (opts.moldStatus === "risk") { risks.push("Risque de moisissures"); score += 25; }

  if (opts.quality === "faible" || opts.quality === "industrial")
    { risks.push("Qualité insuffisante"); score += 20; }

  if (opts.vanillinRate !== undefined) {
    if (opts.vanillinRate < 1.5) { risks.push(`Taux vanilline très faible (${opts.vanillinRate}%)`); score += 25; }
    else if (opts.vanillinRate < 2) { risks.push(`Taux vanilline faible (${opts.vanillinRate}%)`); score += 10; }
  }

  const riskLevel = score >= 50 ? "HIGH" : score >= 25 ? "MEDIUM" : "LOW";
  return { riskScore: Math.min(100, score), riskLevel, risks };
}

async function generatePurchaseRef(): Promise<string> {
  const year = new Date().getFullYear();
  const [row] = (await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM purchases WHERE EXTRACT(year FROM created_at) = ${year}
  `)).rows as any[];
  const n = (Number(row?.n ?? 0) + 1).toString().padStart(4, "0");
  return `ACH-${year}-${n}`;
}

async function generateAssetNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const [row] = (await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM fixed_assets WHERE EXTRACT(year FROM created_at) = ${year}
  `)).rows as any[];
  const n = (Number(row?.n ?? 0) + 1).toString().padStart(3, "0");
  return `IMM-${year}-${n}`;
}

async function findOrCreateAccount(code: string) {
  const [acc] = await db.select().from(accountsTable).where(eq(accountsTable.code, code));
  return acc ?? null;
}

// ─── Accounting: create journal entry for purchase ────────────────────────────
async function createPurchaseJournalEntry(opts: {
  purchaseId: string;
  reference: string;
  debitCode: string;
  amountHt: number;
  vatAmount: number;
  amountTtc: number;
  description: string;
  supplierName?: string;
  supplierCode?: string;
}) {
  const { reference, debitCode, amountHt, vatAmount, amountTtc, description, supplierName, supplierCode } = opts;

  const debitAcc = await findOrCreateAccount(debitCode);
  const frnAcc   = await findOrCreateAccount("401");
  const tvaAcc   = await findOrCreateAccount("44566");
  if (!debitAcc || !frnAcc) return null;

  const supplierLabel = supplierName
    ? `${supplierCode ? supplierCode + ' - ' : ''}${supplierName}`
    : `Fournisseur`;

  const [entry] = await db.insert(journalEntriesTable).values({
    date: new Date(), reference,
    description: `${description} — ${supplierLabel}`,
    status: "validated",
  }).returning();

  const lines: any[] = [
    { entryId: entry.id, accountId: debitAcc.id, debit: amountHt,  credit: 0,         label: description },
    { entryId: entry.id, accountId: frnAcc.id,   debit: 0,          credit: amountTtc, label: `401 ${supplierLabel} — ${reference}` },
  ];
  if (tvaAcc && vatAmount > 0) {
    lines.splice(1, 0, { entryId: entry.id, accountId: tvaAcc.id, debit: vatAmount, credit: 0, label: "TVA déductible sur achat" });
  }
  await db.insert(journalLinesTable).values(lines);
  return entry;
}

// ─── GET /purchases/analytics ─────────────────────────────────────────────────
router.get("/purchases/analytics", requireAuth, async (_req, res): Promise<void> => {
  const [kpi] = (await db.execute(sql`
    SELECT
      COUNT(*)::int                     AS nb,
      COALESCE(SUM(total_amount), 0)    AS total,
      COALESCE(AVG(price_per_kg), 0)    AS avg_price,
      COALESCE(SUM(weight), 0)          AS kg_total,
      COALESCE(AVG(humidity), 0)        AS avg_humidity,
      COUNT(DISTINCT supplier_id)::int  AS nb_suppliers
    FROM purchases WHERE deleted_at IS NULL
  `)).rows as any[];

  const byType = (await db.execute(sql`
    SELECT type,
      COUNT(*)::int AS nb,
      COALESCE(SUM(total_amount), 0) AS total
    FROM purchases WHERE deleted_at IS NULL
    GROUP BY type ORDER BY total DESC
  `)).rows;

  const monthly = (await db.execute(sql`
    SELECT
      TO_CHAR(created_at, 'YYYY-MM') AS month,
      TO_CHAR(created_at, 'Mon YY')  AS label,
      ROUND(SUM(total_amount)::numeric, 0) AS total,
      COUNT(*)::int AS nb
    FROM purchases
    WHERE deleted_at IS NULL AND created_at >= NOW() - INTERVAL '12 months'
    GROUP BY TO_CHAR(created_at, 'YYYY-MM'), TO_CHAR(created_at, 'Mon YY')
    ORDER BY month
  `)).rows;

  const topSuppliers = (await db.execute(sql`
    SELECT s.name, s.supplier_code AS code, s.region,
      COUNT(p.id)::int AS nb,
      ROUND(SUM(p.total_amount)::numeric, 0) AS total
    FROM purchases p
    JOIN suppliers s ON s.id = p.supplier_id
    WHERE p.deleted_at IS NULL
    GROUP BY s.id, s.name, s.supplier_code, s.region
    ORDER BY total DESC LIMIT 5
  `)).rows;

  const byStatus = (await db.execute(sql`
    SELECT status, COUNT(*)::int AS nb, COALESCE(SUM(total_amount),0) AS total
    FROM purchases WHERE deleted_at IS NULL GROUP BY status
  `)).rows;

  res.json({
    kpis: {
      nb: Number(kpi?.nb ?? 0), total: Number(kpi?.total ?? 0),
      avgPrice: Number(kpi?.avg_price ?? 0), kgTotal: Number(kpi?.kg_total ?? 0),
      avgHumidity: Number(kpi?.avg_humidity ?? 0), nbSuppliers: Number(kpi?.nb_suppliers ?? 0),
    },
    byType, monthly, topSuppliers, byStatus,
  });
});

// ─── GET /purchases ────────────────────────────────────────────────────────────
router.get("/purchases", requireAuth, async (_req, res): Promise<void> => {
  const rows = (await db.execute(sql`
    SELECT
      p.id, p.supplier_id, p.type, p.category, p.description, p.reference,
      p.currency, p.amount_ht, p.vat_rate, p.vat_amount, p.amount_ttc,
      p.quantity, p.unit, p.unit_price,
      p.weight, p.price_per_kg, p.total_amount, p.humidity,
      p.warehouse, p.payment_method, p.status, p.purchase_date,
      p.notes, p.lot_id, p.fixed_asset_id, p.journal_entry_id, p.created_at,
      s.name AS supplier_name, s.supplier_code, s.region AS supplier_region,
      l.code AS lot_code, l.status AS lot_status,
      fa.name AS asset_name, fa.asset_number
    FROM purchases p
    LEFT JOIN suppliers s ON s.id = p.supplier_id
    LEFT JOIN lots l ON l.id = p.lot_id
    LEFT JOIN fixed_assets fa ON fa.id = p.fixed_asset_id
    WHERE p.deleted_at IS NULL
    ORDER BY p.created_at DESC
  `)).rows;
  res.json(rows);
});

// ─── GET /purchases/vanilla-analytics ─── MUST be BEFORE /:id ─────────────────
router.get("/purchases/vanilla-analytics", requireAuth, async (req, res): Promise<void> => {
  const [thisMonth] = (await db.execute(sql`
    SELECT
      COUNT(*)::int        AS count,
      COALESCE(SUM(total_amount), 0)::real  AS total,
      COALESCE(AVG(price_per_kg), 0)::real  AS avg_price_kg,
      COALESCE(AVG(humidity), 0)::real      AS avg_humidity,
      COALESCE(SUM(weight), 0)::real        AS total_weight
    FROM purchases
    WHERE type = 'VANILLE'
      AND deleted_at IS NULL
      AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
  `)).rows as any[];

  const [lastWeek] = (await db.execute(sql`
    SELECT
      COUNT(*)::int        AS count,
      COALESCE(SUM(total_amount), 0)::real  AS total,
      COALESCE(SUM(weight), 0)::real        AS total_weight
    FROM purchases
    WHERE type = 'VANILLE'
      AND deleted_at IS NULL
      AND created_at >= NOW() - INTERVAL '7 days'
  `)).rows as any[];

  const topSuppliers = (await db.execute(sql`
    SELECT
      s.name,
      COUNT(p.id)::int                       AS purchase_count,
      COALESCE(SUM(p.total_amount), 0)::real AS total_amount,
      COALESCE(SUM(p.weight), 0)::real       AS total_weight,
      COALESCE(AVG(p.price_per_kg), 0)::real AS avg_price_kg
    FROM purchases p
    JOIN suppliers s ON s.id = p.supplier_id
    WHERE p.type = 'VANILLE' AND p.deleted_at IS NULL
      AND p.created_at >= NOW() - INTERVAL '90 days'
    GROUP BY s.id, s.name
    ORDER BY total_amount DESC
    LIMIT 5
  `)).rows;

  const byProductType = (await db.execute(sql`
    SELECT
      product_type,
      COUNT(*)::int                          AS count,
      COALESCE(SUM(weight), 0)::real         AS weight,
      COALESCE(SUM(total_amount), 0)::real   AS total
    FROM purchases
    WHERE type = 'VANILLE' AND deleted_at IS NULL AND product_type IS NOT NULL
    GROUP BY product_type
  `)).rows;

  const riskLots = (await db.execute(sql`
    SELECT
      l.code, l.risk_level, l.risk_score, l.humidity,
      l.weight_current, s.name AS supplier_name
    FROM lots l
    JOIN suppliers s ON s.id = l.supplier_id
    WHERE l.risk_level IN ('HIGH', 'MEDIUM')
    ORDER BY l.risk_score DESC
    LIMIT 5
  `)).rows;

  res.json({ thisMonth, lastWeek, topSuppliers, byProductType, riskLots });
});

// ─── GET /purchases/:id ────────────────────────────────────────────────────────
router.get("/purchases/:id", requireAuth, async (req, res): Promise<void> => {
  const id = String(req.params.id);
  const [row] = (await db.execute(sql`
    SELECT p.*, s.name AS supplier_name, s.supplier_code, s.region AS supplier_region,
      l.code AS lot_code, l.status AS lot_status,
      fa.name AS asset_name, fa.asset_number
    FROM purchases p
    LEFT JOIN suppliers s ON s.id = p.supplier_id
    LEFT JOIN lots l ON l.id = p.lot_id
    LEFT JOIN fixed_assets fa ON fa.id = p.fixed_asset_id
    WHERE p.id = ${id} AND p.deleted_at IS NULL
  `)).rows as any[];
  if (!row) { res.status(404).json({ error: "Achat introuvable" }); return; }

  const receptions = (await db.execute(sql`
    SELECT * FROM purchase_receptions WHERE purchase_id = ${id} ORDER BY received_at DESC
  `)).rows;

  res.json({ ...row, receptions });
});

// ─── POST /purchases ───────────────────────────────────────────────────────────
const createSchema = z.object({
  // Type & meta
  type:          z.enum(["VANILLE", "CONSOMMABLE", "BUREAU", "INFORMATIQUE", "IMMOBILISATION", "SERVICE"]).default("VANILLE"),
  category:      z.string().optional(),
  description:   z.string().optional(),
  purchaseDate:  z.string().optional(),
  currency:      z.string().default("MGA"),
  notes:         z.string().optional(),
  warehouse:     z.string().optional(),
  // Supplier (id OR new supplier details)
  supplierId:          z.string().optional(),
  supplierName:        z.string().optional(),
  supplierEmail:       z.string().optional(),
  supplierPhone:       z.string().optional(),
  supplierCity:        z.string().optional(),
  supplierRegion:      z.string().optional(),
  supplierNif:         z.string().optional(),
  supplierStat:        z.string().optional(),
  supplierRccm:        z.string().optional(),
  supplierPaymentMethod: z.string().optional(),
  supplierPaymentTerms:  z.string().optional(),
  supplierIsVatSubject:  z.boolean().optional(),
  supplierAddress:     z.string().optional(),
  // Amounts
  amountHt:      z.number().optional(),
  vatRate:       z.number().min(0).max(100).default(0),
  vatAmount:     z.number().optional(),
  amountTtc:     z.number().optional(),
  // Quantities
  quantity:      z.number().optional(),
  unit:          z.string().optional(),
  unitPrice:     z.number().optional(),
  // Payment
  paymentMethod: z.string().default("cash"),
  // Vanille-specific
  weight:        z.number().optional(),
  pricePerKg:    z.number().optional(),
  humidity:      z.number().min(0).max(100).optional(),
  // Vanille quality & traceability
  productId:     z.string().optional(),
  productType:   z.enum(["GOUSSE", "POUDRE", "EXTRAIT", "PATE_VANILLE"]).optional(),
  lengthCm:      z.number().min(0).max(100).optional(),
  quality:       z.string().optional(),
  grade:         z.string().optional(),
  origin:        z.string().optional(),
  preparation:   z.string().optional(),
  qualityNotes:  z.string().optional(),
  vanillinRate:  z.number().min(0).max(100).optional(),
  moldStatus:    z.string().optional(),
  // Immobilisation-specific
  assetCategory: z.string().optional(),
  assetDuration: z.number().optional(),
  serialNumber:  z.string().optional(),
  location:      z.string().optional(),
});

router.post("/purchases", requireAuth, async (req, res): Promise<void> => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: String(parsed.error) }); return; }

  const d = parsed.data;

  // ── 1. Resolve or auto-create supplier ──────────────────────────────────────
  let supplierId = d.supplierId;
  if (!supplierId && d.supplierName?.trim()) {
    // Check if already exists
    const [existing] = await db.select().from(suppliersTable)
      .where(eq(suppliersTable.name, d.supplierName.trim()));
    if (existing) {
      supplierId = existing.id;
    } else {
      const typeMap: Record<string, string> = {
        CONSOMMABLE: "SERVICE", BUREAU: "SERVICE", INFORMATIQUE: "SERVICE",
        IMMOBILISATION: "SERVICE", SERVICE: "SERVICE", VANILLE: "GOODS",
      };
      // Auto-generate supplier code FOUR-YYYY-NNN
      const year = new Date().getFullYear();
      const [cntRow] = (await db.execute(sql`
        SELECT COUNT(*)::int AS n FROM suppliers WHERE supplier_code LIKE ${'FOUR-' + year + '-%'}
      `)).rows as any[];
      const codeN = (Number(cntRow?.n ?? 0) + 1).toString().padStart(3, "0");
      const supplierCode = `FOUR-${year}-${codeN}`;

      const [newSupplier] = await db.insert(suppliersTable).values({
        name: d.supplierName.trim(),
        region:        d.supplierRegion  ?? "",
        supplierCode,
        supplierType:  typeMap[d.type]   ?? "SERVICE",
        category:      d.type.toLowerCase(),
        status:        "active",
        country:       "Madagascar",
        email:         d.supplierEmail   ?? null,
        phone:         d.supplierPhone   ?? null,
        city:          d.supplierCity    ?? null,
        address:       d.supplierAddress ?? null,
        nif:           d.supplierNif     ?? null,
        stat:          d.supplierStat    ?? null,
        rccm:          d.supplierRccm    ?? null,
        paymentMethod: d.supplierPaymentMethod ?? "Virement bancaire",
        paymentTerms:  d.supplierPaymentTerms  ?? "30",
        isVatSubject:  d.supplierIsVatSubject   ?? false,
      }).returning();
      supplierId = newSupplier.id;
      req.log.info({ supplierId: newSupplier.id, name: d.supplierName, code: supplierCode }, "Supplier auto-created from purchase");
    }
  }
  if (!supplierId) { res.status(400).json({ error: "Fournisseur requis (id ou nom)" }); return; }

  // ── 2. Resolve amounts ───────────────────────────────────────────────────────
  let amountHt  = d.amountHt ?? 0;
  let vatAmount = d.vatAmount ?? 0;
  let amountTtc = d.amountTtc ?? 0;
  let totalAmount = amountTtc || amountHt;

  if (d.type === "VANILLE" && d.weight && d.pricePerKg) {
    totalAmount = Math.round(d.weight * d.pricePerKg);
    amountHt    = d.vatRate > 0 ? Math.round(totalAmount / (1 + d.vatRate / 100)) : totalAmount;
    vatAmount   = totalAmount - amountHt;
    amountTtc   = totalAmount;
  } else if (amountHt > 0 && d.vatRate > 0) {
    vatAmount = Math.round(amountHt * d.vatRate / 100);
    amountTtc = amountHt + vatAmount;
    totalAmount = amountTtc;
  } else if (amountTtc > 0 && d.vatRate > 0) {
    amountHt  = Math.round(amountTtc / (1 + d.vatRate / 100));
    vatAmount = amountTtc - amountHt;
    totalAmount = amountTtc;
  } else if (amountHt > 0) {
    amountTtc = amountHt;
    totalAmount = amountHt;
  }

  if (totalAmount <= 0) { res.status(400).json({ error: "Le montant doit être supérieur à 0" }); return; }

  const reference = await generatePurchaseRef();

  // ── 3. Insert purchase ───────────────────────────────────────────────────────
  const [purchase] = await db.insert(purchasesTable).values({
    supplierId,
    type: d.type, category: d.category ?? null, description: d.description ?? null,
    reference, currency: d.currency,
    amountHt, vatRate: d.vatRate, vatAmount, amountTtc,
    quantity: d.quantity ?? null, unit: d.unit ?? "unité", unitPrice: d.unitPrice ?? null,
    weight: d.weight ?? 0, pricePerKg: d.pricePerKg ?? 0,
    totalAmount, humidity: d.humidity ?? 0,
    // Vanilla quality & traceability
    productId:    d.productId    ?? null,
    productType:  d.productType  ?? null,
    lengthCm:     d.lengthCm     ?? null,
    quality:      d.quality      ?? null,
    origin:       d.origin       ?? null,
    preparation:  d.preparation  ?? null,
    qualityNotes: d.qualityNotes ?? null,
    vanillinRate: d.vanillinRate ?? null,
    moldStatus:   d.moldStatus   ?? "ok",
    warehouse: d.warehouse ?? null, paymentMethod: d.paymentMethod,
    status: "valide", notes: d.notes ?? null,
    purchaseDate: d.purchaseDate ? d.purchaseDate : new Date().toISOString().slice(0, 10),
  }).returning();

  let lotId: string | null = null;
  let fixedAssetId: string | null = null;
  let journalEntryId: string | null = null;

  // ── 4. Type-specific side effects ────────────────────────────────────────────
  if (d.type === "VANILLE" && d.weight && d.pricePerKg) {
    // Generate intelligent lot code: VAN-YYYY-MMDD-REGION-TYPE-LENGTHcm-HUMIDITY
    const lotCode = await generateIntelligentLotCode({
      supplierId, productType: d.productType, lengthCm: d.lengthCm,
      humidity: d.humidity, purchaseDate: d.purchaseDate,
    });

    // AI risk detection
    const { riskScore, riskLevel, risks } = computeVanillaRisk({
      humidity:     d.humidity    ?? 0,
      quality:      d.quality,
      moldStatus:   d.moldStatus,
      vanillinRate: d.vanillinRate,
    });

    const wRounded = Math.round((d.weight ?? 0) * 100) / 100;
    const [lot] = await db.insert(lotsTable).values({
      code: lotCode, supplierId, purchaseId: purchase.id,
      productId:    d.productId   ?? null,
      productType:  d.productType ?? null,
      weightInitial: wRounded, weightCurrent: wRounded,
      humidity:     d.humidity    ?? 0,
      grade:        d.grade       ?? null,
      region:       d.origin      ?? null,
      warehouse:    d.warehouse   ?? null,
      // Quality & traceability
      lengthCm:     d.lengthCm    ?? null,
      quality:      d.quality     ?? null,
      origin:       d.origin      ?? null,
      preparation:  d.preparation ?? null,
      vanillinRate: d.vanillinRate ?? null,
      status:       "RAW",
      riskScore,
      riskLevel,
    }).returning();

    await db.insert(stockMovementsTable).values({
      lotId:      lot.id,
      type:       "IN",
      quantity:   wRounded,
      unitCost:   d.pricePerKg,
      reference,
      purchaseId: purchase.id,
      note: `Achat ${reference} — ${d.productType ?? "vanille"} ${d.origin ?? ""}`.trim(),
    });

    await db.update(purchasesTable).set({ lotId: lot.id }).where(eq(purchasesTable.id, purchase.id));
    lotId = lot.id;

    req.log.info({ lotCode, riskScore, riskLevel, risks }, "Vanilla lot created with intelligent code");

  } else if (d.type === "CONSOMMABLE" && d.description) {
    // Auto-add to consumables stock
    try {
      const name = d.description.trim();
      const qty  = d.quantity ?? 1;
      const [existing] = await db.select().from(consumablesTable).where(eq(consumablesTable.name, name));
      if (existing) {
        await db.update(consumablesTable)
          .set({ stock: existing.stock + qty })
          .where(eq(consumablesTable.id, existing.id));
      } else {
        await db.insert(consumablesTable).values({
          name, unit: d.unit ?? "unité", stock: qty, minStock: 0,
        });
      }
    } catch { /* non-blocking */ }

  } else if (d.type === "IMMOBILISATION") {
    // Auto-create fixed asset
    const assetCat = d.assetCategory ?? "equipment";
    const pcgCode  = ASSET_PCG[assetCat] ?? "2183";
    const duration = d.assetDuration ?? ASSET_DURATION[assetCat] ?? 48;
    const assetNumber = await generateAssetNumber();
    const [supplier] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, supplierId));

    const [asset] = await db.insert(fixedAssetsTable).values({
      name: d.description ?? `Immobilisation ${reference}`,
      category: assetCat,
      value: amountHt, residualValue: 0,
      startDate: new Date(d.purchaseDate ?? new Date()),
      durationMonths: duration, currency: d.currency,
      pcgAccount: pcgCode, assetNumber,
      acquisitionType: "purchase",
      serialNumber: d.serialNumber ?? null,
      location: d.location ?? d.warehouse ?? null,
      purchaseId: purchase.id,
      supplierId: supplierId ?? null,
      notes: d.notes ?? null,
    }).returning();
    await db.update(purchasesTable).set({ fixedAssetId: asset.id }).where(eq(purchasesTable.id, purchase.id));
    fixedAssetId = asset.id;
  }

  // ── 5. Accounting entry ───────────────────────────────────────────────────────
  const debitCode = d.type === "IMMOBILISATION"
    ? (ASSET_PCG[d.assetCategory ?? "equipment"] ?? "2183")
    : (DEBIT_ACCOUNT[d.type] ?? "606");

  // Fetch supplier name/code for journal label
  const [sup] = supplierId
    ? await db.select({ name: suppliersTable.name, supplierCode: suppliersTable.supplierCode })
        .from(suppliersTable).where(eq(suppliersTable.id, supplierId))
    : [undefined];

  const entry = await createPurchaseJournalEntry({
    purchaseId: purchase.id, reference,
    debitCode, amountHt, vatAmount, amountTtc,
    description: d.description ?? `Achat ${d.type.toLowerCase()} - ${reference}`,
    supplierName: sup?.name,
    supplierCode: sup?.supplierCode ?? undefined,
  });
  if (entry) {
    await db.update(purchasesTable).set({ journalEntryId: entry.id }).where(eq(purchasesTable.id, purchase.id));
    journalEntryId = entry.id;
  }

  req.log.info({ purchaseId: purchase.id, type: d.type, reference, totalAmount }, "Purchase created");
  res.status(201).json({ purchase: { ...purchase, lotId, fixedAssetId, journalEntryId }, reference });
});

// ─── PUT /purchases/:id/status ────────────────────────────────────────────────
router.put("/purchases/:id/status", requireAuth, requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.ACCOUNTANT, ROLES.LOGISTICS_MANAGER), async (req, res): Promise<void> => {
  const id = String(req.params.id);
  const { status } = req.body;
  const validStatuses = ["brouillon", "valide", "receptionne", "comptabilise"];
  if (!validStatuses.includes(status)) { res.status(400).json({ error: "Statut invalide" }); return; }

  const [p] = (await db.execute(sql`SELECT * FROM purchases WHERE id = ${id} AND deleted_at IS NULL`)).rows as any[];
  if (!p) { res.status(404).json({ error: "Achat introuvable" }); return; }

  if (p.status === "comptabilise" && status !== "comptabilise") {
    res.status(400).json({ error: "Un achat comptabilisé ne peut plus changer de statut" }); return;
  }

  await db.execute(sql`UPDATE purchases SET status = ${status} WHERE id = ${id}`);
  req.log.info({ purchaseId: id, oldStatus: p.status, newStatus: status, by: req.currentUser?.email }, "Purchase status changed");
  res.json({ ...p, status });
});

// ─── POST /purchases/:id/reception ────────────────────────────────────────────
router.post("/purchases/:id/reception", requireAuth, requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.LOGISTICS_MANAGER), async (req, res): Promise<void> => {
  const id = String(req.params.id);
  const { quantity, notes } = req.body;
  if (!quantity || quantity <= 0) { res.status(400).json({ error: "Quantité requise" }); return; }

  const [p] = (await db.execute(sql`SELECT * FROM purchases WHERE id = ${id} AND deleted_at IS NULL`)).rows as any[];
  if (!p) { res.status(404).json({ error: "Achat introuvable" }); return; }

  const recId = crypto.randomUUID();
  const createdBy = req.currentUser?.email ?? null;
  await db.execute(sql`
    INSERT INTO purchase_receptions (id, purchase_id, quantity, notes, created_by)
    VALUES (${recId}, ${id}, ${quantity}, ${notes ?? null}, ${createdBy})
  `);

  // If fully received → auto-transition to "receptionne"
  const [totRow] = (await db.execute(sql`
    SELECT COALESCE(SUM(quantity), 0) AS total FROM purchase_receptions WHERE purchase_id = ${id}
  `)).rows as any[];

  const expectedQty = Number(p.quantity ?? p.weight ?? 0);
  if (expectedQty > 0 && Number(totRow?.total ?? 0) >= expectedQty) {
    await db.execute(sql`UPDATE purchases SET status = 'receptionne' WHERE id = ${id}`);
  }

  req.log.info({ purchaseId: id, quantity, by: req.currentUser?.email }, "Purchase reception recorded");
  res.status(201).json({ id: recId, purchaseId: id, quantity, notes: notes ?? null, createdBy, receivedAt: new Date() });
});

// ─── DELETE /purchases/:id ─────────────────────────────────────────────────────
router.delete("/purchases/:id", requireAuth, requireRole(...ADMIN_ROLES), async (req, res): Promise<void> => {
  const id = String(req.params.id);
  const { reason } = req.body ?? {};

  if (!reason?.trim()) { res.status(400).json({ error: "Une raison de suppression est obligatoire" }); return; }

  const [p] = (await db.execute(sql`SELECT * FROM purchases WHERE id = ${id} AND deleted_at IS NULL`)).rows as any[];
  if (!p) { res.status(404).json({ error: "Achat introuvable" }); return; }

  // Block if comptabilisé
  if (p.status === "comptabilise") {
    res.status(409).json({ error: "Impossible de supprimer un achat comptabilisé. Contactez la comptabilité." }); return;
  }

  // Block if stock used (lot has movements beyond the initial IN)
  if (p.lot_id) {
    const [movCount] = (await db.execute(sql`
      SELECT COUNT(*)::int AS n FROM stock_movements WHERE lot_id = ${p.lot_id} AND type != 'IN'
    `)).rows as any[];
    if (Number(movCount?.n ?? 0) > 0) {
      res.status(409).json({ error: "Impossible: ce lot a des mouvements de stock. Annulez-les d'abord." }); return;
    }
  }

  // Block if linked fixed asset has depreciation
  if (p.fixed_asset_id) {
    const [asset] = (await db.execute(sql`SELECT accumulated_depreciation FROM fixed_assets WHERE id = ${p.fixed_asset_id}`)).rows as any[];
    if (asset && Number(asset.accumulated_depreciation ?? 0) > 0) {
      res.status(409).json({ error: "Impossible: l'immobilisation liée a des amortissements enregistrés." }); return;
    }
  }

  // Soft delete
  const deletedAt = new Date().toISOString();
  const deletedBy = req.currentUser?.email ?? "unknown";
  await db.execute(sql`
    UPDATE purchases SET deleted_at = ${deletedAt}, deleted_by = ${deletedBy}, delete_reason = ${reason}
    WHERE id = ${id}
  `);

  // Clean up linked lot if vanilla
  if (p.lot_id) {
    try {
      await db.delete(stockMovementsTable).where(eq(stockMovementsTable.lotId, p.lot_id as string));
      await db.execute(sql`UPDATE lots SET purchase_id = NULL WHERE id = ${p.lot_id}`);
      await db.execute(sql`DELETE FROM lots WHERE id = ${p.lot_id}`);
    } catch { /* ignore cascade errors */ }
  }

  req.log.info({ purchaseId: id, type: p.type, reference: p.reference, reason, by: req.currentUser?.email }, "Purchase soft-deleted");
  res.json({ success: true, deletedId: id, reference: p.reference });
});

export default router;
