import { Router, type IRouter } from "express";
import { db, partnersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/partners", requireAuth, async (_req, res): Promise<void> => {
  const partners = await db.select().from(partnersTable).orderBy(partnersTable.name);
  res.json(partners);
});

router.post("/partners", requireAuth, async (req, res): Promise<void> => {
  const { name, type, email, phone, vatNumber, address, notes } = req.body;
  if (!name || !type) { res.status(400).json({ error: "name and type required" }); return; }
  if (!["client", "supplier"].includes(type)) { res.status(400).json({ error: "type must be client or supplier" }); return; }
  const [partner] = await db.insert(partnersTable).values({ name, type, email, phone, vatNumber, address, notes }).returning();
  res.status(201).json(partner);
});

router.put("/partners/:id", requireAuth, async (req, res): Promise<void> => {
  const { id } = req.params as Record<string, string>;
  const { name, type, email, phone, vatNumber, address, notes } = req.body;
  const [updated] = await db.update(partnersTable).set({ name, type, email, phone, vatNumber, address, notes }).where(eq(partnersTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Partner not found" }); return; }
  res.json(updated);
});

export default router;
