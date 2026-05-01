/**
 * Auto-conversion engine: Prospect → Client
 * Called when a deal or quote is linked to a prospect.
 *
 * Rules:
 *  - Score ≥ 60 AND status IN (qualified, contacted) → silent convert
 *  - Otherwise → create a conversion_alert for admin review
 */
import { eq, sql } from "drizzle-orm";
import {
  db, prospectsTable, clientsTable, clientContactsTable, conversionAlertsTable, dealsTable,
} from "@workspace/db";
import { logger } from "../lib/logger";

export interface AutoConvertResult {
  action: "converted" | "alert_created" | "already_converted" | "skipped";
  clientId?: string;
  clientCode?: string;
  clientName?: string;
  alertId?: string;
  reason?: string;
  score?: number;
  prospectName?: string;
}

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

export async function autoConvertProspect(
  prospectId: string,
  triggerType: "deal" | "quote",
  triggerId: string,
  createdByUserId?: string
): Promise<AutoConvertResult> {
  // 1. Load prospect
  const [prospect] = await db.select().from(prospectsTable).where(eq(prospectsTable.id, prospectId));
  if (!prospect) return { action: "skipped", reason: "Prospect introuvable" };

  // 2. Already converted?
  if (prospect.convertedToClientId) {
    logger.info({ prospectId, clientId: prospect.convertedToClientId }, "Prospect already converted – reusing client");
    const [existing] = await db.select().from(clientsTable).where(eq(clientsTable.id, prospect.convertedToClientId));
    return {
      action: "already_converted",
      clientId: prospect.convertedToClientId,
      clientCode: existing?.clientCode ?? undefined,
      clientName: existing?.name ?? prospect.company,
      prospectName: prospect.company,
    };
  }

  // 3. Check existing pending alert to avoid duplicates
  const existingAlerts = await db.select().from(conversionAlertsTable)
    .where(eq(conversionAlertsTable.prospectId, prospectId));
  const pending = existingAlerts.find(a => a.status === "pending");

  const score = prospect.score ?? 0;
  const qualifiedStatuses = ["qualified", "contacted"];
  const canAutoConvert = score >= 60 && qualifiedStatuses.includes(prospect.status);

  if (canAutoConvert) {
    // 4a. SILENT CONVERSION
    const clientCode = await generateClientCode();
    const [client] = await db.insert(clientsTable).values({
      name: prospect.company,
      altName: prospect.altName ?? null,
      type: prospect.type ?? "Entreprise",
      clientCode,
      address: prospect.address ?? null,
      postalCode: prospect.postalCode ?? null,
      city: prospect.city ?? null,
      country: prospect.country,
      region: prospect.region ?? null,
      phone: prospect.phone ?? null,
      mobile: prospect.mobile ?? null,
      fax: prospect.fax ?? null,
      website: prospect.website ?? null,
      email: prospect.email ?? null,
      refuseMassEmail: prospect.refuseMassEmail ?? false,
      proId1: prospect.proId1 ?? null,
      proId2: prospect.proId2 ?? null,
      vatRegistered: prospect.vatRegistered ?? false,
      vatNumber: prospect.vatNumber ?? null,
      source: "converted_prospect",
      convertedFromId: prospect.id,
      tags: prospect.tags ?? "[]",
      internalNotes: prospect.internalNotes ?? null,
      activityType: prospect.activityType ?? null,
      riskLevel: "medium",
      paymentTerms: 30,
      currency: prospect.preferredCurrency ?? "USD",
      preferredIncoterm: prospect.preferredIncoterm ?? null,
      createdBy: createdByUserId ?? null,
      assignedTo: prospect.assignedTo ?? null,
    }).returning();

    // Migrate primary contact
    if (prospect.contact) {
      const parts = prospect.contact.trim().split(" ");
      await db.insert(clientContactsTable).values({
        clientId: client.id,
        firstName: parts[0] ?? prospect.contact,
        lastName: parts.slice(1).join(" ") || "-",
        email: prospect.email ?? null,
        phone: prospect.phone ?? null,
        mobile: prospect.mobile ?? null,
        isPrimary: true,
      });
    }

    // Mark prospect as converted
    await db.update(prospectsTable).set({
      status: "converted",
      convertedToClientId: client.id,
      updatedAt: new Date(),
    }).where(eq(prospectsTable.id, prospect.id));

    // Resolve any pending alert
    if (pending) {
      await db.update(conversionAlertsTable).set({
        status: "converted",
        resolvedClientId: client.id,
        resolvedBy: createdByUserId ?? "system",
        resolvedAt: new Date(),
      }).where(eq(conversionAlertsTable.id, pending.id));
    }

    logger.info({ prospectId, clientId: client.id, clientCode, trigger: triggerType }, "Prospect auto-converted to client");

    return {
      action: "converted",
      clientId: client.id,
      clientCode,
      clientName: client.name,
      prospectName: prospect.company,
      score,
    };
  } else {
    // 4b. CREATE ALERT (or update existing)
    let alertId: string;
    const reason = score < 60
      ? `Score insuffisant (${score}/100, minimum 60 requis)`
      : `Statut "${prospect.status}" non qualifié pour conversion automatique`;

    if (pending) {
      // Update trigger
      alertId = pending.id;
      await db.update(conversionAlertsTable).set({
        triggerType,
        triggerId,
        score,
        reason,
      }).where(eq(conversionAlertsTable.id, pending.id));
    } else {
      const [alert] = await db.insert(conversionAlertsTable).values({
        prospectId: prospect.id,
        triggerType,
        triggerId,
        status: "pending",
        score,
        prospectName: prospect.company,
        reason,
      }).returning();
      alertId = alert.id;
    }

    logger.warn({ prospectId, score, status: prospect.status, triggerType }, "Prospect cannot be auto-converted – alert created");

    return {
      action: "alert_created",
      alertId,
      reason,
      score,
      prospectName: prospect.company,
    };
  }
}
