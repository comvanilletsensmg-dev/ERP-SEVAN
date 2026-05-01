import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, clientsTable } from "@workspace/db";
import { CreateClientBody, GetClientParams } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { requireRole } from "../middlewares/roles";

const router: IRouter = Router();

// Clients access restricted to SUPER_ADMIN, ACCOUNTANT, and COMMERCIAL only
const CLIENT_ROLES = ["SUPER_ADMIN", "ACCOUNTANT", "COMMERCIAL"] as const;

router.get("/clients", requireAuth, requireRole(...CLIENT_ROLES), async (_req, res): Promise<void> => {
  const clients = await db.select().from(clientsTable).orderBy(clientsTable.name);
  res.json(clients);
});

router.post("/clients", requireAuth, requireRole(...CLIENT_ROLES), async (req, res): Promise<void> => {
  const parsed = CreateClientBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [client] = await db.insert(clientsTable).values(parsed.data).returning();
  res.status(201).json(client);
});

router.get("/clients/:id", requireAuth, requireRole(...CLIENT_ROLES), async (req, res): Promise<void> => {
  const params = GetClientParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, params.data.id));
  if (!client) { res.status(404).json({ error: "Client introuvable" }); return; }
  res.json(client);
});

router.delete("/clients/:id", requireAuth, requireRole(...CLIENT_ROLES), async (req, res): Promise<void> => {
  const deleted = await db.delete(clientsTable).where(eq(clientsTable.id, req.params.id)).returning();
  if (!deleted.length) { res.status(404).json({ error: "Client introuvable" }); return; }
  res.json({ success: true });
});

export default router;
