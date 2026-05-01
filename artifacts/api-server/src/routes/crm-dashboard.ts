import { Router, type IRouter } from "express";
import { db, leadsTable, enrichedLeadsTable, emailLogsTable, remindersTable } from "@workspace/db";
import { eq, desc, gte, count, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { getScoreLabel } from "../services/scoring";

const router: IRouter = Router();

router.get("/crm/dashboard", requireAuth, async (_req, res): Promise<void> => {
  // Total leads by stage
  const allLeads = await db.select().from(leadsTable).orderBy(desc(leadsTable.createdAt));
  const allEnrichments = await db.select().from(enrichedLeadsTable);
  const enrichMap = Object.fromEntries(allEnrichments.map(e => [e.leadId, e]));

  const stageBreakdown: Record<string, number> = {};
  const hotLeads = [];
  for (const lead of allLeads) {
    stageBreakdown[lead.stage] = (stageBreakdown[lead.stage] ?? 0) + 1;
    const e = enrichMap[lead.id];
    const score = e?.score ?? 0;
    if (score >= 70) hotLeads.push({
      id: lead.id, name: lead.name, company: lead.company, country: lead.country,
      email: lead.email, stage: lead.stage, score,
      scoreLabel: getScoreLabel(score),
      createdAt: lead.createdAt.toISOString(),
    });
  }

  // Email stats (last 30 days)
  const since30 = new Date(Date.now() - 30 * 86_400_000);
  const emailLogs = await db.select().from(emailLogsTable).where(gte(emailLogsTable.createdAt, since30));
  const totalEmails = emailLogs.length;
  const sentEmails = emailLogs.filter(e => e.status === "sent" || e.status === "simulated").length;
  const failedEmails = emailLogs.filter(e => e.status === "failed").length;

  // Pending reminders
  const pendingReminders = await db.select().from(remindersTable).where(eq(remindersTable.status, "pending"));

  res.json({
    totalLeads: allLeads.length,
    hotLeads: hotLeads.slice(0, 10),
    hotLeadsCount: hotLeads.length,
    warmLeadsCount: allLeads.filter(l => { const s = enrichMap[l.id]?.score ?? 0; return s >= 40 && s < 70; }).length,
    stageBreakdown,
    emails: {
      total: totalEmails,
      sent: sentEmails,
      failed: failedEmails,
      successRate: totalEmails > 0 ? Math.round((sentEmails / totalEmails) * 100) : 0,
    },
    pendingRemindersCount: pendingReminders.length,
    recentEmails: emailLogs.slice(0, 5).map(e => ({
      ...e, createdAt: e.createdAt.toISOString(),
    })),
  });
});

export default router;
