import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { requireRole, ROLES } from "../middlewares/roles";

const router: IRouter = Router();

const safe = (u: any) => ({ id: u.id, email: u.email, name: u.name ?? null, role: u.role, createdAt: u.createdAt instanceof Date ? u.createdAt.toISOString() : u.createdAt });

router.get("/users", requireAuth, requireRole(ROLES.SUPER_ADMIN), async (_req, res): Promise<void> => {
  const users = await db.select().from(usersTable).orderBy(usersTable.createdAt);
  res.json(users.map(safe));
});

router.post("/users", requireAuth, requireRole(ROLES.SUPER_ADMIN), async (req, res): Promise<void> => {
  const { email, password, name, role } = req.body;
  if (!email || !password || !role) { res.status(400).json({ error: "email, password, role requis" }); return; }
  const validRoles = Object.values(ROLES);
  if (!validRoles.includes(role)) { res.status(400).json({ error: `Rôle invalide. Valeurs: ${validRoles.join(", ")}` }); return; }
  try {
    const [user] = await db.insert(usersTable).values({ email, password, name, role }).returning();
    res.status(201).json(safe(user));
  } catch (e: any) {
    if (e.message?.includes("unique")) { res.status(409).json({ error: "Email déjà utilisé" }); return; }
    throw e;
  }
});

router.put("/users/:id", requireAuth, requireRole(ROLES.SUPER_ADMIN), async (req, res): Promise<void> => {
  const { id } = req.params;
  const { email, name, role, password } = req.body;
  if (role && !Object.values(ROLES).includes(role)) { res.status(400).json({ error: "Rôle invalide" }); return; }
  const updates: any = {};
  if (email) updates.email = email;
  if (name !== undefined) updates.name = name;
  if (role) updates.role = role;
  if (password) updates.password = password;
  const [updated] = await db.update(usersTable).set(updates).where(eq(usersTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Utilisateur non trouvé" }); return; }
  res.json(safe(updated));
});

router.delete("/users/:id", requireAuth, requireRole(ROLES.SUPER_ADMIN), async (req, res): Promise<void> => {
  const { id } = req.params;
  // Prevent deleting yourself
  if (req.currentUser?.id === id) { res.status(400).json({ error: "Impossible de supprimer votre propre compte" }); return; }
  const [deleted] = await db.delete(usersTable).where(eq(usersTable.id, id)).returning();
  if (!deleted) { res.status(404).json({ error: "Utilisateur non trouvé" }); return; }
  res.json({ success: true });
});

export default router;
