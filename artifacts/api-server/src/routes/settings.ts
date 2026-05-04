/**
 * Company settings routes
 *
 *   GET  /api/settings         — get company settings
 *   POST /api/settings         — upsert company settings (SUPER_ADMIN)
 *   POST /api/settings/logo    — upload company logo (SUPER_ADMIN)
 */
import { Router, type IRouter } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, companySettingsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { requireRole, ROLES } from "../middlewares/roles";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const superAdmin = requireRole(ROLES.SUPER_ADMIN);

// Ensure upload dir exists
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
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter: (_req, file, cb) => {
    const allowed = [".png", ".jpg", ".jpeg", ".webp", ".svg"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error("Format non supporté — PNG, JPG, WEBP, SVG uniquement"));
  },
});

const SettingsSchema = z.object({
  companyName: z.string().min(1, "Nom requis"),
  email: z.string().email("Email invalide").optional().or(z.literal("")),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().default("Madagascar"),
  taxId: z.string().optional(),
  statNumber: z.string().optional(),
  rcsNumber: z.string().optional(),
  currency: z.enum(["MGA", "USD", "EUR"]).default("MGA"),
});

router.get("/settings", requireAuth, async (req, res): Promise<void> => {
  const [row] = await db.select().from(companySettingsTable).limit(1);
  if (!row) {
    res.json(null);
    return;
  }
  res.json(row);
});

router.post("/settings", requireAuth, superAdmin, async (req, res): Promise<void> => {
  const parsed = SettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Données invalides" });
    return;
  }

  const data = parsed.data;
  const [existing] = await db.select({ id: companySettingsTable.id }).from(companySettingsTable).limit(1);

  if (existing) {
    const [updated] = await db
      .update(companySettingsTable)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(companySettingsTable.id, existing.id))
      .returning();
    logger.info({ id: updated.id }, "Company settings updated");
    res.json(updated);
  } else {
    const [created] = await db.insert(companySettingsTable).values(data).returning();
    logger.info({ id: created.id }, "Company settings created");
    res.status(201).json(created);
  }
});

router.post(
  "/settings/logo",
  requireAuth,
  superAdmin,
  upload.single("logo"),
  async (req, res): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: "Aucun fichier fourni" });
      return;
    }

    const logoUrl = `/uploads/logo/${req.file.filename}`;

    const [existing] = await db.select({ id: companySettingsTable.id }).from(companySettingsTable).limit(1);
    if (existing) {
      await db
        .update(companySettingsTable)
        .set({ logoUrl, updatedAt: new Date() })
        .where(eq(companySettingsTable.id, existing.id));
    } else {
      await db.insert(companySettingsTable).values({
        companyName: "Vanilla Madagascar Export",
        logoUrl,
        country: "Madagascar",
        currency: "MGA",
      });
    }

    logger.info({ logoUrl }, "Company logo uploaded");
    res.json({ logoUrl });
  },
);

export default router;
