import { Router, type IRouter } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { z } from "zod";
import { db, lotsTable, suppliersTable, importBatchesTable, importErrorsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { requireRole } from "../middlewares/roles";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const ROLES = ["SUPER_ADMIN", "LOGISTICS_MANAGER"] as const;

// ─── Zod validation schema ────────────────────────────────────────────────────

const LotRowSchema = z.object({
  code: z.string().min(1, "Code lot obligatoire"),
  supplier: z.string().min(1, "Nom du fournisseur obligatoire"),
  region: z.string().optional().default(""),
  weightInitial: z.number({ invalid_type_error: "Poids doit être un nombre" }).positive("Poids doit être > 0"),
  humidity: z.number({ invalid_type_error: "Humidité doit être un nombre" }).min(0, "Humidité ≥ 0").max(100, "Humidité ≤ 100"),
  grade: z.enum(["Grade A", "Grade B", "Grade C", "Premium", "A", "B", "C"]).optional(),
  warehouse: z.string().optional().default(""),
});

type LotRow = z.infer<typeof LotRowSchema>;

// Normalise column names from file to internal field names
const COLUMN_ALIASES: Record<string, string> = {
  // code
  "code": "code", "code lot": "code", "lot code": "code", "lot": "code",
  // supplier
  "supplier": "supplier", "fournisseur": "supplier", "supplier name": "supplier", "nom fournisseur": "supplier",
  // region
  "region": "region", "région": "region", "zone": "region",
  // weight
  "weightInitial": "weightInitial", "weight": "weightInitial", "poids": "weightInitial",
  "poids initial": "weightInitial", "weight initial": "weightInitial", "poids (kg)": "weightInitial",
  // humidity
  "humidity": "humidity", "humidité": "humidity", "humidite": "humidity", "humidity (%)": "humidity",
  // grade
  "grade": "grade", "qualité": "grade", "qualite": "grade", "quality": "grade",
  // warehouse
  "warehouse": "warehouse", "entrepôt": "warehouse", "entrepot": "warehouse", "depot": "warehouse",
};

function normalizeKey(raw: string): string {
  return COLUMN_ALIASES[raw.trim().toLowerCase()] ?? raw.trim();
}

// ─── Parse file to rows ───────────────────────────────────────────────────────

function parseFile(buffer: Buffer, mimetype: string, mapping: Record<string, string>): Record<string, unknown>[] {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

  return raw.map(row => {
    const out: Record<string, unknown> = {};
    for (const [fileCol, val] of Object.entries(row)) {
      const mapped = mapping[fileCol] ?? normalizeKey(fileCol);
      out[mapped] = val;
    }
    return out;
  });
}

// ─── Validate a single row ────────────────────────────────────────────────────

function validateRow(raw: Record<string, unknown>): { data: LotRow | null; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Coerce numeric strings
  const coerced = { ...raw };
  if (typeof coerced.weightInitial === "string") coerced.weightInitial = parseFloat(coerced.weightInitial as string);
  if (typeof coerced.humidity === "string") coerced.humidity = parseFloat(coerced.humidity as string);

  const result = LotRowSchema.safeParse(coerced);
  if (!result.success) {
    const issues = result.error.issues ?? (result.error as any).errors ?? [];
    for (const issue of issues) {
      errors.push(issue.message ?? String(issue));
    }
    return { data: null, errors, warnings };
  }

  const data = result.data;
  if (data.humidity > 35) warnings.push(`Humidité élevée (${data.humidity}%) — risque moisissures`);
  if (data.weightInitial < 1) warnings.push(`Poids très faible (${data.weightInitial} kg)`);
  if (!data.region) warnings.push("Région non renseignée");
  if (!data.warehouse) warnings.push("Entrepôt non renseigné");

  return { data, errors, warnings };
}

// ─── POST /api/import-lots/validate ──────────────────────────────────────────

router.post(
  "/import-lots/validate",
  requireAuth, requireRole(...ROLES),
  upload.single("file"),
  async (req, res): Promise<void> => {
    if (!req.file) { res.status(400).json({ error: "Aucun fichier reçu" }); return; }

    let mapping: Record<string, string> = {};
    try { mapping = JSON.parse(req.body.mapping ?? "{}"); } catch { /* ignore */ }

    // 1. Parse
    let rawRows: Record<string, unknown>[];
    try {
      rawRows = parseFile(req.file.buffer, req.file.mimetype, mapping);
    } catch (e) {
      res.status(400).json({ error: "Impossible de lire le fichier. Vérifiez le format (Excel ou CSV)." });
      return;
    }

    if (!rawRows.length) { res.status(400).json({ error: "Fichier vide ou sans données" }); return; }

    // 2. Validate each row
    const validated = rawRows.map((raw, i) => {
      const { data, errors, warnings } = validateRow(raw);
      return { rowIndex: i, raw, data, errors, warnings, duplicate: false, duplicateSource: null as null | "file" | "db", suggestedAction: "create" as "create" | "update" | "ignore" };
    });

    // 3. Intra-file duplicate detection (same code)
    const seenCodes = new Map<string, number>();
    for (const row of validated) {
      const code = (row.data?.code ?? (row.raw as any).code ?? "").toString().trim().toUpperCase();
      if (!code) continue;
      if (seenCodes.has(code)) {
        row.duplicate = true;
        row.duplicateSource = "file";
        row.suggestedAction = "ignore";
      } else {
        seenCodes.set(code, row.rowIndex);
      }
    }

    // 4. DB duplicate detection
    const validCodes = validated.filter(r => r.data && !r.duplicate).map(r => r.data!.code.toUpperCase());
    const validSuppliers = [...new Set(validated.filter(r => r.data).map(r => r.data!.supplier))];

    // Fetch existing lots matching codes
    let existingByCode: Map<string, (typeof lotsTable.$inferSelect)> = new Map();
    if (validCodes.length) {
      const existing = await db.select().from(lotsTable);
      for (const l of existing) {
        existingByCode.set(l.code.toUpperCase(), l);
      }
    }

    // Fetch lots for weight-based duplicate detection (same supplier ±5%)
    const allLots = await db.select({
      id: lotsTable.id, code: lotsTable.code,
      supplierId: lotsTable.supplierId,
      weightInitial: lotsTable.weightInitial,
    }).from(lotsTable);

    // Fetch suppliers for name→id mapping
    const allSuppliers = await db.select().from(suppliersTable);
    const supplierByName = new Map(allSuppliers.map(s => [s.name.toLowerCase(), s]));

    for (const row of validated) {
      if (!row.data || row.duplicate) continue;
      const code = row.data.code.toUpperCase();
      const existing = existingByCode.get(code);

      if (existing) {
        row.duplicate = true;
        row.duplicateSource = "db";
        row.suggestedAction = "update";
        continue;
      }

      // Weight ±5% + same supplier
      const supplier = supplierByName.get(row.data.supplier.toLowerCase());
      if (supplier) {
        const weight = row.data.weightInitial;
        const lowBound = weight * 0.95;
        const highBound = weight * 1.05;
        const similar = allLots.find(l =>
          l.supplierId === supplier.id &&
          l.weightInitial >= lowBound && l.weightInitial <= highBound
        );
        if (similar) {
          row.warnings.push(`Possible doublon DB : lot similaire ${similar.code} (même fournisseur, poids ±5%)`);
        }
      }
    }

    const detectedColumns = rawRows.length ? Object.keys(rawRows[0]) : [];

    res.json({
      totalRows: rawRows.length,
      detectedColumns,
      rows: validated.map(r => ({
        rowIndex: r.rowIndex,
        raw: r.raw,
        data: r.data,
        errors: r.errors,
        warnings: r.warnings,
        duplicate: r.duplicate,
        duplicateSource: r.duplicateSource,
        suggestedAction: r.suggestedAction,
        valid: r.errors.length === 0,
      })),
    });
  }
);

// ─── POST /api/import-lots/execute ───────────────────────────────────────────

router.post("/import-lots/execute", requireAuth, requireRole(...ROLES), async (req, res): Promise<void> => {
  const { rows, fileName = "import" } = req.body as {
    rows: Array<{ data: Record<string, unknown>; action: "create" | "update" | "ignore" }>;
    fileName?: string;
  };

  if (!Array.isArray(rows) || !rows.length) {
    res.status(400).json({ error: "Aucune ligne à importer" });
    return;
  }

  const userId = (req as any).session?.userId ?? null;

  // Fetch/build supplier cache
  const allSuppliers = await db.select().from(suppliersTable);
  const supplierByName = new Map(allSuppliers.map(s => [s.name.toLowerCase(), s]));

  async function getOrCreateSupplier(name: string, region: string): Promise<string> {
    const key = name.toLowerCase();
    if (supplierByName.has(key)) return supplierByName.get(key)!.id;
    const [created] = await db.insert(suppliersTable).values({
      name, region: region || "Madagascar", score: 0,
    }).returning();
    supplierByName.set(key, created);
    return created.id;
  }

  let successCount = 0;
  let failedCount = 0;
  let ignoredCount = 0;
  const batchErrors: Array<{ rowNumber: number; rowData: object; message: string }> = [];

  await db.transaction(async (tx) => {
    for (let i = 0; i < rows.length; i++) {
      const { data: rawData, action } = rows[i];

      if (action === "ignore") { ignoredCount++; continue; }

      // Re-validate inside transaction
      const { data, errors } = validateRow(rawData as Record<string, unknown>);
      if (!data || errors.length) {
        failedCount++;
        batchErrors.push({ rowNumber: i + 1, rowData: rawData, message: errors.join("; ") });
        continue;
      }

      try {
        const supplierId = await getOrCreateSupplier(data.supplier, data.region ?? "");
        const normalizedCode = data.code.trim().toUpperCase();

        if (action === "create") {
          await tx.insert(lotsTable).values({
            code: normalizedCode,
            supplierId,
            weightInitial: data.weightInitial,
            weightCurrent: data.weightInitial,
            humidity: data.humidity,
            grade: data.grade ?? null,
            region: data.region || null,
            warehouse: data.warehouse || null,
            status: "raw",
          });
          successCount++;
        } else if (action === "update") {
          const [existing] = await tx.select().from(lotsTable).where(
            sql`UPPER(${lotsTable.code}) = ${normalizedCode}`
          );
          if (!existing) {
            // Fallback to create if not found
            await tx.insert(lotsTable).values({
              code: normalizedCode, supplierId,
              weightInitial: data.weightInitial, weightCurrent: data.weightInitial,
              humidity: data.humidity, grade: data.grade ?? null,
              region: data.region || null, warehouse: data.warehouse || null, status: "raw",
            });
          } else {
            await tx.update(lotsTable).set({
              supplierId, humidity: data.humidity,
              grade: data.grade ?? existing.grade,
              region: data.region || existing.region,
              warehouse: data.warehouse || existing.warehouse,
            }).where(eq(lotsTable.id, existing.id));
          }
          successCount++;
        }
      } catch (e: any) {
        failedCount++;
        batchErrors.push({
          rowNumber: i + 1, rowData: rawData,
          message: e?.message?.includes("unique") ? `Code "${data.code}" déjà existant` : (e?.message ?? "Erreur interne"),
        });
      }
    }
  });

  // Create audit batch record
  const [batch] = await db.insert(importBatchesTable).values({
    fileName,
    totalRows: rows.length,
    successCount,
    failedCount,
    ignoredCount,
    createdBy: userId,
  }).returning();

  if (batchErrors.length) {
    await db.insert(importErrorsTable).values(
      batchErrors.map(e => ({ batchId: batch.id, rowNumber: e.rowNumber, rowData: e.rowData, message: e.message }))
    );
  }

  logger.info({ batchId: batch.id, successCount, failedCount, ignoredCount }, "Import lots executed");

  res.json({
    batchId: batch.id,
    totalRows: rows.length,
    successCount,
    failedCount,
    ignoredCount,
    errors: batchErrors,
    message: `Import terminé : ${successCount} créés/mis à jour, ${failedCount} erreurs, ${ignoredCount} ignorés`,
  });
});

// ─── GET /api/import-lots/batches ────────────────────────────────────────────

router.get("/import-lots/batches", requireAuth, requireRole(...ROLES), async (_req, res): Promise<void> => {
  const batches = await db.select().from(importBatchesTable)
    .orderBy(importBatchesTable.createdAt);
  res.json(batches.map(b => ({
    ...b,
    createdAt: b.createdAt instanceof Date ? b.createdAt.toISOString() : b.createdAt,
  })));
});

// ─── GET /api/import-lots/batches/:id/errors ─────────────────────────────────

router.get("/import-lots/batches/:id/errors", requireAuth, requireRole(...ROLES), async (req, res): Promise<void> => {
  const errors = await db.select().from(importErrorsTable)
    .where(eq(importErrorsTable.batchId, String(req.params.id)));
  res.json(errors.map(e => ({
    ...e,
    createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : e.createdAt,
  })));
});

// ─── GET /api/import-lots/template ───────────────────────────────────────────

router.get("/import-lots/template", requireAuth, async (_req, res): Promise<void> => {
  const wb = XLSX.utils.book_new();
  const sampleData = [
    { Code: "VAN-2026-001", Fournisseur: "Coopérative Ambanja", Région: "DIANA", "Poids (kg)": 100, "Humidité (%)": 30, Grade: "Grade A", Entrepôt: "WH-Antananarivo" },
    { Code: "VAN-2026-002", Fournisseur: "Ferme Antalaha", Région: "SAVA", "Poids (kg)": 75, "Humidité (%)": 28, Grade: "Grade B", Entrepôt: "WH-SAVA" },
    { Code: "VAN-2026-003", Fournisseur: "Coopérative Sambava", Région: "SAVA", "Poids (kg)": 50, "Humidité (%)": 32, Grade: "Premium", Entrepôt: "WH-SAVA" },
  ];
  const ws = XLSX.utils.json_to_sheet(sampleData);

  // Style column widths
  ws["!cols"] = [{ wch: 15 }, { wch: 25 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 18 }];

  XLSX.utils.book_append_sheet(wb, ws, "Lots");

  // Add info sheet
  const infoData = [
    { Champ: "Code", Obligatoire: "Oui", Description: "Code unique du lot (ex: VAN-2026-001)" },
    { Champ: "Fournisseur", Obligatoire: "Oui", Description: "Nom du fournisseur (créé automatiquement si inconnu)" },
    { Champ: "Région", Obligatoire: "Non", Description: "Région Madagascar (SAVA, DIANA, etc.)" },
    { Champ: "Poids (kg)", Obligatoire: "Oui", Description: "Poids initial en kg (doit être > 0)" },
    { Champ: "Humidité (%)", Obligatoire: "Oui", Description: "Taux d'humidité 0–100. Alerte si > 35%" },
    { Champ: "Grade", Obligatoire: "Non", Description: "Grade A / Grade B / Grade C / Premium" },
    { Champ: "Entrepôt", Obligatoire: "Non", Description: "Identifiant de l'entrepôt" },
  ];
  const infoWs = XLSX.utils.json_to_sheet(infoData);
  infoWs["!cols"] = [{ wch: 15 }, { wch: 12 }, { wch: 50 }];
  XLSX.utils.book_append_sheet(wb, infoWs, "Instructions");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.set({
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": 'attachment; filename="modele_import_lots.xlsx"',
  });
  res.send(buf);
});

export default router;
