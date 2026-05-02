import { Router, type IRouter } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { z } from "zod";
import { db, productsTable, importBatchesTable, importErrorsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { requireRole } from "../middlewares/roles";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const ROLES = ["SUPER_ADMIN", "LOGISTICS_MANAGER", "SALES_MANAGER"] as const;

const CATEGORIES = ["gousses", "poudre", "graine", "extrait de vanille", "pates de vanille", "oléorésine"] as const;
const AVAILABILITY = ["Disponible", "Rupture de stock", "Sur commande", "Discontinué"] as const;

// ─── Column aliases map ────────────────────────────────────────────────────────
const COLUMN_ALIASES: Record<string, string> = {
  // reference
  "réference*": "reference", "reference*": "reference", "réference": "reference", "reference": "reference", "ref": "reference", "réf": "reference",
  // name
  "nom du produit*": "name", "nom du produit": "name", "produit": "name", "name": "name",
  // category
  "catégories*": "category", "catégories": "category", "categories": "category", "category": "category", "catégorie": "category",
  // subCategoryGousse
  "sous catégories gousse": "subCategoryGousse", "sous-catégorie gousse": "subCategoryGousse",
  // size
  "taille (gousses seulement)": "size", "taille": "size", "size": "size",
  // subCategoryExtrait
  "sous catégories extrait": "subCategoryExtrait", "sous-catégorie extrait": "subCategoryExtrait",
  // subCategoryPate
  "sous catégories pates de vanille": "subCategoryPate", "sous-catégorie pates": "subCategoryPate",
  // description
  "déscription courte": "description", "description courte": "description", "description": "description",
  // aromaticProfile
  "profil aromatique": "aromaticProfile", "profil": "aromaticProfile",
  // recommendedUsage
  "usage recommandé": "recommendedUsage", "usage": "recommendedUsage",
  // packaging
  "conditionement": "packaging", "conditionnement": "packaging", "packaging": "packaging",
  // moq
  "moq": "moq", "minimum order quantity": "moq",
  // salesUnit
  "unité de vente": "salesUnit", "unite de vente": "salesUnit", "unit": "salesUnit",
  // availability
  "disponibilité": "availability", "disponibilite": "availability", "availability": "availability",
  // purchasePriceKg
  "prix d'achat par kg": "purchasePriceKg", "prix achat": "purchasePriceKg", "purchase price": "purchasePriceKg",
  // minFobPriceKg
  "prix min. fob par kg": "minFobPriceKg", "prix fob": "minFobPriceKg", "fob price": "minFobPriceKg",
};

function normalizeKey(raw: string): string {
  return COLUMN_ALIASES[raw.trim().toLowerCase()] ?? raw.trim();
}

// ─── Zod validation schema ────────────────────────────────────────────────────
const ProductRowSchema = z.object({
  reference: z.string().min(1, "Référence obligatoire"),
  name: z.string().min(1, "Nom du produit obligatoire"),
  category: z.string().min(1, "Catégorie obligatoire"),
  subCategoryGousse: z.string().optional().default(""),
  size: z.string().optional().default(""),
  subCategoryExtrait: z.string().optional().default(""),
  subCategoryPate: z.string().optional().default(""),
  description: z.string().optional().default(""),
  aromaticProfile: z.string().optional().default(""),
  recommendedUsage: z.string().optional().default(""),
  packaging: z.string().optional().default(""),
  moq: z.string().optional().default(""),
  salesUnit: z.string().optional().default(""),
  availability: z.string().optional().default("Disponible"),
  purchasePriceKg: z.union([z.number(), z.string().transform(v => parseFloat(v) || undefined), z.undefined()]).optional(),
  minFobPriceKg: z.union([z.number(), z.string().transform(v => parseFloat(v) || undefined), z.undefined()]).optional(),
});

type ProductRow = z.infer<typeof ProductRowSchema>;

// ─── Parse file ───────────────────────────────────────────────────────────────
function parseFile(buffer: Buffer, mapping: Record<string, string>): Record<string, unknown>[] {
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

function validateRow(raw: Record<string, unknown>): { data: ProductRow | null; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const coerced = { ...raw };
  if (typeof coerced.purchasePriceKg === "string") coerced.purchasePriceKg = parseFloat(coerced.purchasePriceKg as string) || undefined;
  if (typeof coerced.minFobPriceKg === "string") coerced.minFobPriceKg = parseFloat(coerced.minFobPriceKg as string) || undefined;

  const result = ProductRowSchema.safeParse(coerced);
  if (!result.success) {
    const issues = (result.error as any).issues ?? (result.error as any).errors ?? [];
    for (const issue of issues) errors.push(issue.message ?? String(issue));
    return { data: null, errors, warnings };
  }

  const data = result.data;
  const validCats = ["gousses", "poudre", "graine", "extrait de vanille", "pates de vanille", "oléorésine"];
  if (!validCats.includes(data.category.toLowerCase())) {
    warnings.push(`Catégorie "${data.category}" non standard`);
  }
  if (!data.purchasePriceKg) warnings.push("Prix d'achat non renseigné");
  if (!data.minFobPriceKg) warnings.push("Prix FOB non renseigné");
  return { data, errors, warnings };
}

// ─── POST /api/import-products/validate ──────────────────────────────────────
router.post("/import-products/validate", requireAuth, requireRole(...ROLES), upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) { res.status(400).json({ error: "Aucun fichier reçu" }); return; }
  let mapping: Record<string, string> = {};
  try { mapping = JSON.parse(req.body.mapping ?? "{}"); } catch { /* ignore */ }

  let rawRows: Record<string, unknown>[];
  try { rawRows = parseFile(req.file.buffer, mapping); }
  catch { res.status(400).json({ error: "Impossible de lire le fichier. Vérifiez le format (Excel ou CSV)." }); return; }
  if (!rawRows.length) { res.status(400).json({ error: "Fichier vide ou sans données" }); return; }

  const validated = rawRows.map((raw, i) => {
    const { data, errors, warnings } = validateRow(raw);
    return { rowIndex: i, raw, data, errors, warnings, duplicate: false, duplicateSource: null as null | "file" | "db", suggestedAction: "create" as "create" | "update" | "ignore", valid: errors.length === 0 };
  });

  // Intra-file duplicates
  const seenRefs = new Map<string, number>();
  for (const row of validated) {
    const ref = (row.data?.reference ?? (row.raw as any).reference ?? "").toString().trim().toUpperCase();
    if (!ref) continue;
    if (seenRefs.has(ref)) { row.duplicate = true; row.duplicateSource = "file"; row.suggestedAction = "ignore"; }
    else seenRefs.set(ref, row.rowIndex);
  }

  // DB duplicates
  const existing = await db.select({ id: productsTable.id, reference: productsTable.reference }).from(productsTable);
  const existingRefs = new Map(existing.map(p => [p.reference.toUpperCase(), p.id]));
  for (const row of validated) {
    if (!row.data || row.duplicate) continue;
    if (existingRefs.has(row.data.reference.toUpperCase())) {
      row.duplicate = true; row.duplicateSource = "db"; row.suggestedAction = "update";
    }
  }

  const detectedColumns = rawRows.length ? Object.keys(rawRows[0]) : [];
  res.json({ totalRows: rawRows.length, detectedColumns, rows: validated.map(r => ({ ...r, valid: r.errors.length === 0 })) });
});

// ─── POST /api/import-products/execute ───────────────────────────────────────
router.post("/import-products/execute", requireAuth, requireRole(...ROLES), async (req, res): Promise<void> => {
  const { rows, fileName = "import_products" } = req.body as {
    rows: Array<{ data: Record<string, unknown>; action: "create" | "update" | "ignore" }>;
    fileName?: string;
  };
  if (!Array.isArray(rows) || !rows.length) { res.status(400).json({ error: "Aucune ligne à importer" }); return; }

  const userId = (req as any).session?.userId ?? null;
  let successCount = 0, failedCount = 0, ignoredCount = 0;
  const batchErrors: Array<{ rowNumber: number; rowData: object; message: string }> = [];

  for (let i = 0; i < rows.length; i++) {
    const { data: rawData, action } = rows[i];
    if (action === "ignore") { ignoredCount++; continue; }

    const { data, errors } = validateRow(rawData as Record<string, unknown>);
    if (!data || errors.length) {
      failedCount++;
      batchErrors.push({ rowNumber: i + 1, rowData: rawData, message: errors.join("; ") });
      continue;
    }

    try {
      const values = {
        reference: data.reference.trim(),
        name: data.name.trim(),
        category: data.category.toLowerCase(),
        subCategoryGousse: data.subCategoryGousse || null,
        size: data.size || null,
        subCategoryExtrait: data.subCategoryExtrait || null,
        subCategoryPate: data.subCategoryPate || null,
        description: data.description || null,
        aromaticProfile: data.aromaticProfile || null,
        recommendedUsage: data.recommendedUsage || null,
        packaging: data.packaging || null,
        moq: data.moq || null,
        salesUnit: data.salesUnit || null,
        availability: data.availability || "Disponible",
        purchasePriceKg: data.purchasePriceKg ?? null,
        minFobPriceKg: data.minFobPriceKg ?? null,
      };

      if (action === "create") {
        await db.insert(productsTable).values(values)
          .onConflictDoNothing();
        successCount++;
      } else {
        const [existing] = await db.select().from(productsTable)
          .where(sql`UPPER(${productsTable.reference}) = ${data.reference.trim().toUpperCase()}`);
        if (existing) {
          await db.update(productsTable).set({ ...values, updatedAt: new Date() }).where(eq(productsTable.id, existing.id));
        } else {
          await db.insert(productsTable).values(values);
        }
        successCount++;
      }
    } catch (e: any) {
      failedCount++;
      const msg = (e?.message ?? "");
      batchErrors.push({
        rowNumber: i + 1,
        rowData: rawData,
        message: msg.includes("unique") || msg.includes("duplicate")
          ? `Référence "${data.reference}" déjà existante`
          : (msg || "Erreur interne"),
      });
    }
  }

  const [batch] = await db.insert(importBatchesTable).values({ fileName, totalRows: rows.length, successCount, failedCount, ignoredCount, createdBy: userId }).returning();
  if (batchErrors.length) {
    await db.insert(importErrorsTable).values(batchErrors.map(e => ({ batchId: batch.id, rowNumber: e.rowNumber, rowData: e.rowData, message: e.message })));
  }
  logger.info({ batchId: batch.id, successCount, failedCount, ignoredCount }, "Import products executed");
  res.json({ batchId: batch.id, totalRows: rows.length, successCount, failedCount, ignoredCount, errors: batchErrors, message: `Import terminé : ${successCount} créés/mis à jour, ${failedCount} erreurs, ${ignoredCount} ignorés` });
});

// ─── GET /api/import-products/batches ────────────────────────────────────────
router.get("/import-products/batches", requireAuth, requireRole(...ROLES), async (_req, res): Promise<void> => {
  const batches = await db.select().from(importBatchesTable).orderBy(importBatchesTable.createdAt);
  res.json(batches.map(b => ({ ...b, createdAt: b.createdAt instanceof Date ? b.createdAt.toISOString() : b.createdAt })));
});

// ─── GET /api/import-products/template ───────────────────────────────────────
router.get("/import-products/template", requireAuth, async (_req, res): Promise<void> => {
  const wb = XLSX.utils.book_new();
  const sample = [
    { "Réference*": "GV-N16", "Nom du produit*": "Vanille Noire Gourmet", "Catégories*": "gousses", "Sous catégories gousse": "non fendue", "TAILLE (GOUSSES SEULEMENT)": "16CM-21CM", "Sous catégories extrait": "", "Sous catégories pates de vanille": "", "Déscription courte": "Vanille noire premium, charnue et souple.", "Profil aromatique": "Vanillé riche, notes fruitées", "Usage recommandé": "Retail premium, pâtisserie", "Conditionement": "Sous vide: 250g, 500g, 1kg", "MOQ": "25 kg", "Unité de vente": "kg", "Disponibilité": "Disponible", "Prix d'achat par kg": 78000, "Prix min. FOB par kg": 44.32 },
    { "Réference*": "PV-A", "Nom du produit*": "Poudre de Vanille Grade A", "Catégories*": "poudre", "Sous catégories gousse": "", "TAILLE (GOUSSES SEULEMENT)": "", "Sous catégories extrait": "", "Sous catégories pates de vanille": "", "Déscription courte": "Poudre premium issue de gousses entières.", "Profil aromatique": "Vanille gourmande, chaude", "Usage recommandé": "Pâtisserie, chocolaterie", "Conditionement": "Sous vide: 250g, 500g, 1kg", "MOQ": "25 kg", "Unité de vente": "kg", "Disponibilité": "Disponible", "Prix d'achat par kg": 75000, "Prix min. FOB par kg": 42.61 },
  ];
  const ws = XLSX.utils.json_to_sheet(sample);
  ws["!cols"] = [{ wch: 12 }, { wch: 28 }, { wch: 18 }, { wch: 22 }, { wch: 20 }, { wch: 22 }, { wch: 26 }, { wch: 35 }, { wch: 28 }, { wch: 35 }, { wch: 32 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, ws, "Produits");

  const info = [
    { Champ: "Réference*", Obligatoire: "Oui", Description: "Code unique du produit (ex: GV-N16)" },
    { Champ: "Nom du produit*", Obligatoire: "Oui", Description: "Nom commercial du produit" },
    { Champ: "Catégories*", Obligatoire: "Oui", Description: "gousses | poudre | graine | extrait de vanille | pates de vanille | oléorésine" },
    { Champ: "Sous catégories gousse", Obligatoire: "Non", Description: "non fendue | fendue | fendue/mix | fendue/préparée" },
    { Champ: "TAILLE (GOUSSES SEULEMENT)", Obligatoire: "Non", Description: "Ex: 16CM-21CM" },
    { Champ: "Sous catégories extrait", Obligatoire: "Non", Description: "Préparation alcoolisée | Préparation non alcoolisée | etc." },
    { Champ: "Sous catégories pates de vanille", Obligatoire: "Non", Description: "Préparation sucrée | Préparation non sucrée" },
    { Champ: "Déscription courte", Obligatoire: "Non", Description: "Description marketing courte" },
    { Champ: "Profil aromatique", Obligatoire: "Non", Description: "Notes olfactives du produit" },
    { Champ: "Usage recommandé", Obligatoire: "Non", Description: "Applications et usages recommandés" },
    { Champ: "Conditionement", Obligatoire: "Non", Description: "Formats de conditionnement disponibles" },
    { Champ: "MOQ", Obligatoire: "Non", Description: "Quantité minimale de commande (ex: 25 kg)" },
    { Champ: "Unité de vente", Obligatoire: "Non", Description: "kg | L | pièce" },
    { Champ: "Disponibilité", Obligatoire: "Non", Description: "Disponible | Rupture de stock | Sur commande | Discontinué" },
    { Champ: "Prix d'achat par kg", Obligatoire: "Non", Description: "Prix en Ariary (MGA)" },
    { Champ: "Prix min. FOB par kg", Obligatoire: "Non", Description: "Prix minimum FOB en EUR" },
  ];
  const infoWs = XLSX.utils.json_to_sheet(info);
  infoWs["!cols"] = [{ wch: 32 }, { wch: 12 }, { wch: 55 }];
  XLSX.utils.book_append_sheet(wb, infoWs, "Instructions");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.set({ "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="modele_import_produits.xlsx"' });
  res.send(buf);
});

export default router;
