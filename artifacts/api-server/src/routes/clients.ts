import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, clientsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { requireRole } from "../middlewares/roles";

const router: IRouter = Router();
const CLIENT_ROLES = ["SUPER_ADMIN", "ACCOUNTANT", "COMMERCIAL"] as const;
const CLIENT_WRITE = ["SUPER_ADMIN", "COMMERCIAL"] as const;

const safe = (c: any) => ({
  ...c,
  createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
  updatedAt: c.updatedAt instanceof Date ? c.updatedAt.toISOString() : c.updatedAt,
});

router.get("/clients", requireAuth, requireRole(...CLIENT_ROLES), async (_req, res): Promise<void> => {
  const clients = await db.select().from(clientsTable).orderBy(clientsTable.name);
  res.json(clients.map(safe));
});

router.post("/clients", requireAuth, requireRole(...CLIENT_WRITE), async (req, res): Promise<void> => {
  const { name, country, email, phone, currency, riskLevel, creditLimit, paymentTerms, notes } = req.body;
  if (!name || !country) { res.status(400).json({ error: "name et country requis" }); return; }
  const [client] = await db.insert(clientsTable).values({
    name, country, email: email ?? null, phone: phone ?? null,
    currency: currency ?? "USD", riskLevel: riskLevel ?? "medium",
    creditLimit: creditLimit ? Number(creditLimit) : null,
    paymentTerms: paymentTerms ? Number(paymentTerms) : 30,
    notes: notes ?? null,
  }).returning();
  res.status(201).json(safe(client));
});

router.get("/clients/:id", requireAuth, requireRole(...CLIENT_ROLES), async (req, res): Promise<void> => {
  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, String(req.params.id)));
  if (!client) { res.status(404).json({ error: "Client introuvable" }); return; }
  res.json(safe(client));
});

router.put("/clients/:id", requireAuth, requireRole(...CLIENT_WRITE), async (req, res): Promise<void> => {
  const { name, country, email, phone, currency, riskLevel, creditLimit, paymentTerms, isActive, notes } = req.body;
  const [updated] = await db.update(clientsTable).set({
    name, country, email: email ?? null, phone: phone ?? null, currency, riskLevel,
    creditLimit: creditLimit !== undefined ? Number(creditLimit) : undefined,
    paymentTerms: paymentTerms !== undefined ? Number(paymentTerms) : undefined,
    isActive: isActive !== undefined ? Boolean(isActive) : undefined,
    notes: notes ?? null, updatedAt: new Date(),
  }).where(eq(clientsTable.id, String(req.params.id))).returning();
  if (!updated) { res.status(404).json({ error: "Client introuvable" }); return; }
  res.json(safe(updated));
});

router.delete("/clients/:id", requireAuth, requireRole(...CLIENT_WRITE), async (req, res): Promise<void> => {
  const deleted = await db.delete(clientsTable).where(eq(clientsTable.id, String(req.params.id))).returning();
  if (!deleted.length) { res.status(404).json({ error: "Client introuvable" }); return; }
  res.json({ success: true });
});

export default router;
