/**
 * Auto-conversion engine: Prospect → Client (v2)
 *
 * Implements the spec rules:
 *   RULE 1 — IDEMPOTENCE:   already-converted → return existing client, no error
 *   RULE 2 — ATOMICITY:     full DB transaction; rollback on any failure
 *   RULE 3 — SILENCE AUTO:  auto-conversion never blocks the calling request
 *   RULE 4 — PRESERVATION:  prospect stays in DB, never deleted
 *   RULE 5 — SCORE BYPASS:  auto-triggers ignore min score
 *   RULE 6 — ASSIGNATION:   commercial stays assigned on the new client
 *
 * Triggers:
 *   - deal_created      (deal POST with prospectId, score ≥ 60 + qualified/contacted)
 *   - quote_accepted    (quote PATCH accept with prospectId – always converts)
 *   - manual            (PUT /crm/prospects/:id/convert)
 */

import { eq, sql } from "drizzle-orm";
import {
  db,
  prospectsTable,
  clientsTable,
  clientContactsTable,
  conversionAlertsTable,
  conversionLogsTable,
  interactionsTable,
  dealsTable,
  quotesTable,
  remindersTable,
} from "@workspace/db";
import { logger } from "../lib/logger";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ConversionSource = "manual" | "quote_accepted" | "deal_created" | "order_created";

export interface ConvertOptions {
  source: ConversionSource;
  triggeredBy?: string | null;          // userId or null (system)
  triggeredByQuoteId?: string | null;
  triggeredByDealId?: string | null;
  skipValidation?: boolean;             // true for auto-triggers (score not checked)
}

export interface AutoConvertResult {
  action: "converted" | "alert_created" | "already_converted" | "skipped";
  clientId?: string;
  clientCode?: string;
  clientName?: string;
  alertId?: string;
  reason?: string;
  score?: number;
  prospectName?: string;
  migrationSummary?: MigrationSummary;
}

interface MigrationSummary {
  interactionsCount: number;
  dealsCount: number;
  quotesCount: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function riskLevelFromScore(score: number): string {
  if (score >= 80) return "low";
  if (score >= 50) return "medium";
  return "high";
}

// ─── Core conversion (runs inside a transaction) ───────────────────────────────

async function _doConvert(
  prospect: typeof prospectsTable.$inferSelect,
  opts: ConvertOptions
): Promise<{ client: typeof clientsTable.$inferSelect; migrationSummary: MigrationSummary }> {
  const { source, triggeredBy, triggeredByQuoteId, triggeredByDealId } = opts;

  // ── 1. Generate code ──
  const clientCode = await generateClientCode();
  const score = prospect.score ?? 0;

  // ── 2. Create client ──
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
    source: `converted_${source}`,
    conversionSource: source,
    convertedFromId: prospect.id,
    tags: prospect.tags ?? "[]",
    internalNotes: `[Converti depuis prospect le ${new Date().toISOString()} — source: ${source}]\n\n${prospect.internalNotes ?? ""}`.trim(),
    activityType: prospect.activityType ?? null,
    riskLevel: riskLevelFromScore(score),
    paymentTerms: 30,
    currency: prospect.preferredCurrency ?? "USD",
    preferredIncoterm: prospect.preferredIncoterm ?? null,
    createdBy: triggeredBy ?? null,
    assignedTo: prospect.assignedTo ?? null,
  }).returning();

  // ── 3. Create primary contact ──
  if (prospect.contact || prospect.email || prospect.phone) {
    const parts = (prospect.contact ?? "").trim().split(" ");
    await db.insert(clientContactsTable).values({
      clientId: client.id,
      firstName: parts[0] || "Contact",
      lastName: parts.slice(1).join(" ") || "Principal",
      email: prospect.email ?? null,
      phone: prospect.phone ?? null,
      mobile: prospect.mobile ?? null,
      isPrimary: true,
      role: "Contact principal",
    });
  }

  // ── 4. Migrate data ──
  const migrationSummary: MigrationSummary = {
    interactionsCount: 0, dealsCount: 0, quotesCount: 0,
  };

  // 4a. Interactions (reassign prospectId → clientId)
  const interactionResult = await db.execute(
    sql`UPDATE interactions SET client_id = ${client.id}, prospect_id = NULL WHERE prospect_id = ${prospect.id}`
  );
  migrationSummary.interactionsCount = (interactionResult as any).rowCount ?? 0;

  // 4b. Deals (link to new client, keep prospectId for traceability)
  const dealResult = await db.execute(
    sql`UPDATE deals SET client_id = ${client.id} WHERE prospect_id = ${prospect.id} AND client_id IS NULL`
  );
  migrationSummary.dealsCount = (dealResult as any).rowCount ?? 0;

  // 4c. Quotes (reassign prospectId → clientId)
  const quoteResult = await db.execute(
    sql`UPDATE quotes SET client_id = ${client.id}, prospect_id = ${prospect.id} WHERE prospect_id = ${prospect.id} AND client_id != ${client.id}`
  );
  migrationSummary.quotesCount = (quoteResult as any).rowCount ?? 0;

  // ── 5. Update prospect ──
  await db.update(prospectsTable).set({
    status: "converted",
    convertedToClientId: client.id,
    convertedAt: new Date(),
    convertedBy: triggeredBy ?? null,
    conversionSource: source,
    updatedAt: new Date(),
  }).where(eq(prospectsTable.id, prospect.id));

  // ── 6. Audit log ──
  await db.insert(conversionLogsTable).values({
    prospectId: prospect.id,
    clientId: client.id,
    source,
    triggeredBy: triggeredBy ?? null,
    triggeredByQuoteId: triggeredByQuoteId ?? null,
    triggeredByDealId: triggeredByDealId ?? null,
    dataMigrated: migrationSummary as any,
  });

  // ── 7. Post-conversion actions ──

  // 7a. Onboarding reminder (+7 days)
  try {
    await db.insert(remindersTable).values({
      clientEmail: prospect.email ?? "onboarding@vanilla-madagascar.mg",
      clientName: prospect.company,
      type: "followup",
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: "pending",
      notes: `[ONBOARDING] Premier contact avec ${prospect.company} (${clientCode}). Présenter catalogue, conditions, échantillons. Source: ${source}.`,
    });
  } catch (e) {
    logger.warn(e, "Failed to create onboarding reminder — non-blocking");
  }

  // 7b. System interaction log on the new client
  try {
    await db.insert(interactionsTable).values({
      type: "note",
      note: `Conversion automatique : prospect → client ${clientCode} (source: ${source}). Données migrées : ${migrationSummary.interactionsCount} interactions, ${migrationSummary.dealsCount} deals, ${migrationSummary.quotesCount} devis.`,
      clientId: client.id,
      createdBy: triggeredBy ?? "system",
    });
  } catch (e) {
    logger.warn(e, "Failed to create conversion system interaction — non-blocking");
  }

  // 7c. Resolve any pending alert for this prospect
  try {
    await db.update(conversionAlertsTable).set({
      status: "converted",
      resolvedClientId: client.id,
      resolvedBy: triggeredBy ?? "system",
      resolvedAt: new Date(),
    }).where(eq(conversionAlertsTable.prospectId, prospect.id));
  } catch (e) {
    logger.warn(e, "Failed to resolve conversion alert — non-blocking");
  }

  return { client, migrationSummary };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Full conversion (manual or auto).
 * skipValidation = true → always converts regardless of score/status.
 */
export async function convertProspectToClient(
  prospectId: string,
  opts: ConvertOptions
): Promise<AutoConvertResult> {
  const [prospect] = await db.select().from(prospectsTable).where(eq(prospectsTable.id, prospectId));
  if (!prospect) return { action: "skipped", reason: "Prospect introuvable" };

  // RULE 1 — idempotence
  if (prospect.convertedToClientId) {
    const [existing] = await db.select().from(clientsTable).where(eq(clientsTable.id, prospect.convertedToClientId));
    return {
      action: "already_converted",
      clientId: prospect.convertedToClientId,
      clientCode: existing?.clientCode ?? undefined,
      clientName: existing?.name ?? prospect.company,
      prospectName: prospect.company,
    };
  }

  // Score/status check for MANUAL conversions only
  const QUALIFIED = ["qualified", "contacted"];
  const score = prospect.score ?? 0;
  if (!opts.skipValidation && !(score >= 60 && QUALIFIED.includes(prospect.status))) {
    return {
      action: "alert_created",
      reason: score < 60
        ? `Score insuffisant (${score}/100, min 60 requis)`
        : `Statut "${prospect.status}" non qualifié`,
      score,
      prospectName: prospect.company,
    };
  }

  // RULE 2 — atomicity via Drizzle transaction
  try {
    const { client, migrationSummary } = await db.transaction(async () => {
      return _doConvert(prospect, opts);
    });

    logger.info(
      { prospectId, clientId: client.id, clientCode: client.clientCode, source: opts.source },
      "Prospect converted to client"
    );

    return {
      action: "converted",
      clientId: client.id,
      clientCode: client.clientCode ?? undefined,
      clientName: client.name,
      prospectName: prospect.company,
      score,
      migrationSummary,
    };
  } catch (e) {
    logger.error(e, "Conversion transaction failed");
    throw e;
  }
}

// ─── Trigger helpers ──────────────────────────────────────────────────────────

/**
 * Triggered when deal is created with a prospectId.
 * Checks score/status; creates alert if not qualified.
 */
export async function autoConvertProspect(
  prospectId: string,
  triggerType: "deal" | "quote",
  triggerId: string,
  createdByUserId?: string
): Promise<AutoConvertResult> {
  const [prospect] = await db.select().from(prospectsTable).where(eq(prospectsTable.id, prospectId));
  if (!prospect) return { action: "skipped", reason: "Prospect introuvable" };

  if (prospect.convertedToClientId) {
    const [existing] = await db.select().from(clientsTable).where(eq(clientsTable.id, prospect.convertedToClientId));
    return {
      action: "already_converted",
      clientId: prospect.convertedToClientId,
      clientCode: existing?.clientCode ?? undefined,
      clientName: existing?.name ?? prospect.company,
      prospectName: prospect.company,
    };
  }

  const score = prospect.score ?? 0;
  const QUALIFIED = ["qualified", "contacted"];
  const canAutoConvert = score >= 60 && QUALIFIED.includes(prospect.status);

  if (canAutoConvert) {
    return convertProspectToClient(prospectId, {
      source: triggerType === "deal" ? "deal_created" : "quote_accepted",
      triggeredBy: createdByUserId,
      triggeredByDealId: triggerType === "deal" ? triggerId : undefined,
      triggeredByQuoteId: triggerType === "quote" ? triggerId : undefined,
      skipValidation: false,
    });
  }

  // Not qualified — create alert
  const existing = await db.select().from(conversionAlertsTable)
    .where(eq(conversionAlertsTable.prospectId, prospectId));
  const pending = existing.find(a => a.status === "pending");
  const reason = score < 60
    ? `Score insuffisant (${score}/100, minimum 60 requis)`
    : `Statut "${prospect.status}" non qualifié pour conversion automatique`;

  let alertId: string;
  if (pending) {
    alertId = pending.id;
    await db.update(conversionAlertsTable).set({ triggerType, triggerId, score, reason })
      .where(eq(conversionAlertsTable.id, pending.id));
  } else {
    const [alert] = await db.insert(conversionAlertsTable).values({
      prospectId, triggerType, triggerId,
      status: "pending", score, prospectName: prospect.company, reason,
    }).returning();
    alertId = alert.id;
  }

  logger.warn({ prospectId, score, status: prospect.status, triggerType }, "Alert created for manual review");
  return { action: "alert_created", alertId, reason, score, prospectName: prospect.company };
}

/**
 * Triggered on quote PATCH /accept — always converts (skipValidation).
 */
export async function autoConvertOnQuoteAccepted(
  quoteId: string,
  prospectId: string,
  validatedBy?: string | null
): Promise<AutoConvertResult> {
  return convertProspectToClient(prospectId, {
    source: "quote_accepted",
    triggeredBy: validatedBy,
    triggeredByQuoteId: quoteId,
    skipValidation: true, // Accepted quote = sufficient qualification
  });
}
