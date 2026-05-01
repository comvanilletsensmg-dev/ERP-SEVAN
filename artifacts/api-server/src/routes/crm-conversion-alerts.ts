import { Router, type IRouter } from "express";
import { db, conversionAlertsTable, prospectsTable, clientsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { requireRole } from "../middlewares/roles";
import { autoConvertProspect } from "../services/autoConvert";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const safe = (a: any) => ({
  ...a,
  createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt,
  resolvedAt: a.resolvedAt instanceof Date ? a.resolvedAt.toISOString() : a.resolvedAt,
});

// GET /api/crm/conversion-alerts — list (with optional status filter)
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

    // Enrich with prospect info
    const enriched = await Promise.all(alerts.map(async a => {
      const [prospect] = await db.select({
        id: prospectsTable.id, status: prospectsTable.status,
        score: prospectsTable.score, company: prospectsTable.company,
      }).from(prospectsTable).where(eq(prospectsTable.id, a.prospectId));

      let client = null;
      if (a.resolvedClientId) {
        const [c] = await db.select({ id: clientsTable.id, clientCode: clientsTable.clientCode, name: clientsTable.name })
          .from(clientsTable).where(eq(clientsTable.id, a.resolvedClientId));
        client = c ?? null;
      }
      return safe({ ...a, prospect: prospect ?? null, client });
    }));

    res.json(enriched);
  } catch (e) {
    logger.error(e, "GET /crm/conversion-alerts error");
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /api/crm/conversion-alerts/count — pending count for badge
router.get("/crm/conversion-alerts/count", requireAuth, requireRole("SUPER_ADMIN", "COMMERCIAL"), async (_req, res): Promise<void> => {
  try {
    const alerts = await db.select().from(conversionAlertsTable).where(eq(conversionAlertsTable.status, "pending"));
    res.json({ pending: alerts.length });
  } catch (e) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/crm/conversion-alerts/:id/convert — admin manually converts the prospect
router.post("/crm/conversion-alerts/:id/convert", requireAuth, requireRole("SUPER_ADMIN", "COMMERCIAL"), async (req, res): Promise<void> => {
  try {
    const [alert] = await db.select().from(conversionAlertsTable).where(eq(conversionAlertsTable.id, req.params.id));
    if (!alert) { res.status(404).json({ error: "Alerte introuvable" }); return; }
    if (alert.status !== "pending" && alert.status !== "escalated") {
      res.status(409).json({ error: `Alerte déjà résolue (${alert.status})` }); return;
    }

    const result = await autoConvertProspect(
      alert.prospectId, alert.triggerType as "deal" | "quote",
      alert.triggerId ?? "manual", (req as any).session?.userId
    );

    // Force-convert even if score < 60 if admin explicitly converts
    if (result.action === "alert_created") {
      // Retry with force
      const { prospectsTable: pT, clientsTable: cT, clientContactsTable } = await import("@workspace/db");
      const [prospect] = await db.select().from(pT).where(eq(pT.id, alert.prospectId));
      if (!prospect) { res.status(404).json({ error: "Prospect introuvable" }); return; }

      const { sql } = await import("drizzle-orm");
      const year = new Date().getFullYear();
      const prefix = `CLI-${year}-`;
      const r2 = await db.execute(sql`SELECT client_code FROM clients WHERE client_code LIKE ${prefix + "%"} ORDER BY client_code DESC LIMIT 1`);
      const rows = r2.rows as any[];
      const n = rows.length ? parseInt((rows[0].client_code as string).split("-")[2] ?? "0") + 1 : 1;
      const clientCode = `${prefix}${String(n).padStart(4, "0")}`;

      const [client] = await db.insert(cT).values({
        name: prospect.company, altName: prospect.altName ?? null, type: prospect.type ?? "Entreprise",
        clientCode, address: prospect.address ?? null, postalCode: prospect.postalCode ?? null,
        city: prospect.city ?? null, country: prospect.country, region: prospect.region ?? null,
        phone: prospect.phone ?? null, mobile: prospect.mobile ?? null, fax: prospect.fax ?? null,
        website: prospect.website ?? null, email: prospect.email ?? null,
        refuseMassEmail: prospect.refuseMassEmail ?? false,
        proId1: prospect.proId1 ?? null, proId2: prospect.proId2 ?? null,
        vatRegistered: prospect.vatRegistered ?? false, vatNumber: prospect.vatNumber ?? null,
        source: "converted_prospect", convertedFromId: prospect.id, tags: prospect.tags ?? "[]",
        internalNotes: `[Converti manuellement depuis alerte #${alert.id}]\n${prospect.internalNotes ?? ""}`,
        activityType: prospect.activityType ?? null, riskLevel: "medium", paymentTerms: 30,
        currency: prospect.preferredCurrency ?? "USD", preferredIncoterm: prospect.preferredIncoterm ?? null,
        createdBy: (req as any).session?.userId ?? null, assignedTo: prospect.assignedTo ?? null,
      }).returning();

      if (prospect.contact) {
        const parts = prospect.contact.trim().split(" ");
        await db.insert(clientContactsTable).values({
          clientId: client.id, firstName: parts[0] ?? prospect.contact,
          lastName: parts.slice(1).join(" ") || "-",
          email: prospect.email ?? null, phone: prospect.phone ?? null, mobile: prospect.mobile ?? null, isPrimary: true,
        });
      }

      await db.update(pT).set({ status: "converted", convertedToClientId: client.id, updatedAt: new Date() }).where(eq(pT.id, prospect.id));
      await db.update(conversionAlertsTable).set({
        status: "converted", resolvedClientId: client.id,
        resolvedBy: (req as any).session?.userId ?? "admin",
        resolvedAt: new Date(),
      }).where(eq(conversionAlertsTable.id, alert.id));

      logger.info({ alertId: alert.id, clientId: client.id, clientCode }, "Alert manually resolved by admin");
      res.json({ success: true, action: "converted", clientId: client.id, clientCode, clientName: client.name });
      return;
    }

    // Already converted or just now converted
    await db.update(conversionAlertsTable).set({
      status: "converted",
      resolvedClientId: result.clientId ?? null,
      resolvedBy: (req as any).session?.userId ?? "system",
      resolvedAt: new Date(),
    }).where(eq(conversionAlertsTable.id, alert.id));

    res.json({ success: true, ...result });
  } catch (e) {
    logger.error(e, "POST /crm/conversion-alerts/:id/convert error");
    res.status(500).json({ error: "Erreur conversion" });
  }
});

// PATCH /api/crm/conversion-alerts/:id/dismiss — dismiss an alert
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

// PATCH /api/crm/conversion-alerts/:id/escalate — escalate to super admin
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

export default router;
