/**
 * Departments routes.
 *   GET  /api/departments      — list all departments
 *   POST /api/departments      — create department (SUPER_ADMIN)
 */
import { Router, type IRouter } from "express";
import { db, departmentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { requireRole, ROLES } from "../middlewares/roles";

const router: IRouter = Router();

router.get("/departments", requireAuth, async (_req, res): Promise<void> => {
  const depts = await db.select().from(departmentsTable).orderBy(departmentsTable.code);
  res.json(depts);
});

router.post("/departments", requireAuth, requireRole(ROLES.SUPER_ADMIN, ROLES.HR_MANAGER), async (req, res): Promise<void> => {
  const { name, code } = req.body as { name?: string; code?: string };
  if (!name || !code) { res.status(400).json({ error: "name et code sont obligatoires" }); return; }
  const [dept] = await db.insert(departmentsTable).values({ name, code }).returning();
  res.status(201).json(dept);
});

router.put("/departments/:id", requireAuth, requireRole(ROLES.SUPER_ADMIN, ROLES.HR_MANAGER), async (req, res): Promise<void> => {
  const { name, code } = req.body as { name?: string; code?: string };
  if (!name && !code) { res.status(400).json({ error: "Aucune donnée à mettre à jour" }); return; }
  const update: Record<string, unknown> = {};
  if (name) update.name = name;
  if (code) update.code = code;
  const [dept] = await db.update(departmentsTable).set(update).where(eq(departmentsTable.id, String(req.params.id))).returning();
  if (!dept) { res.status(404).json({ error: "Département introuvable" }); return; }
  res.json(dept);
});

export default router;
