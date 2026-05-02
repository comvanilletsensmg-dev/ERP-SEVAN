import app from "./app";
import { logger } from "./lib/logger";
import { seedDatabase } from "./lib/seed";
import { checkOverdueInvoices } from "./routes/crm-reminders";
import { recalcAllLotRisks } from "./lib/lot-risk-cron";

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

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
