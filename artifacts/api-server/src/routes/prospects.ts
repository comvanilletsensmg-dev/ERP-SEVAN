import { Router, type IRouter } from "express";
import { db, prospectsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { requireRole } from "../middlewares/roles";
import { scoreLead } from "../services/scoring";

const router: IRouter = Router();

const COMMERCIAL_ROLES = ["SUPER_ADMIN", "COMMERCIAL", "LOGISTICS_MANAGER"] as const;

const safe = (p: any) => ({
  ...p,
  createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
  updatedAt: p.updatedAt instanceof Date ? p.updatedAt.toISOString() : p.updatedAt,
});

router.get("/sales/prospects", requireAuth, requireRole(...COMMERCIAL_ROLES), async (_req, res): Promise<void> => {
  const prospects = await db.select().from(prospectsTable).orderBy(desc(prospectsTable.createdAt));
  res.json(prospects.map(safe));
});

router.get("/sales/prospects/:id", requireAuth, requireRole(...COMMERCIAL_ROLES), async (req, res): Promise<void> => {
  const [p] = await db.select().from(prospectsTable).where(eq(prospectsTable.id, req.params.id));
  if (!p) { res.status(404).json({ error: "Prospect introuvable" }); return; }
  res.json(safe(p));
});

router.post("/sales/prospects", requireAuth, requireRole(...COMMERCIAL_ROLES), async (req, res): Promise<void> => {
  const { company, contact, email, phone, country, source, notes } = req.body;
  if (!company || !country) { res.status(400).json({ error: "company et country requis" }); return; }

  // Auto-score based on country and industry signals from company name
  const { score } = scoreLead({ country, industry: company + " " + (notes ?? "") });

  const [prospect] = await db.insert(prospectsTable).values({
    company, contact: contact ?? null, email: email ?? null, phone: phone ?? null,
    country, source: source ?? "manuel", status: "to_contact",
    score, notes: notes ?? null,
  }).returning();

  res.status(201).json(safe(prospect));
});

router.put("/sales/prospects/:id", requireAuth, requireRole(...COMMERCIAL_ROLES), async (req, res): Promise<void> => {
  const { company, contact, email, phone, country, source, status, score, notes } = req.body;
  const [updated] = await db.update(prospectsTable).set({
    company, contact: contact ?? null, email: email ?? null, phone: phone ?? null,
    country, source, status, score: score !== undefined ? Number(score) : undefined,
    notes: notes ?? null, updatedAt: new Date(),
  }).where(eq(prospectsTable.id, req.params.id)).returning();
  if (!updated) { res.status(404).json({ error: "Prospect introuvable" }); return; }
  res.json(safe(updated));
});

// Advance status workflow
router.patch("/sales/prospects/:id/contact", requireAuth, requireRole(...COMMERCIAL_ROLES), async (req, res): Promise<void> => {
  const [updated] = await db.update(prospectsTable).set({ status: "contacted", updatedAt: new Date() }).where(eq(prospectsTable.id, req.params.id)).returning();
  if (!updated) { res.status(404).json({ error: "Prospect introuvable" }); return; }
  res.json(safe(updated));
});

router.patch("/sales/prospects/:id/qualify", requireAuth, requireRole(...COMMERCIAL_ROLES), async (req, res): Promise<void> => {
  const [updated] = await db.update(prospectsTable).set({ status: "qualified", updatedAt: new Date() }).where(eq(prospectsTable.id, req.params.id)).returning();
  if (!updated) { res.status(404).json({ error: "Prospect introuvable" }); return; }
  res.json(safe(updated));
});

// Convert prospect to client (marks as converted, returns data for client creation)
router.patch("/sales/prospects/:id/convert", requireAuth, requireRole(...COMMERCIAL_ROLES), async (req, res): Promise<void> => {
  const [p] = await db.select().from(prospectsTable).where(eq(prospectsTable.id, req.params.id));
  if (!p) { res.status(404).json({ error: "Prospect introuvable" }); return; }
  const [updated] = await db.update(prospectsTable).set({ status: "converted", updatedAt: new Date() }).where(eq(prospectsTable.id, req.params.id)).returning();
  res.json({ prospect: safe(updated), clientTemplate: { name: p.company, country: p.country, email: p.email, currency: "USD" } });
});

router.delete("/sales/prospects/:id", requireAuth, requireRole(...COMMERCIAL_ROLES), async (req, res): Promise<void> => {
  const deleted = await db.delete(prospectsTable).where(eq(prospectsTable.id, req.params.id)).returning();
  if (!deleted.length) { res.status(404).json({ error: "Prospect introuvable" }); return; }
  res.json({ success: true });
});

export default router;
