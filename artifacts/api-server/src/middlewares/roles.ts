import type { Request, Response, NextFunction } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

declare global {
  namespace Express {
    interface Request {
      currentUser?: { id: string; email: string; role: string; name: string | null };
    }
  }
}

export const ROLES = {
  SUPER_ADMIN:          "SUPER_ADMIN",
  ADMIN:                "ADMIN",
  DG:                   "DG",
  DGA:                  "DGA",
  HR_MANAGER:           "HR_MANAGER",
  ACCOUNTANT:           "ACCOUNTANT",
  LOGISTICS_MANAGER:    "LOGISTICS_MANAGER",
  COMMERCIAL:           "COMMERCIAL",
  BUSINESS_DEVELOPER:   "BUSINESS_DEVELOPER",
  DSI:                  "DSI",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export async function loadUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  const userId = req.session?.userId;
  if (!userId) { res.status(401).json({ error: "Non authentifié" }); return; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(401).json({ error: "Utilisateur introuvable" }); return; }
  req.currentUser = { id: user.id, email: user.email, role: user.role, name: user.name ?? null };
  next();
}

export function requireRole(...roles: string[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.session?.userId;
    if (!userId) { res.status(401).json({ error: "Non authentifié" }); return; }

    if (!req.currentUser) {
      const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
      if (!user) { res.status(401).json({ error: "Utilisateur introuvable" }); return; }
      req.currentUser = { id: user.id, email: user.email, role: user.role, name: user.name ?? null };
    }

    if (!roles.includes(req.currentUser.role)) {
      res.status(403).json({ error: "Accès refusé — rôle insuffisant", requiredRoles: roles, currentRole: req.currentUser.role });
      return;
    }
    next();
  };
}
