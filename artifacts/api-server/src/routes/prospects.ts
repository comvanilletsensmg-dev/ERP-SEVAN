import { Router, type IRouter } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { db, prospectsTable, clientsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { requireRole } from "../middlewares/roles";
import { scoreProspect } from "../services/prospect-scoring";

const router: IRouter = Router();
const CRM_ROLES = ["SUPER_ADMIN", "COMMERCIAL", "LOGISTICS_MANAGER"] as const;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const safe = (p: any) => ({
  ...p,
  createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
  updatedAt: p.updatedAt instanceof Date ? p.updatedAt.toISOString() : p.updatedAt,
  lastInteraction: p.lastInteraction instanceof Date ? p.lastInteraction.toISOString() : p.lastInteraction,
});

function autoScore(body: any): number {
  return scoreProspect({
    country: body.country, source: body.source,
    activityType: body.activityType,
    estimatedVolume: body.estimatedVolume ? Number(body.estimatedVolume) : null,
    budgetRange: body.budgetRange, email: body.email, phone: body.phone,
    website: body.website, vatRegistered: body.vatRegistered, vatNumber: body.vatNumber,
  });
}

// ─── EXCEL TEMPLATE DOWNLOAD (must be before /:id) ───────────────────────────
router.get("/crm/prospects/template", requireAuth, requireRole(...CRM_ROLES), async (_req, res): Promise<void> => {
  const wb = XLSX.utils.book_new();
  const headers = [
    "NOM DU TIERS", "NOM ALTERNATIF", "TYPE", "ADRESSE", "CODE POSTAL", "VILLE", "PAYS",
    "DÉPARTEMENT / CANTON", "TÉLÉPHONE", "TÉL PORTABLE", "FAX", "SITE WEB", "EMAIL",
    "REFUSER EMAILS DE MASSE", "IDENTIFIANT PRO 1", "IDENTIFIANT PRO 2",
    "ASSUJETTI TVA", "NUMÉRO DE TVA", "TAGS / CATÉGORIES", "NOTES INTERNES",
    "TYPE ACTIVITÉ", "VOLUME ESTIMÉ (t/an)", "SOURCE", "PRODUITS RECHERCHÉS",
    "DÉLAI DÉCISION", "BUDGET USD/kg", "DEVISE PRÉFÉRÉE", "INCOTERM", "PAIEMENT"
  ];
  const example = [
    "Épices du Monde SAS", "Épices du Monde", "Entreprise", "12 rue des épiciers", "75001", "Paris", "FR",
    "Île-de-France", "+33 1 23 45 67 89", "", "", "https://epicesdumonde.fr", "contact@epicesdumonde.fr",
    "Non", "89234567890123", "FR12234567890", "Oui", "FR12234567890", "vanille;importateur;france",
    "Importateur gourmet parisien", "importateur", "1.5", "kompass", "vanille_gourmet;extraits",
    "1_3_mois", "50_100", "EUR", "CIF", "virement_30j"
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, example]);
  XLSX.utils.book_append_sheet(wb, ws, "Prospects");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="modele_prospects.xlsx"');
  res.send(buf);
});

// ─── EXCEL IMPORT (must be before /:id) ──────────────────────────────────────
router.post("/crm/prospects/import", requireAuth, requireRole(...CRM_ROLES), upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) { res.status(400).json({ error: "Fichier requis" }); return; }

  const wb = XLSX.read(req.file.buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

  if (rows.length < 2) { res.status(400).json({ error: "Fichier vide ou sans données" }); return; }

  const headers = (rows[0] as string[]).map((h: string) => h?.toString().trim().toUpperCase());
  const col = (name: string) => headers.indexOf(name.toUpperCase());

  const valid: any[] = [];
  const errors: { line: number; message: string }[] = [];
  const userId = req.currentUser?.id ?? "system";

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as any[];
    if (!row || row.every((c: any) => !c)) continue;

    const get = (colName: string) => {
      const idx = col(colName);
      return idx >= 0 ? (row[idx]?.toString().trim() ?? "") : "";
    };

    const company = get("NOM DU TIERS");
    const country = get("PAYS");
    if (!company) { errors.push({ line: i + 1, message: "NOM DU TIERS manquant" }); continue; }
    if (!country) { errors.push({ line: i + 1, message: "PAYS manquant" }); continue; }

    const email = get("EMAIL");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push({ line: i + 1, message: `Email invalide "${email}"` }); continue;
    }

    const tagsRaw = get("TAGS / CATÉGORIES");
    const tags = tagsRaw ? JSON.stringify(tagsRaw.split(/[;,]/).map((t: string) => t.trim()).filter(Boolean)) : "[]";
    const productsRaw = get("PRODUITS RECHERCHÉS");
    const productsSought = productsRaw ? JSON.stringify(productsRaw.split(/[;,]/).map((t: string) => t.trim()).filter(Boolean)) : "[]";

    const data: any = {
      company, country, altName: get("NOM ALTERNATIF") || null, type: get("TYPE") || "Entreprise",
      address: get("ADRESSE") || null, postalCode: get("CODE POSTAL") || null,
      city: get("VILLE") || null, region: get("DÉPARTEMENT / CANTON") || null,
      phone: get("TÉLÉPHONE") || null, mobile: get("TÉL PORTABLE") || null,
      fax: get("FAX") || null, website: get("SITE WEB") || null,
      email: email || null,
      refuseMassEmail: get("REFUSER EMAILS DE MASSE").toLowerCase() === "oui",
      proId1: get("IDENTIFIANT PRO 1") || null, proId2: get("IDENTIFIANT PRO 2") || null,
      vatRegistered: get("ASSUJETTI TVA").toLowerCase() === "oui",
      vatNumber: get("NUMÉRO DE TVA") || null,
      tags, internalNotes: get("NOTES INTERNES") || null, notes: get("NOTES INTERNES") || null,
      activityType: get("TYPE ACTIVITÉ") || null,
      estimatedVolume: get("VOLUME ESTIMÉ (t/an)") ? Number(get("VOLUME ESTIMÉ (t/an)")) : null,
      source: get("SOURCE") || "import_excel", status: "new",
      productsSought, decisionTimeline: get("DÉLAI DÉCISION") || null,
      budgetRange: get("BUDGET USD/kg") || null,
      preferredCurrency: get("DEVISE PRÉFÉRÉE") || "USD",
      preferredIncoterm: get("INCOTERM") || null,
      paymentTerms: get("PAIEMENT") || null,
      certifications: "[]", createdBy: userId, score: 0,
    };
    data.score = scoreProspect(data);
    valid.push(data);
  }

  if (valid.length === 0) {
    res.json({ imported: 0, errors, message: "Aucune ligne valide trouvée" });
    return;
  }

  const inserted = await db.insert(prospectsTable).values(valid).returning();
  res.json({ imported: inserted.length, errors, message: `${inserted.length} prospect(s) importé(s)` });
});

// ─── LIST ─────────────────────────────────────────────────────────────────────
router.get("/crm/prospects", requireAuth, requireRole(...CRM_ROLES), async (req, res): Promise<void> => {
  let rows = await db.select().from(prospectsTable).orderBy(desc(prospectsTable.createdAt));
  const { status, country, source } = req.query as Record<string, string>;
  if (status) rows = rows.filter(r => r.status === status);
  if (country) rows = rows.filter(r => r.country.toLowerCase().includes(country.toLowerCase()));
  if (source)  rows = rows.filter(r => r.source === source);
  res.json(rows.map(safe));
});

// ─── DETAIL ───────────────────────────────────────────────────────────────────
router.get("/crm/prospects/:id", requireAuth, requireRole(...CRM_ROLES), async (req, res): Promise<void> => {
  const [p] = await db.select().from(prospectsTable).where(eq(prospectsTable.id, req.params.id));
  if (!p) { res.status(404).json({ error: "Prospect introuvable" }); return; }
  res.json(safe(p));
});

// ─── CREATE ───────────────────────────────────────────────────────────────────
router.post("/crm/prospects", requireAuth, requireRole(...CRM_ROLES), async (req, res): Promise<void> => {
  const { company, country } = req.body;
  if (!company || !country) { res.status(400).json({ error: "company et country requis" }); return; }

  const score = autoScore(req.body);
  const userId = req.currentUser?.id ?? "system";

  const [prospect] = await db.insert(prospectsTable).values({
    company, altName: req.body.altName ?? null, type: req.body.type ?? "Entreprise",
    clientCode: req.body.clientCode ?? null,
    address: req.body.address ?? null, postalCode: req.body.postalCode ?? null,
    city: req.body.city ?? null, country, region: req.body.region ?? null,
    contact: req.body.contact ?? null, phone: req.body.phone ?? null,
    mobile: req.body.mobile ?? null, fax: req.body.fax ?? null,
    website: req.body.website ?? null, email: req.body.email ?? null,
    refuseMassEmail: Boolean(req.body.refuseMassEmail),
    proId1: req.body.proId1 ?? null, proId2: req.body.proId2 ?? null,
    vatRegistered: Boolean(req.body.vatRegistered), vatNumber: req.body.vatNumber ?? null,
    tags: req.body.tags ? JSON.stringify(req.body.tags) : "[]",
    internalNotes: req.body.internalNotes ?? null, notes: req.body.notes ?? req.body.internalNotes ?? null,
    source: req.body.source ?? "manuel", status: req.body.status ?? "new",
    score, assignedTo: req.body.assignedTo ?? null, createdBy: userId,
    activityType: req.body.activityType ?? null,
    estimatedVolume: req.body.estimatedVolume ? Number(req.body.estimatedVolume) : null,
    currentSupplier: req.body.currentSupplier ?? null,
    productsSought: req.body.productsSought ? JSON.stringify(req.body.productsSought) : "[]",
    decisionTimeline: req.body.decisionTimeline ?? null, budgetRange: req.body.budgetRange ?? null,
    preferredCurrency: req.body.preferredCurrency ?? "USD", preferredIncoterm: req.body.preferredIncoterm ?? null,
    paymentTerms: req.body.paymentTerms ?? null,
    certifications: req.body.certifications ? JSON.stringify(req.body.certifications) : "[]",
  }).returning();

  res.status(201).json(safe(prospect));
});

// ─── UPDATE ───────────────────────────────────────────────────────────────────
router.put("/crm/prospects/:id", requireAuth, requireRole(...CRM_ROLES), async (req, res): Promise<void> => {
  const score = autoScore(req.body);
  const [updated] = await db.update(prospectsTable).set({
    company: req.body.company, altName: req.body.altName ?? null, type: req.body.type,
    address: req.body.address ?? null, postalCode: req.body.postalCode ?? null,
    city: req.body.city ?? null, country: req.body.country, region: req.body.region ?? null,
    contact: req.body.contact ?? null, phone: req.body.phone ?? null,
    mobile: req.body.mobile ?? null, fax: req.body.fax ?? null,
    website: req.body.website ?? null, email: req.body.email ?? null,
    refuseMassEmail: req.body.refuseMassEmail !== undefined ? Boolean(req.body.refuseMassEmail) : undefined,
    proId1: req.body.proId1 ?? null, proId2: req.body.proId2 ?? null,
    vatRegistered: req.body.vatRegistered !== undefined ? Boolean(req.body.vatRegistered) : undefined,
    vatNumber: req.body.vatNumber ?? null,
    tags: req.body.tags !== undefined ? JSON.stringify(req.body.tags) : undefined,
    internalNotes: req.body.internalNotes ?? null, notes: req.body.notes ?? null,
    source: req.body.source, status: req.body.status, score,
    assignedTo: req.body.assignedTo ?? null,
    activityType: req.body.activityType ?? null,
    estimatedVolume: req.body.estimatedVolume ? Number(req.body.estimatedVolume) : null,
    currentSupplier: req.body.currentSupplier ?? null,
    productsSought: req.body.productsSought !== undefined ? JSON.stringify(req.body.productsSought) : undefined,
    decisionTimeline: req.body.decisionTimeline ?? null, budgetRange: req.body.budgetRange ?? null,
    preferredCurrency: req.body.preferredCurrency ?? undefined, preferredIncoterm: req.body.preferredIncoterm ?? null,
    paymentTerms: req.body.paymentTerms ?? null,
    certifications: req.body.certifications !== undefined ? JSON.stringify(req.body.certifications) : undefined,
    updatedAt: new Date(),
  }).where(eq(prospectsTable.id, req.params.id)).returning();
  if (!updated) { res.status(404).json({ error: "Prospect introuvable" }); return; }
  res.json(safe(updated));
});

// ─── STATUS CHANGE ────────────────────────────────────────────────────────────
router.patch("/crm/prospects/:id/status", requireAuth, requireRole(...CRM_ROLES), async (req, res): Promise<void> => {
  const { status } = req.body;
  if (!status) { res.status(400).json({ error: "status requis" }); return; }
  const [updated] = await db.update(prospectsTable).set({ status, updatedAt: new Date() })
    .where(eq(prospectsTable.id, req.params.id)).returning();
  if (!updated) { res.status(404).json({ error: "Prospect introuvable" }); return; }
  res.json(safe(updated));
});

// ─── CONVERT TO CLIENT ────────────────────────────────────────────────────────
router.patch("/crm/prospects/:id/convert", requireAuth, requireRole(...CRM_ROLES), async (req, res): Promise<void> => {
  const [p] = await db.select().from(prospectsTable).where(eq(prospectsTable.id, req.params.id));
  if (!p) { res.status(404).json({ error: "Prospect introuvable" }); return; }

  const [client] = await db.insert(clientsTable).values({
    name: p.company, country: p.country, email: p.email, phone: p.phone,
    currency: p.preferredCurrency ?? "USD", riskLevel: "medium",
    paymentTerms: 30, notes: p.internalNotes,
  }).returning();

  await db.update(prospectsTable).set({
    status: "converted", convertedToClientId: client.id, updatedAt: new Date(),
  }).where(eq(prospectsTable.id, p.id));

  res.json({ prospect: safe({ ...p, status: "converted", convertedToClientId: client.id }), client });
});

// ─── RESCORE ──────────────────────────────────────────────────────────────────
router.post("/crm/prospects/:id/score", requireAuth, requireRole(...CRM_ROLES), async (req, res): Promise<void> => {
  const [p] = await db.select().from(prospectsTable).where(eq(prospectsTable.id, req.params.id));
  if (!p) { res.status(404).json({ error: "Prospect introuvable" }); return; }
  const score = scoreProspect({
    country: p.country, source: p.source, activityType: p.activityType,
    estimatedVolume: p.estimatedVolume, budgetRange: p.budgetRange,
    email: p.email, phone: p.phone, website: p.website,
    vatRegistered: p.vatRegistered, vatNumber: p.vatNumber,
  });
  const [updated] = await db.update(prospectsTable).set({ score, updatedAt: new Date() })
    .where(eq(prospectsTable.id, p.id)).returning();
  res.json({ score, prospect: safe(updated) });
});

// ─── DELETE ───────────────────────────────────────────────────────────────────
router.delete("/crm/prospects/:id", requireAuth, requireRole(...CRM_ROLES), async (req, res): Promise<void> => {
  const deleted = await db.delete(prospectsTable).where(eq(prospectsTable.id, req.params.id)).returning();
  if (!deleted.length) { res.status(404).json({ error: "Prospect introuvable" }); return; }
  res.json({ success: true });
});

// ─── BACKWARD COMPAT ──────────────────────────────────────────────────────────
router.get("/sales/prospects", requireAuth, requireRole(...CRM_ROLES), async (_req, res): Promise<void> => {
  const rows = await db.select().from(prospectsTable).orderBy(desc(prospectsTable.createdAt));
  res.json(rows.map(safe));
});

export default router;
