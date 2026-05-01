import { Router, type IRouter } from "express";
import { db, leadsTable, enrichedLeadsTable, emailTemplatesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { scoreLead, getScoreLabel } from "../services/scoring";
import { sendEmail } from "../services/email";

const router: IRouter = Router();

const safe = (l: any) => ({
  ...l,
  createdAt: l.createdAt instanceof Date ? l.createdAt.toISOString() : l.createdAt,
  updatedAt: l.updatedAt instanceof Date ? l.updatedAt.toISOString() : l.updatedAt,
  enrichedAt: l.enrichedAt instanceof Date ? l.enrichedAt.toISOString() : l.enrichedAt,
});

// ─── Leads CRUD ───────────────────────────────────────────────────────────────

router.get("/leads", requireAuth, async (_req, res): Promise<void> => {
  const leads = await db.select().from(leadsTable).orderBy(desc(leadsTable.createdAt));
  const enrichments = await db.select().from(enrichedLeadsTable);
  const enrichMap = Object.fromEntries(enrichments.map(e => [e.leadId, e]));

  res.json(leads.map(l => ({
    ...safe(l),
    enriched: enrichMap[l.id] ? safe(enrichMap[l.id]) : null,
    scoreLabel: enrichMap[l.id] ? getScoreLabel(enrichMap[l.id].score) : "cold",
  })));
});

router.get("/leads/:id", requireAuth, async (req, res): Promise<void> => {
  const [lead] = await db.select().from(leadsTable).where(eq(leadsTable.id, req.params.id));
  if (!lead) { res.status(404).json({ error: "Lead introuvable" }); return; }
  const [enriched] = await db.select().from(enrichedLeadsTable).where(eq(enrichedLeadsTable.leadId, lead.id));
  res.json({ ...safe(lead), enriched: enriched ? safe(enriched) : null });
});

router.post("/leads", requireAuth, async (req, res): Promise<void> => {
  const { name, email, company, country, industry, companySize, website, stage, source, notes } = req.body;
  if (!name) { res.status(400).json({ error: "name requis" }); return; }

  const [lead] = await db.insert(leadsTable).values({
    name, email: email ?? null, company: company ?? null, country: country ?? null,
    industry: industry ?? null, companySize: companySize ? Number(companySize) : null,
    website: website ?? null, stage: stage ?? "new", source: source ?? "manual", notes: notes ?? null,
  }).returning();

  // Auto-score on creation
  const { score, details } = scoreLead(lead);
  await db.insert(enrichedLeadsTable).values({
    leadId: lead.id, industry: lead.industry, companySize: lead.companySize,
    website: lead.website, score, scoreDetails: JSON.stringify(details),
  });

  // Auto send welcome email if template exists
  const [welcomeTemplate] = await db.select().from(emailTemplatesTable)
    .where(eq(emailTemplatesTable.category, "welcome")).limit(1);
  if (welcomeTemplate && email) {
    await sendEmail({
      to: email, templateId: welcomeTemplate.id, leadId: lead.id,
      data: { name, company: company ?? "", product: "vanille Madagascar" },
    }).catch(() => {}); // non-blocking
  }

  res.status(201).json({ ...safe(lead), score, scoreLabel: getScoreLabel(score) });
});

router.patch("/leads/:id", requireAuth, async (req, res): Promise<void> => {
  const { name, email, company, country, industry, companySize, website, stage, source, notes } = req.body;
  const [lead] = await db.update(leadsTable).set({
    name, email, company, country, industry,
    companySize: companySize ? Number(companySize) : undefined,
    website, stage, source, notes, updatedAt: new Date(),
  }).where(eq(leadsTable.id, req.params.id)).returning();
  if (!lead) { res.status(404).json({ error: "Lead introuvable" }); return; }

  // Re-score
  const { score, details } = scoreLead(lead);
  const existing = await db.select().from(enrichedLeadsTable).where(eq(enrichedLeadsTable.leadId, lead.id));
  if (existing.length > 0) {
    await db.update(enrichedLeadsTable).set({ score, scoreDetails: JSON.stringify(details), industry: lead.industry, companySize: lead.companySize, website: lead.website, enrichedAt: new Date() }).where(eq(enrichedLeadsTable.leadId, lead.id));
  } else {
    await db.insert(enrichedLeadsTable).values({ leadId: lead.id, industry: lead.industry, companySize: lead.companySize, website: lead.website, score, scoreDetails: JSON.stringify(details) });
  }

  res.json({ ...safe(lead), score, scoreLabel: getScoreLabel(score) });
});

router.delete("/leads/:id", requireAuth, async (req, res): Promise<void> => {
  const deleted = await db.delete(leadsTable).where(eq(leadsTable.id, req.params.id)).returning();
  if (!deleted.length) { res.status(404).json({ error: "Lead introuvable" }); return; }
  res.json({ success: true });
});

// ─── Scoring & Enrichment ─────────────────────────────────────────────────────

router.post("/leads/:id/score", requireAuth, async (req, res): Promise<void> => {
  const [lead] = await db.select().from(leadsTable).where(eq(leadsTable.id, req.params.id));
  if (!lead) { res.status(404).json({ error: "Lead introuvable" }); return; }

  const { score, details } = scoreLead(lead);
  const existing = await db.select().from(enrichedLeadsTable).where(eq(enrichedLeadsTable.leadId, lead.id));
  let enriched;
  if (existing.length > 0) {
    [enriched] = await db.update(enrichedLeadsTable).set({ score, scoreDetails: JSON.stringify(details), enrichedAt: new Date() }).where(eq(enrichedLeadsTable.leadId, lead.id)).returning();
  } else {
    [enriched] = await db.insert(enrichedLeadsTable).values({ leadId: lead.id, industry: lead.industry, companySize: lead.companySize, website: lead.website, score, scoreDetails: JSON.stringify(details) }).returning();
  }
  res.json({ score, scoreLabel: getScoreLabel(score), details, enriched: safe(enriched) });
});

// ─── Mock Enrichment (simulated Kompass-style) ────────────────────────────────

router.post("/leads/enrich", requireAuth, async (req, res): Promise<void> => {
  const { company, country } = req.body;
  if (!company) { res.status(400).json({ error: "company requis" }); return; }

  // Simulate enrichment — returns plausible data based on inputs
  const mockData = {
    companySize: Math.floor(Math.random() * 200) + 10,
    industry: ["Import / Export alimentaire", "Distribution gourmet", "Négoce épices", "Restauration premium"][Math.floor(Math.random() * 4)],
    website: `www.${company.toLowerCase().replace(/\s+/g, "")}.com`,
    country: country ?? "France",
  };

  const lead = req.body.leadId ? await db.select().from(leadsTable).where(eq(leadsTable.id, req.body.leadId)).then(r => r[0]) : null;
  const { score, details } = scoreLead({ ...mockData, ...lead });

  res.json({ ...mockData, score, scoreLabel: getScoreLabel(score), details, source: "enrichissement_simulé" });
});

// ─── Email send to lead ───────────────────────────────────────────────────────

router.post("/leads/:id/email", requireAuth, async (req, res): Promise<void> => {
  const [lead] = await db.select().from(leadsTable).where(eq(leadsTable.id, req.params.id));
  if (!lead) { res.status(404).json({ error: "Lead introuvable" }); return; }
  if (!lead.email) { res.status(400).json({ error: "Ce lead n'a pas d'email" }); return; }

  const { templateId, subject, body } = req.body;
  const result = await sendEmail({
    to: lead.email, templateId, subject, body, leadId: lead.id,
    data: { name: lead.name, company: lead.company ?? "", product: "vanille Madagascar" },
  });
  res.json(result);
});

export default router;
