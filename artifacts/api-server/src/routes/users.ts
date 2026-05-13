import { Router, type IRouter } from "express";
import { db, usersTable, loginHistoryTable, userPermissionsTable, employeesTable } from "@workspace/db";
import { eq, sql, desc, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { requireRole, ROLES } from "../middlewares/roles";

const router: IRouter = Router();

const ADMIN_ROLES = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DG];

const ERP_MODULES = [
  "achats", "fournisseurs", "lots", "stock",
  "paiements", "comptabilite", "rh", "crm", "operations", "logistique",
];

const ROLE_DEFAULT_PERMISSIONS: Record<string, Record<string, boolean[]>> = {
  SUPER_ADMIN:       { "*": [true, true, true, true, true] },
  ADMIN:             { "*": [true, true, true, true, true] },
  DG:                { "*": [true, false, false, false, true] },
  DGA:               { "*": [true, false, false, false, true] },
  ACCOUNTANT:        { comptabilite: [true, true, true, false, true], paiements: [true, true, true, false, true] },
  HR_MANAGER:        { rh: [true, true, true, true, true] },
  LOGISTICS_MANAGER: { lots: [true, true, true, false, true], achats: [true, true, true, false, true], fournisseurs: [true, true, true, false, true], stock: [true, true, true, false, true], logistique: [true, true, true, false, true] },
  COMMERCIAL:        { crm: [true, true, true, false, true] },
  BUSINESS_DEVELOPER:{ crm: [true, true, false, false, true] },
  DSI:               { "*": [true, false, false, false, false] },
};

function safe(u: any) {
  return {
    id: u.id, email: u.email, name: u.name ?? null,
    role: u.role, department: u.department ?? null,
    isActive: u.isActive ?? u.is_active ?? true,
    status: u.status ?? "active",
    employeeId: u.employeeId ?? u.employee_id ?? null,
    lastLoginAt: u.lastLoginAt ?? u.last_login_at ?? null,
    failedAttempts: u.failedAttempts ?? u.failed_attempts ?? 0,
    lockedAt: u.lockedAt ?? u.locked_at ?? null,
    createdAt: u.createdAt instanceof Date ? u.createdAt.toISOString() : (u.createdAt ?? null),
  };
}

// ─── GET /users ───────────────────────────────────────────────────────────────
router.get("/users", requireAuth, requireRole(...ADMIN_ROLES, ROLES.HR_MANAGER), async (req, res): Promise<void> => {
  const rows = await db.execute(sql`
    SELECT
      u.id, u.email, u.name, u.role, u.department, u.is_active,
      u.status, u.employee_id, u.last_login_at, u.failed_attempts,
      u.locked_at, u.created_at,
      e.name AS employee_name, e.position AS employee_position,
      e.department AS employee_department,
      (SELECT COUNT(*)::int FROM login_history lh WHERE lh.user_id = u.id AND lh.created_at > NOW() - INTERVAL '24 hours' AND lh.success = true) AS logins_today
    FROM users u
    LEFT JOIN employees e ON e.id = u.employee_id
    ORDER BY u.created_at DESC
  `);

  res.json(rows.rows.map((u: any) => ({
    ...safe({ ...u, isActive: u.is_active, employeeId: u.employee_id, lastLoginAt: u.last_login_at, failedAttempts: u.failed_attempts, lockedAt: u.locked_at, createdAt: u.created_at }),
    employeeName: u.employee_name ?? null,
    employeePosition: u.employee_position ?? null,
    employeeDepartment: u.employee_department ?? null,
    loginsToday: u.logins_today ?? 0,
  })));
});

// ─── GET /users/kpis ─────────────────────────────────────────────────────────
router.get("/users/kpis", requireAuth, requireRole(...ADMIN_ROLES, ROLES.HR_MANAGER), async (_req, res): Promise<void> => {
  const [kpi] = (await db.execute(sql`
    SELECT
      (SELECT COUNT(*) FROM users WHERE is_active = true AND status = 'active') AS active_users,
      (SELECT COUNT(*) FROM users) AS total_users,
      (SELECT COUNT(*) FROM users WHERE status = 'locked') AS locked_accounts,
      (SELECT COUNT(*) FROM login_history WHERE created_at > NOW() - INTERVAL '24 hours') AS logins_24h,
      (SELECT COUNT(*) FROM login_history WHERE created_at > NOW() - INTERVAL '24 hours' AND success = false) AS failed_24h,
      (SELECT COUNT(*) FROM login_history WHERE created_at > NOW() - INTERVAL '7 days' AND success = true) AS logins_7d
  `)).rows as any[];

  res.json({
    activeUsers: Number(kpi.active_users),
    totalUsers: Number(kpi.total_users),
    lockedAccounts: Number(kpi.locked_accounts),
    logins24h: Number(kpi.logins_24h),
    failed24h: Number(kpi.failed_24h),
    logins7d: Number(kpi.logins_7d),
  });
});

// ─── GET /users/:id/login-history ─────────────────────────────────────────────
router.get("/users/:id/login-history", requireAuth, requireRole(...ADMIN_ROLES, ROLES.HR_MANAGER), async (req, res): Promise<void> => {
  const history = await db
    .select()
    .from(loginHistoryTable)
    .where(eq(loginHistoryTable.userId, req.params.id))
    .orderBy(desc(loginHistoryTable.createdAt))
    .limit(20);

  res.json(history.map(h => ({
    id: h.id, ip: h.ip, userAgent: h.userAgent, success: h.success,
    createdAt: h.createdAt.toISOString(),
  })));
});

// ─── GET /users/:id/permissions ───────────────────────────────────────────────
router.get("/users/:id/permissions", requireAuth, requireRole(...ADMIN_ROLES, ROLES.HR_MANAGER), async (req, res): Promise<void> => {
  const perms = await db
    .select()
    .from(userPermissionsTable)
    .where(eq(userPermissionsTable.userId, req.params.id));

  res.json(perms.map(p => ({
    module: p.module, canView: p.canView, canCreate: p.canCreate,
    canEdit: p.canEdit, canDelete: p.canDelete, canExport: p.canExport,
  })));
});

// ─── PUT /users/:id/permissions ───────────────────────────────────────────────
router.put("/users/:id/permissions", requireAuth, requireRole(...ADMIN_ROLES), async (req, res): Promise<void> => {
  const { id } = req.params;
  const permissions: Array<{ module: string; canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean; canExport: boolean }> = req.body.permissions ?? [];

  for (const p of permissions) {
    await db.execute(sql`
      INSERT INTO user_permissions (id, user_id, module, can_view, can_create, can_edit, can_delete, can_export)
      VALUES (gen_random_uuid()::text, ${id}, ${p.module}, ${p.canView}, ${p.canCreate}, ${p.canEdit}, ${p.canDelete}, ${p.canExport})
      ON CONFLICT (user_id, module) DO UPDATE SET
        can_view = EXCLUDED.can_view, can_create = EXCLUDED.can_create,
        can_edit = EXCLUDED.can_edit, can_delete = EXCLUDED.can_delete,
        can_export = EXCLUDED.can_export
    `);
  }

  res.json({ success: true });
});

// ─── PUT /users/:id/status ────────────────────────────────────────────────────
router.put("/users/:id/status", requireAuth, requireRole(...ADMIN_ROLES, ROLES.HR_MANAGER), async (req, res): Promise<void> => {
  const { id } = req.params;
  const { action } = req.body; // activate | deactivate | lock | unlock

  if (!["activate", "deactivate", "lock", "unlock"].includes(action)) {
    res.status(400).json({ error: "Action invalide" });
    return;
  }

  if (req.currentUser?.id === id && action === "deactivate") {
    res.status(400).json({ error: "Impossible de désactiver votre propre compte" });
    return;
  }

  const updates: any = {};
  if (action === "activate")   { updates.isActive = true;  updates.status = "active"; updates.failedAttempts = 0; updates.lockedAt = null; }
  if (action === "deactivate") { updates.isActive = false; updates.status = "inactive"; }
  if (action === "lock")       { updates.status = "locked"; updates.lockedAt = new Date(); }
  if (action === "unlock")     { updates.status = "active"; updates.failedAttempts = 0; updates.lockedAt = null; }

  const [updated] = await db.update(usersTable).set(updates).where(eq(usersTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Utilisateur introuvable" }); return; }

  req.log.info({ userId: id, action, by: req.currentUser?.email }, "User status changed");
  res.json(safe(updated));
});

// ─── POST /users ──────────────────────────────────────────────────────────────
router.post("/users", requireAuth, requireRole(...ADMIN_ROLES, ROLES.HR_MANAGER), async (req, res): Promise<void> => {
  const { email, password, name, role, department, employeeId } = req.body;
  if (!email || !password || !role) {
    res.status(400).json({ error: "email, password et role sont requis" });
    return;
  }
  const validRoles = Object.values(ROLES);
  if (!validRoles.includes(role)) {
    res.status(400).json({ error: `Rôle invalide. Valeurs acceptées: ${validRoles.join(", ")}` });
    return;
  }

  let resolvedDepartment = department ?? null;
  if (employeeId) {
    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, employeeId));
    if (emp) resolvedDepartment = resolvedDepartment ?? emp.department ?? null;
  }

  try {
    const [user] = await db.insert(usersTable).values({
      email, password, name: name || null, role, department: resolvedDepartment, employeeId: employeeId || null,
    }).returning();

    // Seed default permissions for this role
    const defaults = ROLE_DEFAULT_PERMISSIONS[role] ?? {};
    const isWildcard = !!defaults["*"];
    const permsToInsert = ERP_MODULES.map(module => {
      const def = isWildcard ? defaults["*"] : (defaults[module] ?? [false, false, false, false, false]);
      return {
        userId: user.id, module,
        canView: def[0] ?? false, canCreate: def[1] ?? false,
        canEdit: def[2] ?? false, canDelete: def[3] ?? false, canExport: def[4] ?? false,
      };
    });
    if (permsToInsert.length > 0) {
      await db.insert(userPermissionsTable).values(permsToInsert);
    }

    req.log.info({ userId: user.id, email, role }, "User created");
    res.status(201).json(safe(user));
  } catch (e: any) {
    if (e.message?.includes("unique") || e.message?.includes("duplicate")) {
      res.status(409).json({ error: "Cet email est déjà utilisé" });
      return;
    }
    throw e;
  }
});

// ─── PUT /users/:id ───────────────────────────────────────────────────────────
router.put("/users/:id", requireAuth, requireRole(...ADMIN_ROLES, ROLES.HR_MANAGER), async (req, res): Promise<void> => {
  const { id } = req.params;
  const { email, name, role, password, department, employeeId } = req.body;

  if (role && !Object.values(ROLES).includes(role)) {
    res.status(400).json({ error: "Rôle invalide" });
    return;
  }

  const updates: any = {};
  if (email !== undefined)      updates.email = email;
  if (name !== undefined)       updates.name = name;
  if (role !== undefined)       updates.role = role;
  if (password)                 updates.password = password;
  if (department !== undefined) updates.department = department;
  if (employeeId !== undefined) updates.employeeId = employeeId || null;

  if (employeeId && !department) {
    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, employeeId));
    if (emp?.department) updates.department = emp.department;
  }

  const [updated] = await db.update(usersTable).set(updates).where(eq(usersTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Utilisateur non trouvé" }); return; }

  req.log.info({ userId: id, by: req.currentUser?.email }, "User updated");
  res.json(safe(updated));
});

// ─── DELETE /users/:id ────────────────────────────────────────────────────────
router.delete("/users/:id", requireAuth, requireRole(...ADMIN_ROLES, ROLES.HR_MANAGER), async (req, res): Promise<void> => {
  const { id } = req.params;
  const { reason } = req.body ?? {};

  if (req.currentUser?.id === id) {
    res.status(400).json({ error: "Impossible de supprimer votre propre compte" });
    return;
  }

  if (!reason?.trim()) {
    res.status(400).json({ error: "Une raison de suppression est obligatoire" });
    return;
  }

  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!target) { res.status(404).json({ error: "Utilisateur non trouvé" }); return; }

  // Block if last SUPER_ADMIN
  if (target.role === "SUPER_ADMIN") {
    const adminCount = (await db.execute(sql`SELECT COUNT(*) AS n FROM users WHERE role = 'SUPER_ADMIN' AND is_active = true`)).rows[0] as any;
    if (Number(adminCount.n) <= 1) {
      res.status(409).json({ error: "Impossible de supprimer le dernier Super Administrateur actif" });
      return;
    }
  }

  try {
    await db.delete(usersTable).where(eq(usersTable.id, id));
  } catch (err: any) {
    res.status(500).json({ error: `Suppression échouée : ${err?.message ?? "erreur base de données"}` });
    return;
  }

  req.log.info({ deletedUserId: id, deletedEmail: target.email, reason, by: req.currentUser?.email }, "User deleted");
  res.json({ success: true, deletedEmail: target.email });
});

export { ERP_MODULES };
export default router;
