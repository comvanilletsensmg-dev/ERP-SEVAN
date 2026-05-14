import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, loginHistoryTable } from "@workspace/db";
import { LoginBody } from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const MAX_FAILED = 5;

async function recordLogin(userId: string, ip: string | undefined, ua: string | undefined, success: boolean) {
  try { await db.insert(loginHistoryTable).values({ userId, ip: ip ?? null, userAgent: ua ?? null, success }); }
  catch { /* non-blocking */ }
}

router.post("/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { email, password } = parsed.data;
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? req.socket?.remoteAddress ?? undefined;
  const ua = req.headers["user-agent"] ?? undefined;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));

  if (!user || user.password !== password) {
    if (user) {
      const newFailed = (user.failedAttempts ?? 0) + 1;
      const shouldLock = newFailed >= MAX_FAILED;
      await db.update(usersTable).set({
        failedAttempts: newFailed,
        ...(shouldLock ? { status: "locked", lockedAt: new Date() } : {}),
      }).where(eq(usersTable.id, user.id));
      await recordLogin(user.id, ip, ua, false);
      if (shouldLock) {
        res.status(401).json({ error: "Compte bloqué après trop de tentatives. Contactez un administrateur." });
        return;
      }
    }
    res.status(401).json({ error: "Email ou mot de passe incorrect" });
    return;
  }

  if (!user.isActive || user.status === "inactive") {
    res.status(403).json({ error: "Compte désactivé. Contactez un administrateur." }); return;
  }
  if (user.status === "locked") {
    res.status(403).json({ error: "Compte bloqué. Contactez un administrateur." }); return;
  }

  await db.update(usersTable).set({ lastLoginAt: new Date(), failedAttempts: 0 }).where(eq(usersTable.id, user.id));
  await recordLogin(user.id, ip, ua, true);

  // If 2FA is enabled, put session in pending state
  if ((user as any).twoFactorEnabled && (user as any).twoFactorSecret) {
    (req.session as any).pending2faUserId = user.id;
    logger.info({ userId: user.id }, "2FA required for login");
    res.json({ requires2fa: true, method: (user as any).twoFactorMethod ?? "totp" });
    return;
  }

  req.session!.userId = user.id;
  logger.info({ userId: user.id }, "User logged in");

  res.json({ user: { id: user.id, email: user.email, name: user.name ?? null, role: user.role, createdAt: user.createdAt.toISOString() } });
});

router.post("/logout", async (req, res): Promise<void> => {
  req.session!.userId = undefined;
  res.json({ success: true });
});

router.get("/me", async (req, res): Promise<void> => {
  const userId = req.session?.userId;
  if (!userId) { res.status(401).json({ error: "Non authentifié" }); return; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(401).json({ error: "Utilisateur introuvable" }); return; }
  res.json({ id: user.id, email: user.email, name: user.name ?? null, role: user.role, createdAt: user.createdAt.toISOString() });
});

export default router;
