import { db, emailTemplatesTable, emailLogsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

function renderTemplate(template: string, data: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] ?? `{{${key}}}`);
}

interface SendEmailOptions {
  to: string;
  templateId?: string;
  subject?: string;
  body?: string;
  data?: Record<string, string>;
  leadId?: string;
}

export async function sendEmail(opts: SendEmailOptions): Promise<{ success: boolean; status: string; error?: string }> {
  const { to, templateId, leadId, data = {} } = opts;

  let subject = opts.subject ?? "";
  let body = opts.body ?? "";

  // Load template if provided
  if (templateId) {
    const [tmpl] = await db.select().from(emailTemplatesTable).where(eq(emailTemplatesTable.id, templateId));
    if (tmpl) {
      subject = renderTemplate(tmpl.subject, data);
      body = renderTemplate(tmpl.body, data);
    }
  }

  // Render subject/body variables
  subject = renderTemplate(subject, data);
  body = renderTemplate(body, data);

  let status: string;
  let error: string | undefined;

  // Try real SMTP if configured
  const smtpHost = process.env["SMTP_HOST"];
  const smtpUser = process.env["SMTP_USER"];
  const smtpPass = process.env["SMTP_PASS"];
  const smtpFrom = process.env["SMTP_FROM"] ?? smtpUser ?? "noreply@vanilla-erp.mg";

  if (smtpHost && smtpUser && smtpPass) {
    try {
      const nodemailer = await import("nodemailer");
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: Number(process.env["SMTP_PORT"] ?? 587),
        secure: process.env["SMTP_SECURE"] === "true",
        auth: { user: smtpUser, pass: smtpPass },
      });
      await transporter.sendMail({ from: smtpFrom, to, subject, html: body.replace(/\n/g, "<br>") });
      status = "sent";
      logger.info({ to, subject }, "Email sent successfully");
    } catch (err: any) {
      status = "failed";
      error = err?.message ?? "SMTP error";
      logger.warn({ to, subject, error }, "Email failed to send");
    }
  } else {
    // Simulate (no SMTP configured) — log only
    status = "simulated";
    logger.info({ to, subject, body }, "Email simulated (no SMTP configured)");
  }

  // Log to DB
  await db.insert(emailLogsTable).values({
    to, subject, templateId: templateId ?? null,
    leadId: leadId ?? null, status, error: error ?? null,
  });

  return { success: status !== "failed", status, error };
}

export async function getEmailTemplates() {
  return db.select().from(emailTemplatesTable).orderBy(emailTemplatesTable.createdAt);
}
