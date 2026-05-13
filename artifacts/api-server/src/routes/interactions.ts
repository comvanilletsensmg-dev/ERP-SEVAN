import { Router, type IRouter } from "express";
import { db, interactionsTable } from "@workspace/db";
import { eq, desc, or } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { requireRole } from "../middlewares/roles";

const router: IRouter = Router();
const CRM_ROLES = ["SUPER_ADMIN", "COMMERCIAL", "ACCOUNTANT"] as const;
const CRM_WRITE = ["SUPER_ADMIN", "COMMERCIAL"] as const;

const safe = (i: any) => ({
  ...i,
  createdAt: i.createdAt instanceof Date ? i.createdAt.toISOString() : i.createdAt,
});

router.get("/crm/interactions", requireAuth, requireRole(...CRM_ROLES), async (req, res): Promise<void> => {
  const { prospectId, clientId, dealId } = req.query as Record<string, string>;
  let rows = await db.select().from(interactionsTable).orderBy(desc(interactionsTable.createdAt));
  if (prospectId) rows = rows.filter(r => r.prospectId === prospectId);
  else if (clientId) rows = rows.filter(r => r.clientId === clientId);
  else if (dealId) rows = rows.filter(r => r.dealId === dealId);
  res.json(rows.map(safe));
});

router.post("/crm/interactions", requireAuth, requireRole(...CRM_WRITE), async (req, res): Promise<void> => {
  const { type, note, prospectId, clientId, dealId, createdBy } = req.body;
  if (!type || !note) { res.status(400).json({ error: "type et note requis" }); return; }
  const userId = req.currentUser?.id ?? createdBy ?? "system";
  const [interaction] = await db.insert(interactionsTable).values({
    type, note, prospectId: prospectId ?? null, clientId: clientId ?? null,
    dealId: dealId ?? null, createdBy: userId,
  }).returning();
  res.status(201).json(safe(interaction));
});

router.delete("/crm/interactions/:id", requireAuth, requireRole("SUPER_ADMIN"), async (req, res): Promise<void> => {
  const deleted = await db.delete(interactionsTable).where(eq(interactionsTable.id, String(req.params.id))).returning();
  if (!deleted.length) { res.status(404).json({ error: "Interaction introuvable" }); return; }
  res.json({ success: true });
});

export default router;
