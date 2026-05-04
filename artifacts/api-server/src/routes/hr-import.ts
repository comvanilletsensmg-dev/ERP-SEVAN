/**
 * HR employee import routes.
 *
 *   POST /api/hr/import/validate  — parse + validate XLSX/CSV, return preview rows
 *   POST /api/hr/import/execute   — persist validated rows, log ImportBatch
 */
import { Router, type IRouter } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { z } from "zod/v4";
import { db, employeesTable, importBatchesTable, importErrorsTable, departmentsTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { requireRole, ROLES } from "../middlewares/roles";
import { generateMatricule } from "../lib/matricule";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const hrAccess = requireRole(ROLES.SUPER_ADMIN, ROLES.HR_MANAGER);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const RowSchema = z.object({
  matricule: z.string().optional(),
  nom: z.string().min(1, "Nom obligatoire"),
  prenom: z.string().optional().default(""),
  sexe: z.enum(["M", "F", "m", "f"]).optional(),
  email: z.string().email("Email invalide").optional().or(z.literal("")),
  telephone: z.string().optional(),
  poste: z.string().optional().default(""),
  departement: z.string().optional(),
  typeContrat: z.enum(["CDI", "CDD", "journalier"]).optional().default("CDI"),
  salaireBase: z.coerce.number().positive("Salaire doit être > 0"),
  cnaps: z.string().optional(),
  ostie: z.string().optional(),
  dateEmbauche: z.string().optional(),
  statut: z.enum(["actif", "suspendu", "sorti"]).optional().default("actif"),
});

type ParsedRow = z.infer<typeof RowSchema>;

function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[\s_\-]+/g, "")
    .trim();
}

const HEADER_MAP: Record<string, keyof ParsedRow> = {
  matricule: "matricule",
  nom: "nom",
  prenom: "prenom",
  sexe: "sexe",
  email: "email",
  telephone: "telephone",
  tel: "telephone",
  poste: "poste",
  fonction: "poste",
  departement: "departement",
  dept: "departement",
  typecontrat: "typeContrat",
  contrat: "typeContrat",
  salairebase: "salaireBase",
  salaire: "salaireBase",
  cnaps: "cnaps",
  ostie: "ostie",
  dateembauche: "dateEmbauche",
  embauche: "dateEmbauche",
  statut: "statut",
};

function parseSheet(buffer: Buffer, ext: string): Record<string, unknown>[] {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: "" });
  if (raw.length === 0) return [];

  const firstRow = raw[0] as Record<string, unknown>;
  const mapping: Record<string, string> = {};
  for (const origKey of Object.keys(firstRow)) {
    const norm = normalizeHeader(String(origKey));
    const field = HEADER_MAP[norm];
    if (field) mapping[origKey] = field;
  }

  return raw.map((row) => {
    const mapped: Record<string, unknown> = {};
    for (const [orig, field] of Object.entries(mapping)) {
      mapped[field] = (row as Record<string, unknown>)[orig];
    }
    return mapped;
  });
}

router.post("/hr/import/validate", requireAuth, hrAccess, upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) { res.status(400).json({ error: "Fichier requis (xlsx ou csv)" }); return; }

  const ext = req.file.originalname.toLowerCase().split(".").pop() ?? "";
  if (!["xlsx", "xls", "csv"].includes(ext)) {
    res.status(400).json({ error: "Format non supporté — xlsx, xls ou csv uniquement" });
    return;
  }

  const rawRows = parseSheet(req.file.buffer, ext);
  if (rawRows.length === 0) {
    res.status(400).json({ error: "Fichier vide ou colonnes non reconnues" });
    return;
  }

  const allExisting = await db.select({ id: employeesTable.id, matricule: employeesTable.matricule, name: employeesTable.name, phone: employeesTable.phone }).from(employeesTable);

  const results = rawRows.map((raw, idx) => {
    const parsed = RowSchema.safeParse(raw);
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!parsed.success) {
      for (const issue of parsed.error.issues) errors.push(issue.message);
    }

    const data = parsed.success ? parsed.data : (raw as Partial<ParsedRow>);
    let duplicate: "strict" | "fuzzy" | null = null;
    let existingId: string | null = null;

    if (data.matricule) {
      const strictMatch = allExisting.find((e) => e.matricule === data.matricule);
      if (strictMatch) {
        duplicate = "strict";
        existingId = strictMatch.id;
        warnings.push(`Matricule ${data.matricule} déjà existant (mise à jour)`);
      }
    }

    if (!duplicate && data.nom && data.telephone) {
      const fullName = `${data.nom} ${data.prenom ?? ""}`.trim().toLowerCase();
      const fuzzy = allExisting.find((e) => {
        const eName = e.name.toLowerCase();
        return eName === fullName && e.phone === data.telephone;
      });
      if (fuzzy) {
        duplicate = "fuzzy";
        existingId = fuzzy.id;
        warnings.push(`Doublon probable : même nom+téléphone (mise à jour)`);
      }
    }

    return {
      rowNumber: idx + 2,
      data,
      errors,
      warnings,
      duplicate,
      existingId,
      action: duplicate ? "update" : "create",
      valid: errors.length === 0,
    };
  });

  res.json({
    total: results.length,
    valid: results.filter((r) => r.valid).length,
    invalid: results.filter((r) => !r.valid).length,
    duplicates: results.filter((r) => r.duplicate !== null).length,
    rows: results,
  });
});

router.post("/hr/import/execute", requireAuth, hrAccess, async (req, res): Promise<void> => {
  const { rows, fileName } = req.body as {
    fileName: string;
    rows: Array<{
      rowNumber: number;
      data: ParsedRow;
      action: "create" | "update";
      existingId?: string;
      valid: boolean;
    }>;
  };

  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(400).json({ error: "Aucune ligne à importer" });
    return;
  }

  let success = 0;
  let failed = 0;
  const errors: { rowNumber: number; message: string }[] = [];

  // Pre-load departments for code lookup
  const allDepts = await db.select().from(departmentsTable);
  const deptByName = (name: string) => allDepts.find((d) => d.name.toLowerCase() === name.toLowerCase());

  for (const row of rows) {
    if (!row.valid) { failed++; errors.push({ rowNumber: row.rowNumber, message: "Ligne invalide ignorée" }); continue; }

    const d = row.data;

    // Resolve department
    let departmentId: string | null = null;
    let departmentName: string | null = d.departement || null;
    if (d.departement) {
      const dept = deptByName(d.departement);
      if (dept) { departmentId = dept.id; departmentName = dept.name; }
    }

    // Auto-generate matricule if missing
    let matricule = d.matricule || null;
    if (!matricule && row.action === "create") {
      const deptCode = allDepts.find((dep) => dep.id === departmentId)?.code ?? "000";
      matricule = await generateMatricule(deptCode);
    }

    const nom = d.nom ?? "";
    const prenom = d.prenom ?? "";
    const employeeData = {
      matricule,
      name: `${prenom} ${nom}`.trim() || nom,
      nom: nom || null,
      prenom: prenom || null,
      sexe: d.sexe ?? null,
      email: d.email || null,
      position: d.poste || "—",
      department: departmentName,
      departmentId,
      salary: d.salaireBase,
      hireDate: d.dateEmbauche ? new Date(d.dateEmbauche) : null,
      typeContrat: d.typeContrat ?? "CDI",
      cnapsNumber: d.cnaps || null,
      ostieNumber: d.ostie || null,
      statut: d.statut ?? "actif",
      isActive: (d.statut ?? "actif") === "actif",
      phone: d.telephone || null,
    };

    try {
      if (row.action === "update" && row.existingId) {
        await db.update(employeesTable).set(employeeData).where(eq(employeesTable.id, row.existingId));
      } else {
        await db.insert(employeesTable).values(employeeData);
      }
      success++;
    } catch (err) {
      failed++;
      errors.push({ rowNumber: row.rowNumber, message: (err as Error).message.slice(0, 200) });
    }
  }

  const [batch] = await db.insert(importBatchesTable).values({
    fileName: fileName ?? "import",
    totalRows: rows.length,
    successCount: success,
    failedCount: failed,
    ignoredCount: 0,
  }).returning();

  if (errors.length > 0) {
    await db.insert(importErrorsTable).values(
      errors.map((e) => ({ batchId: batch.id, rowNumber: e.rowNumber, rowData: {}, message: e.message }))
    );
  }

  logger.info({ batchId: batch.id, success, failed }, "HR import completed");
  res.json({ batchId: batch.id, success, failed, errors });
});

export default router;
