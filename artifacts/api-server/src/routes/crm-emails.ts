import { Router, type IRouter } from "express";
import { db, emailTemplatesTable, emailLogsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { sendEmail } from "../services/email";

const router: IRouter = Router();
const safe = (r: any) => ({ ...r, createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt, updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt });

// ─── Templates ────────────────────────────────────────────────────────────────

router.get("/crm/templates", requireAuth, async (_req, res): Promise<void> => {
  const templates = await db.select().from(emailTemplatesTable).orderBy(desc(emailTemplatesTable.createdAt));
  res.json(templates.map(safe));
});

router.post("/crm/templates", requireAuth, async (req, res): Promise<void> => {
  const { name, subject, body, category } = req.body;
  if (!name || !subject || !body) { res.status(400).json({ error: "name, subject et body requis" }); return; }
  const [tmpl] = await db.insert(emailTemplatesTable).values({ name, subject, body, category: category ?? "general" }).returning();
  res.status(201).json(safe(tmpl));
});

router.patch("/crm/templates/:id", requireAuth, async (req, res): Promise<void> => {
  const { name, subject, body, category } = req.body;
  const [tmpl] = await db.update(emailTemplatesTable).set({ name, subject, body, category, updatedAt: new Date() }).where(eq(emailTemplatesTable.id, String(req.params.id))).returning();
  if (!tmpl) { res.status(404).json({ error: "Template introuvable" }); return; }
  res.json(safe(tmpl));
});

router.delete("/crm/templates/:id", requireAuth, async (req, res): Promise<void> => {
  const deleted = await db.delete(emailTemplatesTable).where(eq(emailTemplatesTable.id, String(req.params.id))).returning();
  if (!deleted.length) { res.status(404).json({ error: "Template introuvable" }); return; }
  res.json({ success: true });
});

// ─── Email send (manual) ──────────────────────────────────────────────────────

router.post("/crm/send-email", requireAuth, async (req, res): Promise<void> => {
  const { to, templateId, subject, body, data, leadId } = req.body;
  if (!to) { res.status(400).json({ error: "Destinataire requis" }); return; }
  const result = await sendEmail({ to, templateId, subject, body, data: data ?? {}, leadId });
  res.json(result);
});

// ─── Email logs ───────────────────────────────────────────────────────────────

router.get("/crm/email-logs", requireAuth, async (_req, res): Promise<void> => {
  const logs = await db.select().from(emailLogsTable).orderBy(desc(emailLogsTable.createdAt)).limit(100);
  res.json(logs.map(safe));
});

export default router;
