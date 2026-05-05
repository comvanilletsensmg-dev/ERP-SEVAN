import { Router, type IRouter } from "express";
import { eq, desc, and, sql } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db, hrRequestsTable, hrRequestLogsTable,
  employeesTable, leaveBalancesTable, companySettingsTable,
} from "@workspace/db";
import { loadUser } from "../middlewares/roles";

const router: IRouter = Router();

// ── Zod schemas ───────────────────────────────────────────────────────────────
const CreateBody = z.object({
  employeeId: z.string().min(1),
  type:       z.enum(["leave", "advance", "attestation", "mission", "issue"]),
  reason:     z.string().optional().nullable(),
  startDate:  z.string().optional().nullable(),
  endDate:    z.string().optional().nullable(),
  amount:     z.number().positive().optional().nullable(),
});

const WorkflowBody = z.object({ comment: z.string().optional() });

// ── helpers ───────────────────────────────────────────────────────────────────
async function generateReference(): Promise<string> {
  const year = new Date().getFullYear();
  const [row] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(hrRequestsTable);
  const seq = String((row?.count ?? 0) + 1).padStart(3, "0");
  return `DEM-${year}-${seq}`;
}

function fmtReq(r: typeof hrRequestsTable.$inferSelect, emp: any = null, logs: any[] = []) {
  return {
    ...r,
    startDate:  r.startDate  ? r.startDate.toISOString()  : null,
    endDate:    r.endDate    ? r.endDate.toISOString()     : null,
    createdAt:  r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    updatedAt:  r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
    amount:     r.amount != null ? Number(r.amount) : null,
    employee:   emp ? {
      id: emp.id, name: emp.name, nom: emp.nom, prenom: emp.prenom,
      email: emp.email, position: emp.position, matricule: emp.matricule,
      salary: emp.salary != null ? Number(emp.salary) : null,
    } : null,
    logs: logs.map(l => ({ ...l, createdAt: l.createdAt instanceof Date ? l.createdAt.toISOString() : l.createdAt })),
  };
}

// ── GET /hr-requests ──────────────────────────────────────────────────────────
router.get("/hr-requests", loadUser, async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(hrRequestsTable)
    .leftJoin(employeesTable, eq(hrRequestsTable.employeeId, employeesTable.id))
    .orderBy(desc(hrRequestsTable.createdAt));
  res.json(rows.map(({ hr_requests: r, employees: e }) => fmtReq(r, e)));
});

// ── GET /hr-requests/stats ────────────────────────────────────────────────────
router.get("/hr-requests/stats", loadUser, async (_req, res): Promise<void> => {
  const rows = await db.select().from(hrRequestsTable);
  const total   = rows.length;
  const pending = rows.filter(r => r.status === "pending").length;
  const managerApproved = rows.filter(r => r.status === "manager_approved").length;
  const hrApproved = rows.filter(r => r.status === "hr_approved").length;
  const rejected = rows.filter(r => r.status === "rejected").length;
  res.json({ total, pending, managerApproved, hrApproved, rejected });
});

// ── GET /hr-requests/:id ──────────────────────────────────────────────────────
router.get("/hr-requests/:id", loadUser, async (req, res): Promise<void> => {
  const [row] = await db
    .select()
    .from(hrRequestsTable)
    .leftJoin(employeesTable, eq(hrRequestsTable.employeeId, employeesTable.id))
    .where(eq(hrRequestsTable.id, req.params.id));
  if (!row) { res.status(404).json({ error: "Demande introuvable" }); return; }

  const logs = await db
    .select()
    .from(hrRequestLogsTable)
    .where(eq(hrRequestLogsTable.requestId, req.params.id))
    .orderBy(desc(hrRequestLogsTable.createdAt));

  res.json(fmtReq(row.hr_requests, row.employees, logs));
});

// ── POST /hr-requests ─────────────────────────────────────────────────────────
router.post("/hr-requests", loadUser, async (req, res): Promise<void> => {
  const parsed = CreateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data;

  const [employee] = await db.select().from(employeesTable).where(eq(employeesTable.id, d.employeeId));
  if (!employee) { res.status(404).json({ error: "Employé introuvable" }); return; }

  // Check leave balance
  if (d.type === "leave" && d.startDate && d.endDate) {
    const start = new Date(d.startDate);
    const end   = new Date(d.endDate);
    if (end <= start) { res.status(422).json({ error: "La date de fin doit être après la date de début" }); return; }
    const days = Math.ceil((end.getTime() - start.getTime()) / 86400000);
    const [bal] = await db.select().from(leaveBalancesTable).where(
      and(eq(leaveBalancesTable.employeeId, d.employeeId), eq(leaveBalancesTable.type, "annual"))
    );
    if (bal && Number(bal.balance) < days) {
      res.status(422).json({ error: `Solde insuffisant : ${Number(bal.balance).toFixed(1)} j disponible(s), ${days} demandé(s)` });
      return;
    }
  }

  const reference = await generateReference();
  const id = crypto.randomUUID();

  const [request] = await db.insert(hrRequestsTable).values({
    id, reference,
    employeeId:  d.employeeId,
    type:        d.type,
    description: "",
    reason:      d.reason  || null,
    startDate:   d.startDate ? new Date(d.startDate) : null,
    endDate:     d.endDate   ? new Date(d.endDate)   : null,
    amount:      d.amount != null ? String(d.amount) : null,
    status:      "pending",
  }).returning();

  await db.insert(hrRequestLogsTable).values({
    id: crypto.randomUUID(), requestId: id,
    action: "created",
    userId:   req.currentUser!.id,
    userName: req.currentUser!.name ?? req.currentUser!.email,
  });

  req.log.info({ requestId: id, ref: reference, type: d.type }, "HR request created");
  res.status(201).json(fmtReq(request, employee));
});

// ── POST /hr-requests/:id/approve ─────────────────────────────────────────────
router.post("/hr-requests/:id/approve", loadUser, async (req, res): Promise<void> => {
  const { comment } = WorkflowBody.parse(req.body);
  const user = req.currentUser!;

  const [row] = await db.select().from(hrRequestsTable).where(eq(hrRequestsTable.id, req.params.id));
  if (!row) { res.status(404).json({ error: "Demande introuvable" }); return; }

  let newStatus: string;
  let action: string;
  const updates: Partial<typeof hrRequestsTable.$inferInsert> & { updatedAt: Date } = { updatedAt: new Date() };

  if (row.status === "pending") {
    newStatus = "manager_approved"; action = "manager_approved";
    updates.managerId      = user.id;
    updates.managerComment = comment || null;
  } else if (row.status === "manager_approved") {
    newStatus = "hr_approved"; action = "hr_approved";
    updates.hrId      = user.id;
    updates.hrComment = comment || null;
  } else {
    res.status(400).json({ error: `Statut "${row.status}" ne peut pas être approuvé` });
    return;
  }

  updates.status = newStatus;
  const [updated] = await db.update(hrRequestsTable).set(updates)
    .where(eq(hrRequestsTable.id, row.id)).returning();

  await db.insert(hrRequestLogsTable).values({
    id: crypto.randomUUID(), requestId: row.id, action,
    userId: user.id, userName: user.name ?? user.email,
    comment: comment || null,
  });

  req.log.info({ requestId: row.id, newStatus }, "HR request approved");
  res.json(fmtReq(updated));
});

// ── POST /hr-requests/:id/reject ──────────────────────────────────────────────
router.post("/hr-requests/:id/reject", loadUser, async (req, res): Promise<void> => {
  const { comment } = WorkflowBody.parse(req.body);
  const user = req.currentUser!;

  const [row] = await db.select().from(hrRequestsTable).where(eq(hrRequestsTable.id, req.params.id));
  if (!row) { res.status(404).json({ error: "Demande introuvable" }); return; }
  if (["hr_approved", "rejected"].includes(row.status)) {
    res.status(400).json({ error: "Cette demande ne peut plus être rejetée" }); return;
  }

  const [updated] = await db.update(hrRequestsTable)
    .set({ status: "rejected", updatedAt: new Date() })
    .where(eq(hrRequestsTable.id, row.id)).returning();

  await db.insert(hrRequestLogsTable).values({
    id: crypto.randomUUID(), requestId: row.id, action: "rejected",
    userId: user.id, userName: user.name ?? user.email, comment: comment || null,
  });

  req.log.info({ requestId: row.id }, "HR request rejected");
  res.json(fmtReq(updated));
});

// ── GET /hr-requests/:id/pdf ──────────────────────────────────────────────────
router.get("/hr-requests/:id/pdf", loadUser, async (req, res): Promise<void> => {
  const [row] = await db
    .select()
    .from(hrRequestsTable)
    .leftJoin(employeesTable, eq(hrRequestsTable.employeeId, employeesTable.id))
    .where(eq(hrRequestsTable.id, req.params.id));
  if (!row) { res.status(404).json({ error: "Demande introuvable" }); return; }

  const r = row.hr_requests;
  const e = row.employees;

  const logs = await db.select().from(hrRequestLogsTable)
    .where(eq(hrRequestLogsTable.requestId, r.id))
    .orderBy(desc(hrRequestLogsTable.createdAt));

  const [settings] = await db.select().from(companySettingsTable).limit(1);
  const companyName = settings?.name ?? "Vanilla Madagascar";
  const companyAddr = settings?.address ?? "Madagascar";

  const TYPE_FR: Record<string, string> = {
    leave: "Congé", advance: "Avance sur salaire",
    attestation: "Attestation de travail", mission: "Ordre de mission", issue: "Réclamation",
  };
  const STATUS_FR: Record<string, { label: string; cls: string }> = {
    pending:          { label: "En attente",         cls: "status-pending"  },
    manager_approved: { label: "Validé — Manager",   cls: "status-manager"  },
    hr_approved:      { label: "Approuvé — RH",      cls: "status-approved" },
    rejected:         { label: "Rejeté",              cls: "status-rejected" },
  };
  const fmtD = (d: Date | null) => d ? new Date(d).toLocaleDateString("fr-FR") : "—";

  let specificHtml = "";
  if (r.type === "leave") {
    const days = (r.startDate && r.endDate)
      ? Math.ceil((r.endDate.getTime() - r.startDate.getTime()) / 86400000)
      : null;
    specificHtml = `
      <tr><td>Date de début</td><td><strong>${fmtD(r.startDate)}</strong></td></tr>
      <tr><td>Date de fin</td><td><strong>${fmtD(r.endDate)}</strong></td></tr>
      ${days != null ? `<tr><td>Durée</td><td><strong>${days} jour(s)</strong></td></tr>` : ""}`;
  } else if (r.type === "advance") {
    specificHtml = `<tr><td>Montant demandé</td><td><strong>${r.amount != null ? Number(r.amount).toLocaleString("fr-MG") + " MGA" : "—"}</strong></td></tr>`;
  } else if (r.type === "mission") {
    specificHtml = `
      <tr><td>Date de départ</td><td><strong>${fmtD(r.startDate)}</strong></td></tr>
      <tr><td>Date de retour</td><td><strong>${fmtD(r.endDate)}</strong></td></tr>`;
  }

  const logsHtml = logs.map(l => `
    <tr>
      <td>${new Date(l.createdAt).toLocaleString("fr-FR")}</td>
      <td>${l.userName ?? l.userId}</td>
      <td>${l.action === "created" ? "Soumission" : l.action === "manager_approved" ? "Validé (Manager)" : l.action === "hr_approved" ? "Approuvé (RH)" : "Rejeté"}</td>
      <td>${l.comment ?? "—"}</td>
    </tr>`).join("");

  const empName = e?.prenom && e?.nom ? `${e.prenom} ${e.nom}` : e?.name ?? "—";
  const statusInfo = STATUS_FR[r.status] ?? { label: r.status, cls: "status-pending" };

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>${r.reference ?? r.id} — Demande Officielle</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; font-size: 13px; background: #fff; }
.page { max-width: 820px; margin: 0 auto; padding: 40px 50px; }
/* Header */
.header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 20px; margin-bottom: 30px; border-bottom: 3px double #1b4332; }
.logo-area { display: flex; align-items: center; gap: 14px; }
.logo-icon { width: 56px; height: 56px; background: linear-gradient(135deg,#1b4332,#52b788); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 28px; }
.company-name { font-size: 20px; font-weight: 700; color: #1b4332; }
.company-sub  { font-size: 10px; color: #666; margin-top: 3px; }
.ref-box { text-align: right; }
.ref-num { font-size: 16px; font-weight: 700; color: #1b4332; font-family: monospace; }
.status-pending  { display: inline-block; padding: 3px 12px; border-radius: 20px; font-size: 10px; font-weight: 700; background: #fef3c7; color: #92400e; border: 1px solid #f59e0b; }
.status-manager  { display: inline-block; padding: 3px 12px; border-radius: 20px; font-size: 10px; font-weight: 700; background: #dbeafe; color: #1e40af; border: 1px solid #3b82f6; }
.status-approved { display: inline-block; padding: 3px 12px; border-radius: 20px; font-size: 10px; font-weight: 700; background: #d1fae5; color: #065f46; border: 1px solid #10b981; }
.status-rejected { display: inline-block; padding: 3px 12px; border-radius: 20px; font-size: 10px; font-weight: 700; background: #fee2e2; color: #991b1b; border: 1px solid #ef4444; }
/* Title */
.doc-title { text-align: center; margin: 28px 0; }
.doc-title h1 { font-size: 18px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; color: #1b4332; }
.doc-title .type { display: inline-block; margin-top: 8px; padding: 4px 20px; border: 1px solid #1b4332; border-radius: 20px; font-size: 12px; color: #1b4332; }
/* Sections */
.section { margin-bottom: 26px; }
.section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #1b4332; background: #f0fdf4; padding: 6px 10px; border-left: 4px solid #1b4332; margin-bottom: 12px; }
table.info { width: 100%; border-collapse: collapse; }
table.info td { padding: 7px 10px; font-size: 12px; }
table.info td:first-child { color: #555; width: 38%; }
table.info tr:nth-child(even) { background: #f8fffe; }
table.info tr { border-bottom: 1px solid #f0f0f0; }
.reason-box { background: #f8fffe; border-left: 4px solid #52b788; padding: 12px 16px; border-radius: 4px; font-size: 13px; color: #333; line-height: 1.6; }
/* Signatures */
.signatures { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; margin-top: 50px; }
.sig-block { text-align: center; }
.sig-zone { height: 70px; border-bottom: 1px solid #999; margin-bottom: 8px; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 6px; font-size: 18px; color: ${r.status === "hr_approved" ? "#065f46" : r.status === "manager_approved" ? "#1e40af" : "#ccc"}; }
.sig-label { font-size: 11px; color: #555; }
.sig-name  { font-size: 11px; font-weight: 600; color: #1b4332; margin-top: 3px; }
/* Audit */
table.audit { width: 100%; border-collapse: collapse; font-size: 11px; }
table.audit th { background: #f0fdf4; padding: 6px 8px; text-align: left; font-weight: 600; color: #1b4332; border-bottom: 1px solid #d1fae5; }
table.audit td { padding: 6px 8px; border-bottom: 1px solid #f0f0f0; color: #444; }
/* Footer */
.footer { margin-top: 40px; border-top: 1px solid #e5e7eb; padding-top: 12px; display: flex; justify-content: space-between; font-size: 10px; color: #9ca3af; }
.watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%) rotate(-30deg); font-size: 80px; font-weight: 900; color: rgba(16,185,129,0.04); pointer-events: none; z-index: 0; text-transform: uppercase; letter-spacing: 10px; }
.no-print { display: flex; gap: 10px; margin-bottom: 20px; justify-content: flex-end; }
.btn-print { padding: 8px 20px; background: #1b4332; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; }
.btn-close { padding: 8px 20px; background: #e5e7eb; color: #333; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; }
@media print {
  .no-print { display: none !important; }
  .watermark { display: block; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
</style>
</head>
<body>
<div class="watermark">${r.status === "hr_approved" ? "APPROUVÉ" : r.status === "rejected" ? "REJETÉ" : "EN COURS"}</div>
<div class="page">

  <div class="no-print">
    <button class="btn-close" onclick="window.close()">✕ Fermer</button>
    <button class="btn-print" onclick="window.print()">🖨️ Imprimer / Enregistrer PDF</button>
  </div>

  <!-- Header -->
  <div class="header">
    <div class="logo-area">
      <div class="logo-icon">🌿</div>
      <div>
        <div class="company-name">${companyName}</div>
        <div class="company-sub">${companyAddr}</div>
      </div>
    </div>
    <div class="ref-box">
      <div style="font-size:10px;color:#888;margin-bottom:4px;">Référence document</div>
      <div class="ref-num">${r.reference ?? r.id.slice(0, 8).toUpperCase()}</div>
      <div style="margin-top:8px;"><span class="${statusInfo.cls}">${statusInfo.label}</span></div>
      <div style="font-size:10px;color:#888;margin-top:8px;">Date: ${fmtD(r.createdAt)}</div>
    </div>
  </div>

  <!-- Title -->
  <div class="doc-title">
    <h1>Demande Officielle</h1>
    <div class="type">${TYPE_FR[r.type] ?? r.type}</div>
  </div>

  <!-- Employee -->
  <div class="section">
    <div class="section-title">Informations de l'employé</div>
    <table class="info">
      <tr><td>Nom complet</td><td><strong>${empName}</strong></td></tr>
      <tr><td>Matricule</td><td>${e?.matricule ?? "—"}</td></tr>
      <tr><td>Poste</td><td>${e?.position ?? "—"}</td></tr>
      <tr><td>Email professionnel</td><td>${e?.email ?? "—"}</td></tr>
    </table>
  </div>

  <!-- Request details -->
  <div class="section">
    <div class="section-title">Détails de la demande</div>
    <table class="info">
      <tr><td>Type</td><td><strong>${TYPE_FR[r.type] ?? r.type}</strong></td></tr>
      <tr><td>Soumis le</td><td>${fmtD(r.createdAt)}</td></tr>
      ${specificHtml}
    </table>
  </div>

  ${r.reason ? `
  <div class="section">
    <div class="section-title">Motif / Justification</div>
    <div class="reason-box">${r.reason}</div>
  </div>` : ""}

  <!-- Signatures -->
  <div class="section">
    <div class="section-title">Signatures et visas</div>
    <div class="signatures">
      <div class="sig-block">
        <div class="sig-zone">✍</div>
        <div class="sig-label">L'employé</div>
        <div class="sig-name">${empName}</div>
      </div>
      <div class="sig-block">
        <div class="sig-zone">${["manager_approved","hr_approved"].includes(r.status) ? "✓" : ""}</div>
        <div class="sig-label">Visa Manager</div>
        <div class="sig-name">${["manager_approved","hr_approved"].includes(r.status) ? "Approuvé" : "En attente"}</div>
      </div>
      <div class="sig-block">
        <div class="sig-zone">${r.status === "hr_approved" ? "✓" : ""}</div>
        <div class="sig-label">Validation RH</div>
        <div class="sig-name">${r.status === "hr_approved" ? "Approuvé" : "En attente"}</div>
      </div>
    </div>
  </div>

  <!-- Audit trail -->
  ${logs.length > 0 ? `
  <div class="section">
    <div class="section-title">Historique des actions</div>
    <table class="audit">
      <thead><tr><th>Date</th><th>Par</th><th>Action</th><th>Commentaire</th></tr></thead>
      <tbody>${logsHtml}</tbody>
    </table>
  </div>` : ""}

  <!-- Footer -->
  <div class="footer">
    <div>Généré le ${new Date().toLocaleDateString("fr-FR")} à ${new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</div>
    <div>Réf: ${r.reference ?? r.id} — Document confidentiel ${companyName}</div>
  </div>

</div>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

export default router;
