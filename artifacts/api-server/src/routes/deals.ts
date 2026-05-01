import { Router, type IRouter } from "express";
import { db, dealsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { requireRole } from "../middlewares/roles";

const router: IRouter = Router();
const CRM_ROLES = ["SUPER_ADMIN", "COMMERCIAL", "ACCOUNTANT"] as const;
const CRM_WRITE = ["SUPER_ADMIN", "COMMERCIAL"] as const;

const safe = (d: any) => ({
  ...d,
  createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : d.createdAt,
  updatedAt: d.updatedAt instanceof Date ? d.updatedAt.toISOString() : d.updatedAt,
  expectedClose: d.expectedClose instanceof Date ? d.expectedClose.toISOString() : d.expectedClose,
});

router.get("/crm/deals", requireAuth, requireRole(...CRM_ROLES), async (_req, res): Promise<void> => {
  const deals = await db.select().from(dealsTable).orderBy(desc(dealsTable.createdAt));
  res.json(deals.map(safe));
});

router.get("/crm/deals/:id", requireAuth, requireRole(...CRM_ROLES), async (req, res): Promise<void> => {
  const [deal] = await db.select().from(dealsTable).where(eq(dealsTable.id, req.params.id));
  if (!deal) { res.status(404).json({ error: "Deal introuvable" }); return; }
  res.json(safe(deal));
});

router.post("/crm/deals", requireAuth, requireRole(...CRM_WRITE), async (req, res): Promise<void> => {
  const { title, prospectId, clientId, stage, value, currency, probability, expectedClose, notes, assignedTo } = req.body;
  if (!title) { res.status(400).json({ error: "title requis" }); return; }
  const [deal] = await db.insert(dealsTable).values({
    title, prospectId: prospectId ?? null, clientId: clientId ?? null,
    stage: stage ?? "prospect", value: Number(value ?? 0),
    currency: currency ?? "USD", probability: Number(probability ?? 20),
    expectedClose: expectedClose ? new Date(expectedClose) : null,
    notes: notes ?? null, assignedTo: assignedTo ?? null,
  }).returning();
  res.status(201).json(safe(deal));
});

router.put("/crm/deals/:id", requireAuth, requireRole(...CRM_WRITE), async (req, res): Promise<void> => {
  const { title, prospectId, clientId, stage, value, currency, probability, expectedClose, notes, assignedTo } = req.body;
  const [updated] = await db.update(dealsTable).set({
    title, prospectId: prospectId ?? null, clientId: clientId ?? null,
    stage, value: value !== undefined ? Number(value) : undefined,
    currency, probability: probability !== undefined ? Number(probability) : undefined,
    expectedClose: expectedClose ? new Date(expectedClose) : null,
    notes: notes ?? null, assignedTo: assignedTo ?? null,
    updatedAt: new Date(),
  }).where(eq(dealsTable.id, req.params.id)).returning();
  if (!updated) { res.status(404).json({ error: "Deal introuvable" }); return; }
  res.json(safe(updated));
});

router.patch("/crm/deals/:id/stage", requireAuth, requireRole(...CRM_WRITE), async (req, res): Promise<void> => {
  const { stage } = req.body;
  if (!stage) { res.status(400).json({ error: "stage requis" }); return; }
  const STAGE_PROB: Record<string, number> = { prospect: 10, contact: 25, negotiation: 50, proposal: 70, won: 100, lost: 0 };
  const [updated] = await db.update(dealsTable).set({
    stage, probability: STAGE_PROB[stage] ?? undefined, updatedAt: new Date(),
  }).where(eq(dealsTable.id, req.params.id)).returning();
  if (!updated) { res.status(404).json({ error: "Deal introuvable" }); return; }
  res.json(safe(updated));
});

router.delete("/crm/deals/:id", requireAuth, requireRole("SUPER_ADMIN"), async (req, res): Promise<void> => {
  const deleted = await db.delete(dealsTable).where(eq(dealsTable.id, req.params.id)).returning();
  if (!deleted.length) { res.status(404).json({ error: "Deal introuvable" }); return; }
  res.json({ success: true });
});

export default router;
