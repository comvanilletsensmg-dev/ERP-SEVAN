import { Router, type IRouter } from "express";
import { eq, desc, sql } from "drizzle-orm";
import multer from "multer";
import path from "path";
import fs from "fs";
import { z } from "zod/v4";
import { db, candidatesTable, employeesTable, onboardingTasksTable } from "@workspace/db";
import { loadUser } from "../middlewares/roles";

const router: IRouter = Router();

// ── Upload storage ─────────────────────────────────────────────────────────────
const cvDir = path.join(process.cwd(), "uploads", "cv");
fs.mkdirSync(cvDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, cvDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `cv-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const allowed = [".pdf", ".jpg", ".jpeg", ".png", ".webp"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error("Format non supporté — PDF, JPG, PNG uniquement"));
  },
});

// ── CV Parsing service ─────────────────────────────────────────────────────────
async function parseCvText(text: string): Promise<{
  firstName?: string; lastName?: string; email?: string; phone?: string;
  skills: string[]; experience?: string; education?: string; score: number;
}> {
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);

  // Email
  const emailMatch = text.match(/[\w.+-]+@[\w-]+\.[\w.]{2,}/);
  const email = emailMatch?.[0];

  // Phone Madagascar / international
  const phoneMatch = text.match(/(?:(?:\+261|0)(3[2348]\d{7}|\d{8,9}))/);
  const phone = phoneMatch?.[0]?.replace(/\s/g, "");

  // Name heuristic — first non-empty line with 2 words, not all caps header
  let firstName: string | undefined;
  let lastName: string | undefined;
  for (const line of lines.slice(0, 8)) {
    const words = line.split(/\s+/).filter(w => w.length > 1 && /^[A-ZÀ-Ÿa-zà-ÿ\-']+$/.test(w));
    if (words.length >= 2 && words.length <= 4 && !line.includes("@") && !line.match(/^\d/)) {
      firstName = words[0];
      lastName = words.slice(1).join(" ");
      break;
    }
  }

  // Skills extraction — common tech + HR keywords
  const skillsKeywords = [
    "Excel", "Word", "PowerPoint", "SAP", "Sage", "Python", "JavaScript", "TypeScript",
    "React", "Node", "SQL", "PostgreSQL", "MySQL", "MongoDB", "Java", "PHP", "C++",
    "Marketing", "Vente", "Comptabilité", "RH", "Management", "Leadership", "Communication",
    "Logistics", "Supply Chain", "Vanilla", "Export", "Import", "Douane",
    "Anglais", "Français", "Malgache", "Malagasy", "English", "French",
    "Photoshop", "Illustrator", "AutoCAD", "Odoo", "ERP",
    "Analyse", "Reporting", "Budget", "Audit", "Finance",
  ];
  const foundSkills = skillsKeywords.filter(kw => new RegExp(kw, "i").test(text));

  // Experience extraction — look for year mentions
  const expMatch = text.match(/(\d+)\s*(?:an(?:s|née)?|year)/i);
  const expYears = expMatch ? parseInt(expMatch[1]) : 0;

  // Experience section
  const expIdx = lines.findIndex(l => /expérience|experience|parcours/i.test(l));
  const eduIdx = lines.findIndex(l => /formation|éducation|diplôme|université|university/i.test(l));
  const experience = expIdx >= 0 ? lines.slice(expIdx + 1, expIdx + 8).join("\n") : undefined;
  const education  = eduIdx >= 0 ? lines.slice(eduIdx + 1, eduIdx + 5).join("\n") : undefined;

  // Score = skills count * 10 + exp bonus, max 100
  const score = Math.min(100, foundSkills.length * 8 + Math.min(expYears * 5, 40));

  return { firstName, lastName, email, phone, skills: foundSkills, experience, education, score };
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmt(c: typeof candidatesTable.$inferSelect) {
  let skills: string[] = [];
  try { skills = JSON.parse(c.skills ?? "[]"); } catch { skills = []; }
  return {
    ...c,
    skills,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt?.toISOString() ?? c.createdAt.toISOString(),
  };
}

// ── Zod schemas ────────────────────────────────────────────────────────────────
const STATUSES = ["applied", "screening", "interview", "offer", "hired", "rejected", "new"] as const;

const CreateBody = z.object({
  firstName:  z.string().optional().nullable(),
  lastName:   z.string().optional().nullable(),
  name:       z.string().min(1),
  position:   z.string().min(1),
  email:      z.string().email().optional().nullable(),
  phone:      z.string().optional().nullable(),
  skills:     z.array(z.string()).optional(),
  experience: z.string().optional().nullable(),
  education:  z.string().optional().nullable(),
  cvUrl:      z.string().optional().nullable(),
  score:      z.number().int().min(0).max(100).optional(),
  source:     z.string().optional().nullable(),
  notes:      z.string().optional().nullable(),
});

const UpdateBody = z.object({
  firstName:  z.string().optional().nullable(),
  lastName:   z.string().optional().nullable(),
  name:       z.string().min(1).optional(),
  position:   z.string().optional(),
  email:      z.string().email().optional().nullable(),
  phone:      z.string().optional().nullable(),
  status:     z.enum(STATUSES).optional(),
  skills:     z.array(z.string()).optional(),
  experience: z.string().optional().nullable(),
  education:  z.string().optional().nullable(),
  cvUrl:      z.string().optional().nullable(),
  score:      z.number().int().min(0).max(100).optional(),
  source:     z.string().optional().nullable(),
  notes:      z.string().optional().nullable(),
});

// ── GET /api/recruitment/stats ─────────────────────────────────────────────────
router.get("/recruitment/stats", loadUser, async (_req, res): Promise<void> => {
  const [row] = await db.select({ count: sql<number>`cast(count(*) as int)` }).from(candidatesTable);
  const all = await db.select().from(candidatesTable);
  const byStatus = all.reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1;
    return acc;
  }, {});
  const thisMonth = all.filter(c => {
    const d = new Date(c.createdAt);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  res.json({ total: row?.count ?? 0, byStatus, thisMonth });
});

// ── GET /api/recruitment/candidates ───────────────────────────────────────────
router.get("/recruitment/candidates", loadUser, async (req, res): Promise<void> => {
  const { status } = req.query as { status?: string };
  let rows = await db.select().from(candidatesTable).orderBy(desc(candidatesTable.createdAt));
  if (status) rows = rows.filter(r => r.status === status);
  res.json(rows.map(fmt));
});

// ── GET /api/recruitment/candidates/:id ───────────────────────────────────────
router.get("/recruitment/candidates/:id", loadUser, async (req, res): Promise<void> => {
  const [row] = await db.select().from(candidatesTable).where(eq(candidatesTable.id, String(req.params.id)));
  if (!row) { res.status(404).json({ error: "Candidat introuvable" }); return; }
  res.json(fmt(row));
});

// ── POST /api/recruitment/candidates ─────────────────────────────────────────
router.post("/recruitment/candidates", loadUser, async (req, res): Promise<void> => {
  const p = CreateBody.safeParse(req.body);
  if (!p.success) { res.status(400).json({ error: p.error.message }); return; }
  const d = p.data;
  const name = d.name || [d.firstName, d.lastName].filter(Boolean).join(" ") || "Sans nom";
  const [row] = await db.insert(candidatesTable).values({
    id:         crypto.randomUUID(),
    name,
    firstName:  d.firstName || null,
    lastName:   d.lastName  || null,
    position:   d.position,
    email:      d.email     || null,
    phone:      d.phone     || null,
    skills:     JSON.stringify(d.skills ?? []),
    experience: d.experience || null,
    education:  d.education  || null,
    cvUrl:      d.cvUrl      || null,
    score:      d.score ?? 0,
    source:     d.source     || null,
    notes:      d.notes      || null,
    status:     "applied",
  }).returning();
  req.log.info({ id: row.id, name: row.name }, "Candidate created");
  res.status(201).json(fmt(row));
});

// ── PATCH /api/recruitment/candidates/:id ────────────────────────────────────
router.patch("/recruitment/candidates/:id", loadUser, async (req, res): Promise<void> => {
  const p = UpdateBody.safeParse(req.body);
  if (!p.success) { res.status(400).json({ error: p.error.message }); return; }
  const d = p.data;
  const updates: Partial<typeof candidatesTable.$inferInsert> & { updatedAt: Date } = { updatedAt: new Date() };
  if (d.name       !== undefined) updates.name       = d.name;
  if (d.firstName  !== undefined) updates.firstName  = d.firstName;
  if (d.lastName   !== undefined) updates.lastName   = d.lastName;
  if (d.position   !== undefined) updates.position   = d.position;
  if (d.email      !== undefined) updates.email      = d.email;
  if (d.phone      !== undefined) updates.phone      = d.phone;
  if (d.status     !== undefined) updates.status     = d.status;
  if (d.skills     !== undefined) updates.skills     = JSON.stringify(d.skills);
  if (d.experience !== undefined) updates.experience = d.experience;
  if (d.education  !== undefined) updates.education  = d.education;
  if (d.cvUrl      !== undefined) updates.cvUrl      = d.cvUrl;
  if (d.score      !== undefined) updates.score      = d.score;
  if (d.source     !== undefined) updates.source     = d.source;
  if (d.notes      !== undefined) updates.notes      = d.notes;

  const [row] = await db.update(candidatesTable).set(updates)
    .where(eq(candidatesTable.id, String(req.params.id))).returning();
  if (!row) { res.status(404).json({ error: "Candidat introuvable" }); return; }
  req.log.info({ id: row.id, status: row.status }, "Candidate updated");
  res.json(fmt(row));
});

// ── DELETE /api/recruitment/candidates/:id ───────────────────────────────────
router.delete("/recruitment/candidates/:id", loadUser, async (req, res): Promise<void> => {
  const [row] = await db.delete(candidatesTable).where(eq(candidatesTable.id, String(req.params.id))).returning();
  if (!row) { res.status(404).json({ error: "Candidat introuvable" }); return; }
  // Delete CV file if present
  if (row.cvUrl) {
    const filePath = path.join(process.cwd(), row.cvUrl.replace(/^\/api\//, "").replace("uploads/", "uploads/"));
    try { fs.unlinkSync(filePath); } catch { /* ignore */ }
  }
  req.log.info({ id: row.id }, "Candidate deleted");
  res.json({ ok: true });
});

// ── POST /api/recruitment/upload-cv ──────────────────────────────────────────
router.post("/recruitment/upload-cv", loadUser, upload.single("cv"), async (req, res): Promise<void> => {
  if (!req.file) { res.status(400).json({ error: "Aucun fichier reçu" }); return; }
  const ext = path.extname(req.file.originalname).toLowerCase();
  const cvUrl = `/api/uploads/cv/${req.file.filename}`;

  let parsed = { firstName: undefined as string | undefined, lastName: undefined as string | undefined,
    email: undefined as string | undefined, phone: undefined as string | undefined,
    skills: [] as string[], experience: undefined as string | undefined,
    education: undefined as string | undefined, score: 0 };

  try {
    if (ext === ".pdf") {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pdfParse = ((await import("pdf-parse")) as any).default ?? (await import("pdf-parse"));
      const data = await pdfParse(fs.readFileSync(req.file.path));
      parsed = await parseCvText(data.text) as typeof parsed;
    } else {
      // Image: return URL only, no OCR (would need tesseract)
      req.log.info("CV image uploaded — OCR non disponible pour les images");
    }
  } catch (e) {
    req.log.warn({ err: e }, "CV parsing failed, returning file URL only");
  }

  res.json({ cvUrl, ...parsed });
});

// ── POST /api/recruitment/candidates/:id/hire ────────────────────────────────
router.post("/recruitment/candidates/:id/hire", loadUser, async (req, res): Promise<void> => {
  const [candidate] = await db.select().from(candidatesTable)
    .where(eq(candidatesTable.id, String(req.params.id)));
  if (!candidate) { res.status(404).json({ error: "Candidat introuvable" }); return; }
  if (candidate.status === "hired") { res.status(400).json({ error: "Candidat déjà recruté" }); return; }

  // Generate matricule
  const year = new Date().getFullYear();
  const [cnt] = await db.select({ c: sql<number>`cast(count(*) as int)` }).from(employeesTable);
  const matricule = `${year}REC${String((cnt?.c ?? 0) + 1).padStart(4, "0")}`;

  // Create employee
  const [employee] = await db.insert(employeesTable).values({
    id:        crypto.randomUUID(),
    matricule,
    name:      candidate.name,
    nom:       candidate.lastName  || null,
    prenom:    candidate.firstName || null,
    email:     candidate.email     || null,
    phone:     candidate.phone     || null,
    position:  candidate.position,
    hireDate:  new Date(),
    statut:    "actif",
    isActive:  true,
    hasAccount: false,
  }).returning();

  // Create default onboarding tasks
  const defaultTasks = [
    "Remise du badge et accès bâtiment",
    "Configuration compte informatique",
    "Signature contrat de travail",
    "Présentation à l'équipe",
    "Formation sécurité et règlement intérieur",
    "Remise du matériel de travail",
  ];
  for (const title of defaultTasks) {
    await db.insert(onboardingTasksTable).values({
      id:         crypto.randomUUID(),
      employeeId: employee.id,
      title,
      status:     "pending",
    });
  }

  // Update candidate status
  const [updated] = await db.update(candidatesTable)
    .set({ status: "hired", updatedAt: new Date() })
    .where(eq(candidatesTable.id, candidate.id))
    .returning();

  req.log.info({ candidateId: candidate.id, employeeId: employee.id }, "Candidate hired → employee created");
  res.json({ candidate: fmt(updated), employee: { ...employee, createdAt: employee.createdAt.toISOString() } });
});

export default router;
