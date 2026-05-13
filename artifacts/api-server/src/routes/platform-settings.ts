/**
 * Platform settings routes — ERP configuration
 *
 *   GET   /api/platform-settings            — all settings (grouped by category)
 *   GET   /api/platform-settings/:key       — single setting
 *   PATCH /api/platform-settings            — bulk update { key: value, ... }
 *   POST  /api/platform-settings/logo       — upload logo → updates logo_url setting
 */
import { Router, type IRouter } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { eq } from "drizzle-orm";
import { db, platformSettingsTable, companySettingsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { requireRole, ROLES } from "../middlewares/roles";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const superAdmin = requireRole(ROLES.SUPER_ADMIN);

// Reuse upload dir from company settings
const uploadDir = path.join(process.cwd(), "uploads", "logo");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `logo${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [".png", ".jpg", ".jpeg", ".webp", ".svg"];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error("Format non supporté — PNG, JPG, WEBP, SVG uniquement"));
  },
});

// GET all settings
router.get("/platform-settings", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db.select().from(platformSettingsTable).orderBy(platformSettingsTable.category, platformSettingsTable.label);
  // Group by category
  const grouped: Record<string, typeof rows> = {};
  for (const row of rows) {
    if (!grouped[row.category]) grouped[row.category] = [];
    grouped[row.category].push(row);
  }
  res.json({ settings: rows, grouped });
});

// GET single setting
router.get("/platform-settings/:key", requireAuth, async (req, res): Promise<void> => {
  const [row] = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.settingKey, String(req.params.key)));
  if (!row) { res.status(404).json({ error: "Paramètre introuvable" }); return; }
  res.json(row);
});

// PATCH bulk update { key: value, ... }
router.patch("/platform-settings", requireAuth, superAdmin, async (req, res): Promise<void> => {
  const updates = req.body as Record<string, string>;
  if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
    res.status(400).json({ error: "Body doit être un objet { key: value }" });
    return;
  }

  const updatedKeys: string[] = [];
  for (const [key, value] of Object.entries(updates)) {
    const result = await db
      .update(platformSettingsTable)
      .set({ settingValue: String(value ?? ""), updatedAt: new Date() })
      .where(eq(platformSettingsTable.settingKey, key))
      .returning({ id: platformSettingsTable.id });
    if (result.length > 0) updatedKeys.push(key);
  }

  // Sync company_settings when relevant branding keys change
  const syncMap: Record<string, string> = {
    company_name: "companyName",
    company_email: "email",
    company_phone: "phone",
    company_address: "address",
    company_city: "city",
    company_country: "country",
    company_nif: "taxId",
    company_stat: "statNumber",
    company_rcs: "rcsNumber",
    default_currency: "currency",
    logo_url: "logoUrl",
  };
  const syncData: Record<string, string> = {};
  for (const key of updatedKeys) {
    if (syncMap[key]) syncData[syncMap[key]] = updates[key];
  }
  if (Object.keys(syncData).length > 0) {
    const [existing] = await db.select({ id: companySettingsTable.id }).from(companySettingsTable).limit(1);
    if (existing) {
      await db.update(companySettingsTable).set({ ...syncData, updatedAt: new Date() } as any).where(eq(companySettingsTable.id, existing.id));
    }
  }

  logger.info({ updatedKeys }, "Platform settings updated");
  res.json({ success: true, updatedKeys });
});

// POST /api/platform-settings/logo — upload logo
router.post(
  "/platform-settings/logo",
  requireAuth,
  superAdmin,
  upload.single("logo"),
  async (req, res): Promise<void> => {
    if (!req.file) { res.status(400).json({ error: "Aucun fichier fourni" }); return; }

    const logoUrl = `/api/uploads/logo/${req.file.filename}`;

    // Update platform_settings
    await db.update(platformSettingsTable)
      .set({ settingValue: logoUrl, updatedAt: new Date() })
      .where(eq(platformSettingsTable.settingKey, "logo_url"));

    // Sync company_settings
    const [existing] = await db.select({ id: companySettingsTable.id }).from(companySettingsTable).limit(1);
    if (existing) {
      await db.update(companySettingsTable).set({ logoUrl, updatedAt: new Date() }).where(eq(companySettingsTable.id, existing.id));
    } else {
      await db.insert(companySettingsTable).values({ companyName: "Vanilla Madagascar Export", logoUrl, country: "Madagascar", currency: "MGA" });
    }

    logger.info({ logoUrl }, "Platform logo uploaded");
    res.json({ logoUrl });
  },
);

export default router;
