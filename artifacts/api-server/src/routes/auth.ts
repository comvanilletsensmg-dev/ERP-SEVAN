import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { LoginBody } from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.post("/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email, password } = parsed.data;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));

  if (!user || user.password !== password) {
    res.status(401).json({ error: "Email ou mot de passe incorrect" });
    return;
  }

  req.session!.userId = user.id;
  req.log.info({ userId: user.id }, "User logged in");

  res.json({
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
    },
  });
});

router.post("/logout", async (req, res): Promise<void> => {
  req.session!.userId = undefined;
  res.json({ success: true });
});

router.get("/me", async (req, res): Promise<void> => {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: "Non authentifié" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(401).json({ error: "Utilisateur introuvable" });
    return;
  }

  res.json({
    id: user.id,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  });
});

export default router;
