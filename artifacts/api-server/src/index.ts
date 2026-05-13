import app from "./app";
import { logger } from "./lib/logger";
import { seedDatabase } from "./lib/seed";
import { checkOverdueInvoices } from "./routes/crm-reminders";
import { recalcAllLotRisks } from "./lib/lot-risk-cron";
import { runAiPredictions } from "./lib/ai/predict-cron";
import { runMonthlyPayroll } from "./lib/payroll-cron";
import { seedRolePermissions } from "./routes/users";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

seedDatabase().catch((err) => {
  logger.error({ err }, "Failed to seed database");
});

seedRolePermissions().catch((err) => {
  logger.error({ err }, "Failed to seed role permissions");
});

// Daily cron: check overdue invoices and create reminders
const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
setInterval(() => {
  checkOverdueInvoices()
    .then(r => { if (r.created > 0) logger.info(r, "Cron: created overdue reminders"); })
    .catch(err => logger.error({ err }, "Cron: failed to check overdue invoices"));
}, TWENTY_FOUR_HOURS);

// Daily cron: recalc lot risk + auto-block HIGH risk lots
setInterval(() => {
  recalcAllLotRisks()
    .then(r => logger.info(r, "Cron: recalculated lot risks"))
    .catch(err => logger.error({ err }, "Cron: failed to recalculate lot risks"));
}, TWENTY_FOUR_HOURS);

// Run once at startup (after a small delay to let DB warm up)
setTimeout(() => {
  recalcAllLotRisks()
    .then(r => logger.info(r, "Startup: lot risk recalc complete"))
    .catch(err => logger.error({ err }, "Startup: lot risk recalc failed"));
}, 5000);

// Daily AI cron: recompute predictions + create RiskEvents for HIGH risk lots
setInterval(() => {
  runAiPredictions()
    .then(r => logger.info(r, "Cron: AI predictions complete"))
    .catch(err => logger.error({ err }, "Cron: AI predictions failed"));
}, TWENTY_FOUR_HOURS);

// Run AI predictions once at startup (after risk recalc)
setTimeout(() => {
  runAiPredictions()
    .then(r => logger.info(r, "Startup: AI predictions complete"))
    .catch(err => logger.error({ err }, "Startup: AI predictions failed"));
}, 8000);

// Monthly payroll cron: runs at startup if today is the 1st, then checks daily
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
function scheduleMonthlyPayroll() {
  const now = new Date();
  if (now.getDate() === 1 && now.getHours() < 6) {
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    runMonthlyPayroll(month)
      .then(r => logger.info(r, "Monthly cron: payroll batch complete"))
      .catch(err => logger.error({ err }, "Monthly cron: payroll batch failed"));
  }
}
setTimeout(scheduleMonthlyPayroll, 12_000);
setInterval(scheduleMonthlyPayroll, ONE_DAY_MS);

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
