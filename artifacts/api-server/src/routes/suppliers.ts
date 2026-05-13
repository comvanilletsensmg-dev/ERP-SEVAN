import { Router, type IRouter } from "express";
import { eq, sql, desc } from "drizzle-orm";
import { db, suppliersTable, employeesTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { requireRole } from "../middlewares/roles";
import { z } from "zod/v4";

const router: IRouter = Router();

// ─── Validation schema ────────────────────────────────────────────────────────
const supplierBodySchema = z.object({
  name: z.string().min(1),
  region: z.string().optional().default(""),
  phone: z.string().optional().nullable(),
  score: z.number().min(0).max(100).optional().default(80),
  supplierType: z.enum(["GOODS", "SERVICES"]).optional().default("GOODS"),
  category: z.string().optional().nullable(),
  status: z.enum(["active", "inactive", "blocked"]).optional().default("active"),
  email: z.string().optional().nullable(),
  website: z.string().optional().nullable(),
  mobile: z.string().optional().nullable(),
  whatsapp: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  country: z.string().optional().default("Madagascar"),
  nif: z.string().optional().nullable(),
  stat: z.string().optional().nullable(),
  rccm: z.string().optional().nullable(),
  isVatSubject: z.boolean().optional().default(false),
  paymentMethod: z.string().optional().default("Virement bancaire"),
  paymentTerms: z.string().optional().default("30"),
  bankName: z.string().optional().nullable(),
  bankAccount: z.string().optional().nullable(),
  assignedEmployeeId: z.string().optional().nullable(),
});

// ─── Helper: enrich supplier with purchase stats ───────────────────────────
async function enrichSuppliers(suppliers: any[]) {
  if (!suppliers.length) return [];
  const ids = suppliers.map(s => `'${s.id}'`).join(",");
  const stats = await db.execute(sql`
    SELECT supplier_id,
           COUNT(*)::int                as purchase_count,
           COALESCE(SUM(total_amount),0) as total_purchases,
           COALESCE(SUM(weight),0)       as total_weight,
           COALESCE(AVG(humidity),NULL)  as avg_humidity,
           MAX(created_at)               as last_purchase_date
    FROM purchases
    WHERE supplier_id IN (${sql.raw(ids)})
    GROUP BY supplier_id
  `);
  const statsMap = new Map((stats.rows as any[]).map(r => [r.supplier_id, r]));

  const employees = await db.select({ id: employeesTable.id, name: employeesTable.name })
    .from(employeesTable);
  const empMap = new Map(employees.map(e => [e.id, e.name]));

  return suppliers.map(s => {
    const st = statsMap.get(s.id) as any;
    const humidity = st?.avg_humidity != null ? Number(st.avg_humidity) : null;
    const qualityScore = computeQualityScore(s.score, humidity, Number(st?.purchase_count ?? 0));
    return {
      ...s,
      purchaseCount: Number(st?.purchase_count ?? 0),
      totalPurchases: Number(st?.total_purchases ?? 0),
      totalWeight: Number(st?.total_weight ?? 0),
      avgHumidity: humidity,
      lastPurchaseDate: st?.last_purchase_date ?? null,
      assignedEmployeeName: s.assignedEmployeeId ? (empMap.get(s.assignedEmployeeId) ?? null) : null,
      qualityScore,
    };
  });
}

function computeQualityScore(baseScore: number, avgHumidity: number | null, purchaseCount: number): number {
  let score = baseScore || 80;
  if (avgHumidity !== null) {
    if (avgHumidity < 35) score = Math.min(100, score + 8);
    else if (avgHumidity < 40) score = Math.min(100, score + 3);
    else if (avgHumidity < 45) { /* no change */ }
    else if (avgHumidity < 50) score = Math.max(0, score - 10);
    else score = Math.max(0, score - 20);
  }
  if (purchaseCount >= 5) score = Math.min(100, score + 5);
  else if (purchaseCount >= 2) score = Math.min(100, score + 2);
  return Math.round(Math.min(100, Math.max(0, score)));
}

function nextSupplierCode(existing: string[]): string {
  const nums = existing
    .map(c => parseInt((c ?? "").replace(/\D/g, ""), 10))
    .filter(n => !isNaN(n));
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return `FRN-${String(next).padStart(3, "0")}`;
}

// ─── GET /suppliers ───────────────────────────────────────────────────────────
router.get("/suppliers", requireAuth, async (_req, res): Promise<void> => {
  const suppliers = await db.select().from(suppliersTable).orderBy(suppliersTable.createdAt);
  const enriched = await enrichSuppliers(suppliers);

  const totalPurchases = enriched.reduce((s, x) => s + x.totalPurchases, 0);
  const kpis = {
    total: enriched.length,
    actifs: enriched.filter(s => s.status === "active").length,
    biens: enriched.filter(s => s.supplierType === "GOODS").length,
    services: enriched.filter(s => s.supplierType === "SERVICES").length,
    montantAchats: totalPurchases,
    dettes: 0, // computed from journal later
  };

  res.json({ suppliers: enriched, kpis });
});

// ─── GET /suppliers/:id ───────────────────────────────────────────────────────
router.get("/suppliers/:id", requireAuth, async (req, res): Promise<void> => {
  const { id } = req.params;
  const [supplier] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, id));
  if (!supplier) { res.status(404).json({ error: "Fournisseur introuvable" }); return; }

  const [enriched] = await enrichSuppliers([supplier]);

  // Purchases with lot info
  const purchases = await db.execute(sql`
    SELECT p.id, p.total_amount, p.weight, p.price_per_kg, p.humidity,
           p.payment_method, p.created_at, p.lot_id,
           l.code as lot_number, l.status as lot_status
    FROM purchases p
    LEFT JOIN lots l ON l.id = p.lot_id
    WHERE p.supplier_id = ${id}
    ORDER BY p.created_at DESC
  `);

  // Assigned employee
  let assignedEmployee = null;
  if (supplier.assignedEmployeeId) {
    const [emp] = await db.execute(sql`
      SELECT id, name, position, department, phone, email FROM employees WHERE id = ${supplier.assignedEmployeeId}
    `);
    assignedEmployee = emp ?? null;
  }

  // Journal balance for account 401 (Fournisseurs) — total debits and credits
  const journalBalance = await db.execute(sql`
    SELECT
      COALESCE(SUM(jl.debit),0)  as total_debit,
      COALESCE(SUM(jl.credit),0) as total_credit
    FROM journal_lines jl
    JOIN accounts a ON a.id = jl.account_id
    WHERE a.code = '401'
  `);
  const jb = journalBalance.rows[0] as any;
  const accounting = {
    compte: "401 — Fournisseurs",
    totalDebit: Number(jb?.total_debit ?? 0),
    totalCredit: Number(jb?.total_credit ?? 0),
    solde: Number(jb?.total_credit ?? 0) - Number(jb?.total_debit ?? 0),
    totalAchats: enriched.totalPurchases,
    dette: Math.max(0, enriched.totalPurchases * 0.2), // placeholder — would use invoices
  };

  res.json({
    supplier: enriched,
    purchases: purchases.rows,
    assignedEmployee,
    accounting,
    notes: JSON.parse(supplier.notesJson ?? "[]"),
  });
});

// ─── POST /suppliers ──────────────────────────────────────────────────────────
router.post("/suppliers", requireAuth, async (req, res): Promise<void> => {
  const parsed = supplierBodySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: String(parsed.error) }); return; }

  const existing = await db.select({ supplierCode: suppliersTable.supplierCode }).from(suppliersTable);
  const supplierCode = parsed.data.supplierCode || nextSupplierCode(existing.map(e => e.supplierCode ?? ""));

  const [supplier] = await db.insert(suppliersTable).values({
    ...parsed.data,
    supplierCode,
    region: parsed.data.region ?? "",
    updatedAt: new Date(),
  }).returning();

  res.status(201).json(supplier);
});

// ─── PUT /suppliers/:id ───────────────────────────────────────────────────────
router.put("/suppliers/:id", requireAuth, async (req, res): Promise<void> => {
  const { id } = req.params;
  const parsed = supplierBodySchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: String(parsed.error) }); return; }

  const [supplier] = await db.update(suppliersTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(suppliersTable.id, id))
    .returning();

  if (!supplier) { res.status(404).json({ error: "Fournisseur introuvable" }); return; }
  res.json(supplier);
});

// ─── POST /suppliers/:id/notes ────────────────────────────────────────────────
router.post("/suppliers/:id/notes", requireAuth, async (req: any, res): Promise<void> => {
  const { id } = req.params;
  const { content, type = "general" } = req.body;
  if (!content?.trim()) { res.status(400).json({ error: "Contenu requis" }); return; }

  const [supplier] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, id));
  if (!supplier) { res.status(404).json({ error: "Fournisseur introuvable" }); return; }

  const notes = JSON.parse(supplier.notesJson ?? "[]");
  const newNote = {
    id: crypto.randomUUID(),
    content: content.trim(),
    type,
    author: req.user?.email ?? "système",
    createdAt: new Date().toISOString(),
  };
  notes.unshift(newNote);

  await db.update(suppliersTable)
    .set({ notesJson: JSON.stringify(notes), updatedAt: new Date() })
    .where(eq(suppliersTable.id, id));

  res.status(201).json(newNote);
});

// ─── DELETE /suppliers/:id ────────────────────────────────────────────────────
router.delete("/suppliers/:id", requireAuth, requireRole("SUPER_ADMIN", "LOGISTICS_MANAGER"), async (req, res): Promise<void> => {
  const { id } = req.params;

  // Verify supplier exists first
  const [supplier] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, id));
  if (!supplier) { res.status(404).json({ error: "Fournisseur introuvable" }); return; }

  // Block if supplier has linked lots (nullifying would lose traceability)
  const lotsCount = (await db.execute(sql`SELECT COUNT(*) AS n FROM lots WHERE supplier_id = ${id}`)).rows[0] as any;
  if (Number(lotsCount?.n) > 0) {
    res.status(409).json({
      error: `Ce fournisseur est lié à ${lotsCount.n} lot(s) — suppression impossible. Archivez-le ou réassignez les lots d'abord.`,
    });
    return;
  }

  // Block if supplier has linked purchases
  const purchasesCount = (await db.execute(sql`SELECT COUNT(*) AS n FROM purchases WHERE supplier_id = ${id}`)).rows[0] as any;
  if (Number(purchasesCount?.n) > 0) {
    res.status(409).json({
      error: `Ce fournisseur est lié à ${purchasesCount.n} achat(s) — suppression impossible. Archivez-le ou réassignez les achats d'abord.`,
    });
    return;
  }

  try {
    await db.delete(suppliersTable).where(eq(suppliersTable.id, id));
  } catch (err: any) {
    req.log.error({ err, supplierId: id }, "Erreur suppression fournisseur");
    res.status(500).json({ error: `Suppression échouée : ${err?.message ?? "erreur base de données"}` });
    return;
  }

  req.log.info({ supplierId: id, supplierName: supplier.name }, "Fournisseur supprimé");
  res.json({ ok: true, deletedId: id, name: supplier.name });
});

export default router;
