/**
 * Payroll routes — génération paie Madagascar + bulletin HTML/PDF + exports.
 *
 *   GET  /api/payroll              — liste fiches de paie
 *   GET  /api/payroll/:id          — fiche de paie unitaire
 *   GET  /api/payroll/:id/pdf      — bulletin de paie HTML (imprimable → PDF)
 *   POST /api/payroll              — générer la paie d'un employé pour un mois
 *   POST /api/payroll/batch        — générer paie de tous les actifs pour un mois
 */
import { Router, type IRouter } from "express";
import { eq, and, gte, lt } from "drizzle-orm";
import { db, employeesTable, payrollTable, bonusesTable, attendanceTable, companySettingsTable, platformSettingsTable } from "@workspace/db";
import { GeneratePayrollBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { requireRole, ROLES } from "../middlewares/roles";
import { calculatePayroll } from "../lib/payroll-calc";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const hrAccess = requireRole(ROLES.SUPER_ADMIN, ROLES.HR_MANAGER);

function monthRange(month: string): { start: Date; end: Date } {
  const [y, m] = month.split("-").map(Number);
  return { start: new Date(y, m - 1, 1), end: new Date(y, m, 1) };
}

function formatEmployee(e: typeof employeesTable.$inferSelect | null) {
  if (!e) return undefined;
  return { ...e, createdAt: e.createdAt.toISOString(), hireDate: e.hireDate?.toISOString() ?? null, dateNaissance: e.dateNaissance?.toISOString() ?? null };
}

function formatPayroll(p: typeof payrollTable.$inferSelect, employee?: typeof employeesTable.$inferSelect | null) {
  return { ...p, createdAt: p.createdAt.toISOString(), employee: formatEmployee(employee ?? null) };
}

router.get("/payroll", requireAuth, async (req, res): Promise<void> => {
  const { month, employeeId } = req.query as { month?: string; employeeId?: string };
  const rows = await db
    .select()
    .from(payrollTable)
    .leftJoin(employeesTable, eq(payrollTable.employeeId, employeesTable.id))
    .orderBy(payrollTable.createdAt);
  let result = rows.map(({ payroll: p, employees: e }) => formatPayroll(p, e));
  if (month) result = result.filter((r) => r.month === month);
  if (employeeId) result = result.filter((r) => r.employeeId === employeeId);
  res.json(result);
});

router.get("/payroll/:id", requireAuth, async (req, res): Promise<void> => {
  const [row] = await db
    .select()
    .from(payrollTable)
    .leftJoin(employeesTable, eq(payrollTable.employeeId, employeesTable.id))
    .where(eq(payrollTable.id, req.params.id));
  if (!row) { res.status(404).json({ error: "Fiche de paie introuvable" }); return; }
  res.json(formatPayroll(row.payroll, row.employees));
});

router.get("/payroll/:id/pdf", requireAuth, async (req, res): Promise<void> => {
  const [row] = await db.select().from(payrollTable)
    .leftJoin(employeesTable, eq(payrollTable.employeeId, employeesTable.id))
    .where(eq(payrollTable.id, req.params.id));
  if (!row) { res.status(404).json({ error: "Fiche de paie introuvable" }); return; }

  const p = row.payroll;
  const e = row.employees;

  // Branding + company data
  const [company] = await db.select().from(companySettingsTable).limit(1);
  const platformRows = await db.select().from(platformSettingsTable);
  const pf = Object.fromEntries(platformRows.map(r => [r.settingKey, r.settingValue ?? ""]));

  // Individual bonuses for this period
  const [yr, mo] = p.month.split("-").map(Number);
  const periodStart = new Date(yr, mo - 1, 1);
  const periodEnd   = new Date(yr, mo, 1);
  const bonusLines = await db.select().from(bonusesTable)
    .where(and(eq(bonusesTable.employeeId, p.employeeId), gte(bonusesTable.createdAt, periodStart), lt(bonusesTable.createdAt, periodEnd)));

  const brut = p.salaryBase + p.bonus + p.heuresSup;
  const netImposable = Math.max(0, brut - p.cnapsEmp - p.ostieEmp);
  const totalCotisations = p.cnapsEmp + p.ostieEmp;

  const primaryColor  = pf["primary_color"]  || "#1a4032";
  const accentColor   = pf["accent_color"]   || "#2d7a4f";
  const companyName   = company?.companyName || "Vanilla Madagascar Export";
  const companyAddr   = [company?.address, company?.city].filter(Boolean).join(", ") || "Antananarivo, Madagascar";
  const companyPhone  = company?.phone  || "";
  const companyNif    = company?.taxId  || "";
  const companyStat   = company?.statNumber || "";
  const logoUrl       = company?.logoUrl || pf["logo_url"] || "";

  const fmt  = (n: number) => Math.round(n).toLocaleString("fr-FR");
  const periodLabel = (() => {
    const d = new Date(yr, mo - 1, 1);
    return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  })();
  const lastDay = new Date(yr, mo, 0).getDate();
  const periodStr = `01/${String(mo).padStart(2,"0")}/${yr} — ${lastDay}/${String(mo).padStart(2,"0")}/${yr}`;

  // Ancienneté
  let anciennete = "";
  if (e?.hireDate) {
    const hire = new Date(e.hireDate);
    const now  = new Date();
    const totalMonths = (now.getFullYear() - hire.getFullYear()) * 12 + now.getMonth() - hire.getMonth();
    const years = Math.floor(totalMonths / 12);
    const months = totalMonths % 12;
    anciennete = `${years} an(s) et ${months} mois`;
  }

  // Payroll table rows
  let lineNo = 1;
  const dailyRate = p.salaryBase > 0 ? Math.round(p.salaryBase / 26) : 0;

  const gainRows: string[] = [];
  const retenueRows: string[] = [];

  // 1. Salaire de base
  gainRows.push(`
    <tr>
      <td class="num">${lineNo++}</td>
      <td>Salaire de base</td>
      <td class="r">26,00</td>
      <td class="r">${fmt(dailyRate)}</td>
      <td class="r"></td>
      <td class="r gain">${fmt(p.salaryBase)}</td>
      <td class="r"></td>
    </tr>`);

  // 2. Individual bonus lines (production lots)
  if (bonusLines.length > 0) {
    for (const b of bonusLines) {
      gainRows.push(`
    <tr>
      <td class="num">${lineNo++}</td>
      <td>Prime production (lot)</td>
      <td class="r">${b.quantity.toFixed(2)}</td>
      <td class="r">${fmt(b.rate)}</td>
      <td class="r"></td>
      <td class="r gain">${fmt(b.amount)}</td>
      <td class="r"></td>
    </tr>`);
    }
  } else if (p.bonus > 0) {
    gainRows.push(`
    <tr>
      <td class="num">${lineNo++}</td>
      <td>Prime &amp; bonus</td>
      <td class="r">1,00</td>
      <td class="r">${fmt(p.bonus)}</td>
      <td class="r"></td>
      <td class="r gain">${fmt(p.bonus)}</td>
      <td class="r"></td>
    </tr>`);
  }

  // 3. Heures supplémentaires
  if (p.heuresSup > 0) {
    gainRows.push(`
    <tr>
      <td class="num">${lineNo++}</td>
      <td>Heures supplémentaires</td>
      <td class="r"></td>
      <td class="r">${fmt(p.heuresSup)}</td>
      <td class="r"></td>
      <td class="r gain">${fmt(p.heuresSup)}</td>
      <td class="r"></td>
    </tr>`);
  }

  // 4. Retenues : CNAPS
  retenueRows.push(`
    <tr>
      <td class="num">101</td>
      <td>CNAPS salarié</td>
      <td class="r"></td>
      <td class="r">${fmt(brut)}</td>
      <td class="r">1,0</td>
      <td class="r"></td>
      <td class="r retenue">${fmt(p.cnapsEmp)}</td>
    </tr>`);

  // 5. OSTIE
  retenueRows.push(`
    <tr>
      <td class="num">102</td>
      <td>OSTIE salarié</td>
      <td class="r"></td>
      <td class="r">${fmt(brut)}</td>
      <td class="r">1,0</td>
      <td class="r"></td>
      <td class="r retenue">${fmt(p.ostieEmp)}</td>
    </tr>`);

  // 6. IRSA
  if (p.irsa > 0) {
    retenueRows.push(`
    <tr>
      <td class="num">115</td>
      <td>IRSA (barème progressif)</td>
      <td class="r"></td>
      <td class="r"></td>
      <td class="r"></td>
      <td class="r"></td>
      <td class="r retenue">${fmt(p.irsa)}</td>
    </tr>`);
  }

  // 7. Déductions absences
  if (p.deductions > 0) {
    retenueRows.push(`
    <tr>
      <td class="num">91</td>
      <td>Déductions absences</td>
      <td class="r"></td>
      <td class="r"></td>
      <td class="r"></td>
      <td class="r"></td>
      <td class="r retenue">${fmt(p.deductions)}</td>
    </tr>`);
  }

  const logoTag = logoUrl
    ? `<img src="${logoUrl}" alt="logo" style="max-height:56px;max-width:120px;object-fit:contain;display:block;">`
    : `<div style="font-size:22px;font-weight:bold;letter-spacing:1px;color:${primaryColor};">${companyName.charAt(0)}</div>`;

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bulletin de paie — ${e?.name ?? ""} — ${periodLabel}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#111;background:#f4f4f4}
  .page{width:210mm;min-height:297mm;background:#fff;margin:0 auto;box-shadow:0 2px 12px rgba(0,0,0,.15)}

  /* ── Header band ── */
  .hband{background:${primaryColor};color:#fff;padding:8px 16px;display:flex;align-items:center;justify-content:space-between}
  .hband-title{font-size:18px;font-weight:bold;letter-spacing:2px;text-align:right}
  .hband-period{font-size:10px;opacity:.85;text-align:right;margin-top:3px}

  /* ── Sub-header ── */
  .subheader{display:grid;grid-template-columns:1fr 1fr;gap:0;border-bottom:2px solid ${primaryColor}}
  .co-box{padding:12px 16px;border-right:1px solid #e5e7eb}
  .co-name{font-size:13px;font-weight:bold;color:${primaryColor};margin-top:6px}
  .co-line{font-size:10px;color:#555;line-height:1.7}
  .emp-box{padding:12px 16px;background:#fafafa}
  .emp-mat{font-size:10px;color:#888;letter-spacing:1px;text-transform:uppercase}
  .emp-name{font-size:14px;font-weight:bold;color:#111;margin:2px 0}
  .emp-line{font-size:10px;color:#555;line-height:1.7}
  .badge{display:inline-block;padding:1px 6px;border-radius:3px;font-size:9px;font-weight:bold;letter-spacing:.5px;background:${primaryColor};color:#fff;margin-right:4px}

  /* ── Main table ── */
  .section-title{background:${primaryColor};color:#fff;font-size:10px;font-weight:bold;letter-spacing:1px;padding:4px 10px;text-transform:uppercase}
  table.pay{width:100%;border-collapse:collapse;font-size:10px}
  table.pay thead tr th{background:${accentColor};color:#fff;padding:5px 8px;font-weight:600;text-align:left;white-space:nowrap;border-right:1px solid rgba(255,255,255,.2)}
  table.pay thead tr th:last-child{border-right:none}
  table.pay tbody tr td{padding:4px 8px;border-bottom:1px solid #e9ecef;vertical-align:middle}
  table.pay tbody tr:nth-child(even) td{background:#f8f9fa}
  table.pay tbody tr:hover td{background:#edf7f2}
  td.num{color:#888;font-size:9px;width:32px;text-align:center}
  td.r,th.r{text-align:right}
  td.gain{color:#166534;font-weight:600}
  td.retenue{color:#991b1b;font-weight:600}
  .sep-row td{background:${primaryColor}!important;height:2px;padding:0!important}
  .total-brut td{background:#f0fdf4!important;font-weight:700;border-top:2px solid ${primaryColor}}
  .total-brut td.gain{color:${primaryColor};font-size:11px}
  .total-cot td{background:#fff7ed!important;font-weight:700;color:#9a3412;border-top:1px solid #fed7aa}
  .total-cot td.retenue{font-size:11px}

  /* ── NET À PAYER ── */
  .net-section{display:flex;justify-content:space-between;align-items:stretch;border-top:3px solid ${primaryColor};margin-top:0}
  .cumuls{padding:10px 16px;flex:1;border-right:1px solid #e5e7eb}
  .cumuls-title{font-size:9px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;color:#888;margin-bottom:6px}
  .cumuls-grid{display:grid;grid-template-columns:1fr auto auto;gap:2px 12px;font-size:10px}
  .cumuls-grid .lbl{color:#555}
  .cumuls-grid .val{text-align:right;font-weight:600;font-size:10px}
  .net-box{background:${primaryColor};color:#fff;padding:14px 20px;min-width:200px;display:flex;flex-direction:column;justify-content:center;align-items:flex-end}
  .net-label{font-size:10px;opacity:.8;text-transform:uppercase;letter-spacing:1px}
  .net-amount{font-size:24px;font-weight:900;margin-top:4px;letter-spacing:1px}
  .net-currency{font-size:11px;opacity:.7;margin-top:2px}

  /* ── Footer ── */
  .footer{padding:10px 16px;font-size:9px;color:#999;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center}

  /* ── Print button (hidden in print) ── */
  .print-bar{position:fixed;top:0;left:0;right:0;z-index:100;background:#1e293b;color:#fff;padding:10px 20px;display:flex;align-items:center;justify-content:space-between;gap:12px;box-shadow:0 2px 8px rgba(0,0,0,.3)}
  .btn-print{background:${primaryColor};color:#fff;border:none;padding:8px 20px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px}
  .btn-print:hover{filter:brightness(1.15)}
  .print-hint{font-size:12px;opacity:.7}

  @media print{
    html,body{background:#fff}
    .print-bar{display:none!important}
    .page{box-shadow:none;width:100%}
  }
</style>
</head>
<body>

<!-- Print toolbar (hidden when printing) -->
<div class="print-bar">
  <div>
    <div style="font-size:13px;font-weight:600;">Bulletin de paie — ${e?.name ?? ""}</div>
    <div class="print-hint">${periodLabel}</div>
  </div>
  <button class="btn-print" onclick="window.print()">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V2h12v7"/><rect x="6" y="17" width="12" height="5"/><path d="M6 13H4a2 2 0 0 0-2 2v3h4v-3a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v3h4v-3a2 2 0 0 0-2-2h-2"/></svg>
    Télécharger PDF
  </button>
</div>

<!-- A4 page -->
<div style="padding:60px 0 24px">
<div class="page">

  <!-- Header band -->
  <div class="hband">
    <div style="display:flex;align-items:center;gap:12px">
      <div style="background:rgba(255,255,255,.12);border-radius:6px;padding:4px;display:flex;align-items:center;justify-content:center;min-width:64px;min-height:48px">
        ${logoTag}
      </div>
      <div>
        <div style="font-size:13px;font-weight:bold;letter-spacing:.5px">${companyName}</div>
        <div style="font-size:10px;opacity:.75;margin-top:2px">${companyAddr}</div>
        ${companyPhone ? `<div style="font-size:10px;opacity:.75">${companyPhone}</div>` : ""}
      </div>
    </div>
    <div>
      <div class="hband-title">BULLETIN DE PAIE</div>
      <div class="hband-period">Période du ${periodStr}</div>
    </div>
  </div>

  <!-- Employee + company info -->
  <div class="subheader">
    <div class="co-box">
      ${companyNif   ? `<div class="co-line"><strong>NIF :</strong> ${companyNif}</div>` : ""}
      ${companyStat  ? `<div class="co-line"><strong>STAT :</strong> ${companyStat}</div>` : ""}
      <div class="co-line"><strong>Direction des Ressources Humaines</strong></div>
    </div>
    <div class="emp-box">
      <div class="emp-mat">Matricule <strong>${e?.matricule ?? "—"}</strong></div>
      <div class="emp-name">${e?.name ?? "—"}</div>
      <div class="emp-line"><strong>Poste :</strong> ${e?.position ?? "—"}</div>
      ${e?.department ? `<div class="emp-line"><strong>Département :</strong> ${e.department}</div>` : ""}
      <div class="emp-line"><strong>Contrat :</strong> ${e?.typeContrat ?? "CDI"}${anciennete ? ` &nbsp;|&nbsp; <strong>Ancienneté :</strong> ${anciennete}` : ""}</div>
      <div class="emp-line"><strong>Date embauche :</strong> ${e?.hireDate ? new Date(e.hireDate).toLocaleDateString("fr-FR") : "—"}</div>
      <div style="margin-top:4px">
        ${e?.cnapsNumber ? `<span class="badge">CNAPS</span>${e.cnapsNumber}` : ""}
        ${e?.ostieNumber ? `&nbsp;<span class="badge">OSTIE</span>${e.ostieNumber}` : ""}
      </div>
    </div>
  </div>

  <!-- Main payroll table -->
  <table class="pay">
    <thead>
      <tr>
        <th class="num">N°</th>
        <th>Désignation</th>
        <th class="r">Nombre</th>
        <th class="r">Base</th>
        <th class="r">Taux</th>
        <th class="r">Gain</th>
        <th class="r">Retenue</th>
      </tr>
    </thead>
    <tbody>
      ${gainRows.join("")}

      <!-- Total Brut -->
      <tr class="total-brut">
        <td class="num"></td>
        <td><strong>Total Brut</strong></td>
        <td class="r"></td>
        <td class="r"></td>
        <td class="r"></td>
        <td class="r gain">${fmt(brut)}</td>
        <td class="r"></td>
      </tr>

      <!-- Separator -->
      <tr class="sep-row"><td colspan="7"></td></tr>

      ${retenueRows.join("")}

      <!-- Total Cotisations -->
      <tr class="total-cot">
        <td class="num"></td>
        <td><strong>Total Cotisations</strong></td>
        <td class="r"></td>
        <td class="r"></td>
        <td class="r"></td>
        <td class="r"></td>
        <td class="r retenue">${fmt(totalCotisations)}</td>
      </tr>
    </tbody>
  </table>

  <!-- Net à payer + cumuls -->
  <div class="net-section">
    <div class="cumuls">
      <div class="cumuls-title">Cumuls période</div>
      <div class="cumuls-grid">
        <span class="lbl">Salaire brut</span>
        <span></span>
        <span class="val">${fmt(brut)}</span>

        <span class="lbl">Charges salariales</span>
        <span></span>
        <span class="val">${fmt(p.charges)}</span>

        <span class="lbl">Net imposable</span>
        <span></span>
        <span class="val">${fmt(netImposable)}</span>

        ${p.deductions > 0 ? `<span class="lbl">Déductions absences</span><span></span><span class="val" style="color:#991b1b">− ${fmt(p.deductions)}</span>` : ""}
      </div>
    </div>
    <div class="net-box">
      <div class="net-label">Net à payer</div>
      <div class="net-amount">${fmt(p.netSalary)}</div>
      <div class="net-currency">MGA — Ariary malgache</div>
    </div>
  </div>

  <!-- Footer -->
  <div class="footer">
    <div>Généré le ${new Date().toLocaleDateString("fr-FR")} par ${pf["erp_name"] || "Vanilla ERP"} — Document confidentiel</div>
    <div>Conservez ce bulletin sans limitation de durée</div>
  </div>

</div>
</div>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.send(html);
});

router.post("/payroll", requireAuth, hrAccess, async (req, res): Promise<void> => {
  const parsed = GeneratePayrollBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { employeeId, month } = parsed.data;
  const [employee] = await db.select().from(employeesTable).where(eq(employeesTable.id, employeeId));
  if (!employee) { res.status(404).json({ error: "Employé introuvable" }); return; }

  const existing = await db.select().from(payrollTable).where(and(eq(payrollTable.employeeId, employeeId), eq(payrollTable.month, month)));
  if (existing.length > 0) { res.status(400).json({ error: `Paie déjà générée pour ${employee.name} en ${month}` }); return; }

  const salaryBase = employee.salary ?? 0;
  const { start, end } = monthRange(month);

  const attendanceRows = await db.select().from(attendanceTable)
    .where(and(eq(attendanceTable.employeeId, employeeId), gte(attendanceTable.date, start), lt(attendanceTable.date, end)));
  const workedDays = attendanceRows.length;
  const businessDays = 26;
  const absentDays = Math.max(0, businessDays - workedDays);
  const absenceDeduction = Math.round((salaryBase / businessDays) * absentDays);

  const bonusRows = await db.select().from(bonusesTable)
    .where(and(eq(bonusesTable.employeeId, employeeId), gte(bonusesTable.createdAt, start), lt(bonusesTable.createdAt, end)));
  const bonusTotal = bonusRows.reduce((acc, b) => acc + b.amount, 0);

  const heuresSup = Number(req.body.heuresSup ?? 0);
  const calc = calculatePayroll({ salaryBase, bonus: bonusTotal, heuresSup, deductions: absenceDeduction });

  const [payroll] = await db.insert(payrollTable).values({
    employeeId, month, salaryBase,
    bonus: bonusTotal, heuresSup,
    deductions: absenceDeduction,
    cnapsEmp: calc.cnapsEmp, ostieEmp: calc.ostieEmp, irsa: calc.irsa,
    charges: calc.charges, netSalary: calc.netSalary,
  }).returning();

  logger.info({ name: employee.name, month, net: calc.netSalary }, "Payroll generated");
  res.status(201).json(formatPayroll(payroll, employee));
});

/** Delete a single payroll record */
router.delete("/payroll/:id", requireAuth, hrAccess, async (req, res): Promise<void> => {
  const [deleted] = await db
    .delete(payrollTable)
    .where(eq(payrollTable.id, req.params.id))
    .returning();
  if (!deleted) { res.status(404).json({ error: "Fiche de paie introuvable" }); return; }
  logger.info({ id: deleted.id, employeeId: deleted.employeeId, month: deleted.month }, "Payroll record deleted");
  res.json({ success: true, deleted: { id: deleted.id, month: deleted.month } });
});

// Batch payroll: generate for ALL active employees in a given month
router.post("/payroll/batch", requireAuth, hrAccess, async (req, res): Promise<void> => {
  const { month } = req.body as { month?: string };
  if (!month || !/^\d{4}-\d{2}$/.test(month)) { res.status(400).json({ error: "month requis (YYYY-MM)" }); return; }

  const activeEmployees = await db.select().from(employeesTable)
    .where(eq(employeesTable.statut, "actif"));

  const { start, end } = monthRange(month);
  let created = 0; let skipped = 0;

  for (const employee of activeEmployees) {
    const existing = await db.select({ id: payrollTable.id }).from(payrollTable)
      .where(and(eq(payrollTable.employeeId, employee.id), eq(payrollTable.month, month))).limit(1);
    if (existing.length > 0) { skipped++; continue; }

    const salaryBase = employee.salary ?? 0;
    const attendanceRows = await db.select().from(attendanceTable)
      .where(and(eq(attendanceTable.employeeId, employee.id), gte(attendanceTable.date, start), lt(attendanceTable.date, end)));
    const workedDays = attendanceRows.length;
    const businessDays = 26;
    const absenceDeduction = Math.round((salaryBase / businessDays) * Math.max(0, businessDays - workedDays));

    const bonusRows = await db.select().from(bonusesTable)
      .where(and(eq(bonusesTable.employeeId, employee.id), gte(bonusesTable.createdAt, start), lt(bonusesTable.createdAt, end)));
    const bonusTotal = bonusRows.reduce((acc, b) => acc + b.amount, 0);

    const calc = calculatePayroll({ salaryBase, bonus: bonusTotal, heuresSup: 0, deductions: absenceDeduction });
    await db.insert(payrollTable).values({
      employeeId: employee.id, month, salaryBase,
      bonus: bonusTotal, heuresSup: 0, deductions: absenceDeduction,
      cnapsEmp: calc.cnapsEmp, ostieEmp: calc.ostieEmp, irsa: calc.irsa,
      charges: calc.charges, netSalary: calc.netSalary,
    });
    created++;
  }

  logger.info({ month, created, skipped }, "Batch payroll complete");
  res.json({ success: true, month, created, skipped });
});

export default router;
