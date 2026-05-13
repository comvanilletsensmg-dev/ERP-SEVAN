import { Router, type IRouter } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { db, clientsTable, clientContactsTable, prospectsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { requireRole } from "../middlewares/roles";
import { logger } from "../lib/logger";
import { convertProspectToClient } from "../services/autoConvert";

const router: IRouter = Router();
const ROLES = ["SUPER_ADMIN", "COMMERCIAL", "ACCOUNTANT", "LOGISTICS_MANAGER"] as const;
const WRITE = ["SUPER_ADMIN", "COMMERCIAL"] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const safe = (c: any) => ({
  ...c,
  createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
  updatedAt: c.updatedAt instanceof Date ? c.updatedAt.toISOString() : c.updatedAt,
  lastOrderDate: c.lastOrderDate instanceof Date ? c.lastOrderDate.toISOString() : c.lastOrderDate,
});

async function generateClientCode(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `CLI-${year}-`;
  const result = await db.execute(
    sql`SELECT client_code FROM clients WHERE client_code LIKE ${prefix + "%"} ORDER BY client_code DESC LIMIT 1`
  );
  const rows = result.rows as any[];
  if (!rows.length) return `${prefix}0001`;
  const last = rows[0].client_code as string;
  const n = parseInt(last.split("-")[2] ?? "0") + 1;
  return `${prefix}${String(n).padStart(4, "0")}`;
}

// ─── GET /crm/clients ─────────────────────────────────────────────────────────
router.get("/crm/clients", requireAuth, requireRole(...ROLES), async (req, res): Promise<void> => {
  try {
    const { search, riskLevel, isActive, country } = req.query as Record<string, string>;
    let query = db.select().from(clientsTable);
    const clients = await query.orderBy(desc(clientsTable.createdAt));
    let result = clients;
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(c =>
        c.name.toLowerCase().includes(s) ||
        (c.clientCode ?? "").toLowerCase().includes(s) ||
        (c.email ?? "").toLowerCase().includes(s) ||
        (c.city ?? "").toLowerCase().includes(s)
      );
    }
    if (riskLevel) result = result.filter(c => c.riskLevel === riskLevel);
    if (isActive !== undefined) result = result.filter(c => c.isActive === (isActive === "true"));
    if (country) result = result.filter(c => c.country === country);
    res.json(result.map(safe));
  } catch (e) {
    logger.error(e, "GET /crm/clients error");
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── POST /crm/clients ────────────────────────────────────────────────────────
router.post("/crm/clients", requireAuth, requireRole(...WRITE), async (req, res): Promise<void> => {
  try {
    const b = req.body;
    if (!b.name || !b.country) { res.status(400).json({ error: "Nom et pays requis" }); return; }
    const clientCode = await generateClientCode();
    const [client] = await db.insert(clientsTable).values({
      name: b.name, altName: b.altName ?? null, type: b.type ?? "Entreprise",
      clientCode,
      address: b.address ?? null, postalCode: b.postalCode ?? null,
      city: b.city ?? null, country: b.country, region: b.region ?? null,
      phone: b.phone ?? null, mobile: b.mobile ?? null, fax: b.fax ?? null,
      website: b.website ?? null, email: b.email ?? null,
      refuseMassEmail: Boolean(b.refuseMassEmail),
      proId1: b.proId1 ?? null, proId2: b.proId2 ?? null,
      vatRegistered: Boolean(b.vatRegistered), vatNumber: b.vatNumber ?? null,
      source: b.source ?? "other",
      tags: JSON.stringify(Array.isArray(b.tags) ? b.tags : []),
      internalNotes: b.internalNotes ?? null,
      activityType: b.activityType ?? null,
      riskLevel: b.riskLevel ?? "medium",
      creditLimit: b.creditLimit != null ? Number(b.creditLimit) : null,
      paymentTerms: b.paymentTerms != null ? Number(b.paymentTerms) : 30,
      currency: b.currency ?? "USD",
      preferredIncoterm: b.preferredIncoterm ?? null,
      createdBy: (req as any).session?.userId ?? null,
      assignedTo: b.assignedTo ?? null,
    }).returning();

    // Create primary contact if provided
    if (b.primaryContact?.firstName && b.primaryContact?.lastName) {
      await db.insert(clientContactsTable).values({
        clientId: client.id,
        firstName: b.primaryContact.firstName,
        lastName: b.primaryContact.lastName,
        role: b.primaryContact.role ?? null,
        email: b.primaryContact.email ?? null,
        phone: b.primaryContact.phone ?? null,
        mobile: b.primaryContact.mobile ?? null,
        isPrimary: true,
      });
    }

    res.status(201).json(safe(client));
  } catch (e) {
    logger.error(e, "POST /crm/clients error");
    res.status(500).json({ error: "Erreur création client" });
  }
});

// ─── GET /crm/clients/:id ─────────────────────────────────────────────────────
router.get("/crm/clients/:id", requireAuth, requireRole(...ROLES), async (req, res): Promise<void> => {
  try {
    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, String(req.params.id)));
    if (!client) { res.status(404).json({ error: "Client introuvable" }); return; }
    const contacts = await db.select().from(clientContactsTable)
      .where(eq(clientContactsTable.clientId, client.id))
      .orderBy(desc(clientContactsTable.isPrimary));
    res.json({ ...safe(client), contacts: contacts.map(c => ({ ...c, createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt })) });
  } catch (e) {
    logger.error(e, "GET /crm/clients/:id error");
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── PUT /crm/clients/:id ─────────────────────────────────────────────────────
router.put("/crm/clients/:id", requireAuth, requireRole(...WRITE), async (req, res): Promise<void> => {
  try {
    const b = req.body;
    const [updated] = await db.update(clientsTable).set({
      name: b.name, altName: b.altName ?? null, type: b.type,
      address: b.address ?? null, postalCode: b.postalCode ?? null,
      city: b.city ?? null, country: b.country, region: b.region ?? null,
      phone: b.phone ?? null, mobile: b.mobile ?? null, fax: b.fax ?? null,
      website: b.website ?? null, email: b.email ?? null,
      refuseMassEmail: Boolean(b.refuseMassEmail),
      proId1: b.proId1 ?? null, proId2: b.proId2 ?? null,
      vatRegistered: Boolean(b.vatRegistered), vatNumber: b.vatNumber ?? null,
      source: b.source,
      tags: JSON.stringify(Array.isArray(b.tags) ? b.tags : []),
      internalNotes: b.internalNotes ?? null,
      activityType: b.activityType ?? null,
      riskLevel: b.riskLevel, creditLimit: b.creditLimit != null ? Number(b.creditLimit) : null,
      paymentTerms: b.paymentTerms != null ? Number(b.paymentTerms) : undefined,
      currency: b.currency, preferredIncoterm: b.preferredIncoterm ?? null,
      isActive: b.isActive !== undefined ? Boolean(b.isActive) : undefined,
      assignedTo: b.assignedTo ?? null,
      updatedAt: new Date(),
    }).where(eq(clientsTable.id, String(req.params.id))).returning();
    if (!updated) { res.status(404).json({ error: "Client introuvable" }); return; }
    res.json(safe(updated));
  } catch (e) {
    logger.error(e, "PUT /crm/clients/:id error");
    res.status(500).json({ error: "Erreur mise à jour" });
  }
});

// ─── DELETE /crm/clients/:id (soft delete) ────────────────────────────────────
router.delete("/crm/clients/:id", requireAuth, requireRole("SUPER_ADMIN"), async (req, res): Promise<void> => {
  try {
    const [updated] = await db.update(clientsTable).set({ isActive: false, updatedAt: new Date() })
      .where(eq(clientsTable.id, String(req.params.id))).returning();
    if (!updated) { res.status(404).json({ error: "Client introuvable" }); return; }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Erreur suppression" });
  }
});

// ─── GET /crm/clients/:id/stats ───────────────────────────────────────────────
router.get("/crm/clients/:id/stats", requireAuth, requireRole(...ROLES), async (req, res): Promise<void> => {
  try {
    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, String(req.params.id)));
    if (!client) { res.status(404).json({ error: "Client introuvable" }); return; }
    res.json({
      totalOrders: client.totalOrders,
      totalRevenue: client.totalRevenue,
      averageOrderValue: client.averageOrderValue,
      lastOrderDate: client.lastOrderDate instanceof Date ? client.lastOrderDate.toISOString() : client.lastOrderDate,
      creditLimit: client.creditLimit,
      paymentTerms: client.paymentTerms,
      riskLevel: client.riskLevel,
    });
  } catch (e) {
    res.status(500).json({ error: "Erreur stats" });
  }
});

// ─── CONTACTS ─────────────────────────────────────────────────────────────────
router.post("/crm/clients/:id/contacts", requireAuth, requireRole(...WRITE), async (req, res): Promise<void> => {
  try {
    const b = req.body;
    if (!b.firstName || !b.lastName) { res.status(400).json({ error: "Prénom et nom requis" }); return; }
    if (b.isPrimary) {
      await db.update(clientContactsTable).set({ isPrimary: false }).where(eq(clientContactsTable.clientId, String(req.params.id)));
    }
    const [contact] = await db.insert(clientContactsTable).values({
      clientId: String(req.params.id),
      firstName: b.firstName, lastName: b.lastName,
      role: b.role ?? null, email: b.email ?? null,
      phone: b.phone ?? null, mobile: b.mobile ?? null,
      isPrimary: Boolean(b.isPrimary),
    }).returning();
    res.status(201).json(contact);
  } catch (e) {
    res.status(500).json({ error: "Erreur ajout contact" });
  }
});

router.put("/crm/clients/:id/contacts/:cid", requireAuth, requireRole(...WRITE), async (req, res): Promise<void> => {
  try {
    const b = req.body;
    if (b.isPrimary) {
      await db.update(clientContactsTable).set({ isPrimary: false }).where(eq(clientContactsTable.clientId, String(req.params.id)));
    }
    const [updated] = await db.update(clientContactsTable).set({
      firstName: b.firstName, lastName: b.lastName, role: b.role ?? null,
      email: b.email ?? null, phone: b.phone ?? null, mobile: b.mobile ?? null,
      isPrimary: Boolean(b.isPrimary), isActive: b.isActive !== undefined ? Boolean(b.isActive) : undefined,
    }).where(eq(clientContactsTable.id, String(req.params.cid))).returning();
    if (!updated) { res.status(404).json({ error: "Contact introuvable" }); return; }
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: "Erreur mise à jour contact" });
  }
});

router.delete("/crm/clients/:id/contacts/:cid", requireAuth, requireRole(...WRITE), async (req, res): Promise<void> => {
  try {
    await db.update(clientContactsTable).set({ isActive: false })
      .where(eq(clientContactsTable.id, String(req.params.cid)));
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Erreur suppression contact" });
  }
});

// ─── CONVERSION prospect → client ────────────────────────────────────────────
router.put("/crm/prospects/:id/convert", requireAuth, requireRole("SUPER_ADMIN", "COMMERCIAL"), async (req, res): Promise<void> => {
  try {
    const userId = (req as any).session?.userId;
    const skipValidation = req.body?.force === true;
    const result = await convertProspectToClient(String(req.params.id), {
      source: "manual",
      triggeredBy: userId,
      skipValidation,
    });

    if (result.action === "skipped") {
      res.status(404).json({ error: result.reason });
    } else if (result.action === "alert_created") {
      res.status(422).json({
        error: result.reason,
        score: result.score,
        status: "non_qualifié",
      });
    } else if (result.action === "already_converted") {
      res.status(409).json({
        error: "Prospect déjà converti",
        clientId: result.clientId,
        clientCode: result.clientCode,
        clientName: result.clientName,
      });
    } else {
      res.json({
        success: true,
        clientId: result.clientId,
        clientCode: result.clientCode,
        clientName: result.clientName,
        migrationSummary: result.migrationSummary,
        message: `Prospect converti en client ${result.clientCode}`,
        nextSteps: ["Créer un devis", "Planifier appel onboarding", "Définir limite de crédit"],
      });
    }
  } catch (e) {
    logger.error(e, "PUT /crm/prospects/:id/convert error");
    res.status(500).json({ error: "Erreur lors de la conversion" });
  }
});

export default router;
