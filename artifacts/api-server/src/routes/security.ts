import { Router, type IRouter } from "express";
import { db, usersTable, loginHistoryTable, rolePermissionsTable, userPermissionsTable } from "@workspace/db";
import { sql, count, eq, lt, gte, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { loadUser } from "../middlewares/roles";

const ADMIN_ROLES = ["SUPER_ADMIN", "ADMIN", "DG", "DGA"];
const router: IRouter = Router();

function requireAdmin(req: any, res: any, next: any) {
  if (!ADMIN_ROLES.includes(req.currentUser?.role)) {
    res.status(403).json({ error: "Accès réservé aux administrateurs" });
    return;
  }
  next();
}

// ─── Security Dashboard ──────────────────────────────────────────────────────
router.get("/admin/security", requireAuth, loadUser, requireAdmin, async (req, res): Promise<void> => {

  // All users
  const users = await db.select().from(usersTable);

  // Login history — all
  const loginHistory = await db.select().from(loginHistoryTable)
    .orderBy(desc(loginHistoryTable.createdAt)).limit(100);

  // Failed logins last 24h
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const failedRecent = loginHistory.filter(l => !l.success && l.createdAt >= since24h);

  // Suspicious IPs: 3+ failures in last 24h from same IP
  const ipFailCount: Record<string, number> = {};
  for (const l of failedRecent) {
    if (l.ip) ipFailCount[l.ip] = (ipFailCount[l.ip] ?? 0) + 1;
  }
  const suspiciousIps = Object.entries(ipFailCount)
    .filter(([, cnt]) => cnt >= 3)
    .map(([ip, cnt]) => ({ ip, count: cnt }));

  // Locked users
  const lockedUsers = users.filter(u => u.status === "locked" || u.lockedAt !== null);

  // Active sessions
  const sessionResult = await db.execute(sql`
    SELECT sess->>'userId' AS user_id, expire
    FROM user_sessions
    WHERE expire > NOW()
  `);
  const activeSessions = (sessionResult.rows as any[]).map(s => ({
    userId: s.user_id,
    expire: s.expire,
  }));
  const activeUserIds = [...new Set(activeSessions.map(s => s.userId))];

  // Security score
  let score = 100;
  score -= lockedUsers.length * 15;
  score -= users.filter(u => (u.failedAttempts ?? 0) >= 3).length * 5;
  score -= suspiciousIps.length * 10;
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const adminNoLogin = users.filter(u =>
    ["SUPER_ADMIN", "ADMIN"].includes(u.role) &&
    (!u.lastLoginAt || u.lastLoginAt < thirtyDaysAgo)
  );
  score -= adminNoLogin.length * 5;
  score = Math.max(score, 20);

  // User map for login history labels
  const userMap = new Map(users.map(u => [u.id, { name: u.name ?? u.email, email: u.email, role: u.role }]));

  // Role permissions
  const rolePerms = await db.select().from(rolePermissionsTable).orderBy(rolePermissionsTable.role, rolePermissionsTable.module);

  // Recent login history (last 30)
  const recentLogins = loginHistory.slice(0, 30).map(l => ({
    id: l.id,
    userId: l.userId,
    userName: userMap.get(l.userId)?.name ?? "Inconnu",
    userEmail: userMap.get(l.userId)?.email ?? l.userId,
    ip: l.ip,
    userAgent: l.userAgent,
    success: l.success,
    createdAt: l.createdAt.toISOString(),
  }));

  res.json({
    score,
    scoreLabel: score >= 80 ? "Sécurisé" : score >= 60 ? "Attention" : "Critique",
    // Users
    totalUsers: users.length,
    activeUsers: users.filter(u => u.isActive && u.status === "active").length,
    lockedUsers: lockedUsers.map(u => ({
      id: u.id, name: u.name ?? u.email, email: u.email, role: u.role,
      failedAttempts: u.failedAttempts, lockedAt: u.lockedAt?.toISOString() ?? null,
    })),
    usersWithFailedAttempts: users.filter(u => (u.failedAttempts ?? 0) > 0).map(u => ({
      id: u.id, name: u.name ?? u.email, email: u.email, role: u.role,
      failedAttempts: u.failedAttempts,
    })),
    // Sessions
    activeSessionCount: activeSessions.length,
    activeUserIds,
    // Login history
    recentLogins,
    failedLast24h: failedRecent.length,
    successLast24h: loginHistory.filter(l => l.success && l.createdAt >= since24h).length,
    // Threats
    suspiciousIps,
    adminNoRecentLogin: adminNoLogin.map(u => ({
      id: u.id, name: u.name ?? u.email, email: u.email, role: u.role,
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    })),
    // Permissions
    rolePermissions: rolePerms,
    // Full user status list
    allUsers: users.map(u => ({
      id: u.id, name: u.name ?? u.email, email: u.email, role: u.role,
      status: u.status, isActive: u.isActive,
      failedAttempts: u.failedAttempts ?? 0,
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      lockedAt: u.lockedAt?.toISOString() ?? null,
      isOnline: activeUserIds.includes(u.id),
    })),
  });
});

// ─── Unlock user ─────────────────────────────────────────────────────────────
router.post("/admin/security/unlock/:userId", requireAuth, loadUser, requireAdmin, async (req, res): Promise<void> => {
  const userId = String(req.params.userId);
  await db.update(usersTable)
    .set({ status: "active", failedAttempts: 0, lockedAt: null })
    .where(eq(usersTable.id, userId));
  req.log.info({ userId, by: req.currentUser?.id }, "User unlocked by admin");
  res.json({ success: true });
});

// ─── Revoke all sessions for a user ─────────────────────────────────────────
router.delete("/admin/security/sessions/:userId", requireAuth, loadUser, requireAdmin, async (req, res): Promise<void> => {
  const userId = String(req.params.userId);
  await db.execute(sql`DELETE FROM user_sessions WHERE sess->>'userId' = ${userId}`);
  req.log.info({ userId, by: req.currentUser?.id }, "Sessions revoked by admin");
  res.json({ success: true });
});

// ─── Get/update role permissions ─────────────────────────────────────────────
router.get("/admin/security/permissions", requireAuth, loadUser, requireAdmin, async (req, res): Promise<void> => {
  const perms = await db.select().from(rolePermissionsTable).orderBy(rolePermissionsTable.role, rolePermissionsTable.module);
  res.json(perms);
});

router.put("/admin/security/permissions/:id", requireAuth, loadUser, requireAdmin, async (req, res): Promise<void> => {
  const id = String(req.params.id);
  const { canView, canCreate, canEdit, canDelete, canExport } = req.body;
  await db.update(rolePermissionsTable)
    .set({ canView, canCreate, canEdit, canDelete, canExport, updatedAt: new Date() })
    .where(eq(rolePermissionsTable.id, id));
  req.log.info({ id, by: req.currentUser?.id }, "Role permission updated");
  res.json({ success: true });
});

export default router;
