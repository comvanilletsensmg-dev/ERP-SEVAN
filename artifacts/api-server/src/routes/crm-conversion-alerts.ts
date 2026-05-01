import { Router, type IRouter } from "express";
import { db, conversionAlertsTable, conversionLogsTable, prospectsTable, clientsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { requireRole } from "../middlewares/roles";
import { convertProspectToClient } from "../services/autoConvert";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const safeAlert = (a: any) => ({
  ...a,
  createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt,
  resolvedAt: a.resolvedAt instanceof Date ? a.resolvedAt.toISOString() : a.resolvedAt,
});

// GET /api/crm/conversion-alerts
router.get("/crm/conversion-alerts", requireAuth, requireRole("SUPER_ADMIN", "COMMERCIAL"), async (req, res): Promise<void> => {
  try {
    const { status } = req.query as { status?: string };
    let alerts;
    if (status) {
      alerts = await db.select().from(conversionAlertsTable)
        .where(eq(conversionAlertsTable.status, status))
        .orderBy(desc(conversionAlertsTable.createdAt));
    } else {
      alerts = await db.select().from(conversionAlertsTable)
        .orderBy(desc(conversionAlertsTable.createdAt));
    }

    const enriched = await Promise.all(alerts.map(async a => {
      const [prospect] = await db.select({
        id: prospectsTable.id, status: prospectsTable.status,
        score: prospectsTable.score, company: prospectsTable.company,
      }).from(prospectsTable).where(eq(prospectsTable.id, a.prospectId));

      let client = null;
      if (a.resolvedClientId) {
        const [c] = await db.select({
          id: clientsTable.id, clientCode: clientsTable.clientCode, name: clientsTable.name,
        }).from(clientsTable).where(eq(clientsTable.id, a.resolvedClientId));
        client = c ?? null;
      }
      return safeAlert({ ...a, prospect: prospect ?? null, client });
    }));

    res.json(enriched);
  } catch (e) {
    logger.error(e, "GET /crm/conversion-alerts error");
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /api/crm/conversion-alerts/count
router.get("/crm/conversion-alerts/count", requireAuth, requireRole("SUPER_ADMIN", "COMMERCIAL"), async (_req, res): Promise<void> => {
  try {
    const alerts = await db.select().from(conversionAlertsTable).where(eq(conversionAlertsTable.status, "pending"));
    res.json({ pending: alerts.length });
  } catch (e) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/crm/conversion-alerts/:id/convert — force-convert (admin override)
router.post("/crm/conversion-alerts/:id/convert", requireAuth, requireRole("SUPER_ADMIN", "COMMERCIAL"), async (req, res): Promise<void> => {
  try {
    const [alert] = await db.select().from(conversionAlertsTable).where(eq(conversionAlertsTable.id, req.params.id));
    if (!alert) { res.status(404).json({ error: "Alerte introuvable" }); return; }
    if (alert.status !== "pending" && alert.status !== "escalated") {
      res.status(409).json({ error: `Alerte déjà résolue (${alert.status})` }); return;
    }

    const userId = (req as any).session?.userId;
    const result = await convertProspectToClient(alert.prospectId, {
      source: "manual",
      triggeredBy: userId,
      skipValidation: true,
    });

    if (result.action === "skipped") {
      res.status(404).json({ error: result.reason });
      return;
    }

    res.json({ success: true, ...result });
  } catch (e) {
    logger.error(e, "POST /crm/conversion-alerts/:id/convert error");
    res.status(500).json({ error: "Erreur conversion" });
  }
});

// PATCH /api/crm/conversion-alerts/:id/dismiss
router.patch("/crm/conversion-alerts/:id/dismiss", requireAuth, requireRole("SUPER_ADMIN"), async (req, res): Promise<void> => {
  try {
    const [updated] = await db.update(conversionAlertsTable).set({
      status: "dismissed",
      resolvedBy: (req as any).session?.userId ?? "admin",
      resolvedAt: new Date(),
    }).where(and(eq(conversionAlertsTable.id, req.params.id), eq(conversionAlertsTable.status, "pending")))
      .returning();
    if (!updated) { res.status(404).json({ error: "Alerte introuvable ou déjà résolue" }); return; }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Erreur suppression alerte" });
  }
});

// PATCH /api/crm/conversion-alerts/:id/escalate
router.patch("/crm/conversion-alerts/:id/escalate", requireAuth, requireRole("SUPER_ADMIN", "COMMERCIAL"), async (req, res): Promise<void> => {
  try {
    const [updated] = await db.update(conversionAlertsTable)
      .set({ status: "escalated" })
      .where(eq(conversionAlertsTable.id, req.params.id))
      .returning();
    if (!updated) { res.status(404).json({ error: "Alerte introuvable" }); return; }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Erreur escalade" });
  }
});

// ─── Conversion logs ──────────────────────────────────────────────────────────

// GET /api/crm/conversion-logs
router.get("/crm/conversion-logs", requireAuth, requireRole("SUPER_ADMIN", "COMMERCIAL"), async (req, res): Promise<void> => {
  try {
    const { prospectId, clientId, source } = req.query as Record<string, string | undefined>;

    let rows = await db.select().from(conversionLogsTable).orderBy(desc(conversionLogsTable.createdAt));

    // Client-side filter (small table)
    if (prospectId) rows = rows.filter(r => r.prospectId === prospectId);
    if (clientId) rows = rows.filter(r => r.clientId === clientId);
    if (source) rows = rows.filter(r => r.source === source);

    // Enrich with prospect and client names
    const enriched = await Promise.all(rows.map(async r => {
      const [prospect] = await db.select({ company: prospectsTable.company })
        .from(prospectsTable).where(eq(prospectsTable.id, r.prospectId));
      const [client] = await db.select({ name: clientsTable.name, clientCode: clientsTable.clientCode })
        .from(clientsTable).where(eq(clientsTable.id, r.clientId));
      return {
        ...r,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
        prospectName: prospect?.company ?? null,
        clientName: client?.name ?? null,
        clientCode: client?.clientCode ?? null,
      };
    }));

    res.json(enriched);
  } catch (e) {
    logger.error(e, "GET /crm/conversion-logs error");
    res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;
