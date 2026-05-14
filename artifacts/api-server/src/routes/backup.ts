import { Router, type IRouter } from "express";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import os from "os";
import multer from "multer";
import AdmZip from "adm-zip";
import { requireAuth } from "../middlewares/auth";
import { loadUser } from "../middlewares/roles";

const execFileAsync = promisify(execFile);
const BACKUP_DIR = path.join(process.cwd(), "..", "..", "backups");

// ─── Only DSI and SUPER_ADMIN may touch backups ───────────────────────────────
const BACKUP_ROLES = ["SUPER_ADMIN", "DSI"];

const router: IRouter = Router();

function requireBackupRole(req: any, res: any, next: any) {
  if (!BACKUP_ROLES.includes(req.currentUser?.role)) {
    res.status(403).json({ error: "Accès réservé au DSI et au Super Admin" });
    return;
  }
  next();
}

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function parseDbUrl(url: string) {
  try {
    const u = new URL(url);
    return {
      host: u.hostname, port: u.port || "5432",
      user: u.username, password: u.password,
      database: u.pathname.replace(/^\//, ""),
    };
  } catch { return null; }
}

// Upload storage — memory buffer (ZIP files, max 200 MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/zip" || file.originalname.endsWith(".zip")) {
      cb(null, true);
    } else {
      cb(new Error("Seuls les fichiers .zip sont acceptés"));
    }
  },
});

// ─── List backups ─────────────────────────────────────────────────────────────
router.get("/admin/backup/list", requireAuth, loadUser, requireBackupRole, (req, res): void => {
  ensureBackupDir();
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith(".zip"))
      .map(f => {
        const stat = fs.statSync(path.join(BACKUP_DIR, f));
        return { filename: f, size: stat.size, createdAt: stat.mtime.toISOString() };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    res.json(files);
  } catch {
    res.json([]);
  }
});

// ─── Create backup (ZIP containing SQL dump + metadata) ───────────────────────
router.post("/admin/backup/create", requireAuth, loadUser, requireBackupRole, async (req, res): Promise<void> => {
  ensureBackupDir();
  const dbUrl = process.env["DATABASE_URL"];
  if (!dbUrl) { res.status(500).json({ error: "DATABASE_URL non configuré" }); return; }

  const db = parseDbUrl(dbUrl);
  if (!db) { res.status(500).json({ error: "URL base de données invalide" }); return; }

  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const sqlFilename = `backup_${stamp}.sql`;
  const zipFilename = `backup_${stamp}.zip`;
  const tmpSqlPath = path.join(os.tmpdir(), sqlFilename);
  const zipPath = path.join(BACKUP_DIR, zipFilename);

  try {
    // 1 — Dump SQL to a temp file
    const env = { ...process.env, PGPASSWORD: db.password };
    await execFileAsync("pg_dump", [
      "-h", db.host, "-p", db.port, "-U", db.user, "-d", db.database,
      "--no-password", "--format=plain", `--file=${tmpSqlPath}`,
    ], { env });

    // 2 — Build metadata JSON
    const meta = {
      createdAt: now.toISOString(),
      createdBy: req.currentUser?.email ?? "unknown",
      database: db.database,
      host: db.host,
      sqlFile: sqlFilename,
    };

    // 3 — Pack into ZIP using AdmZip
    const zip = new AdmZip();
    zip.addLocalFile(tmpSqlPath, "", sqlFilename);
    zip.addFile("metadata.json", Buffer.from(JSON.stringify(meta, null, 2), "utf8"));
    zip.writeZip(zipPath);

    // 4 — Cleanup temp SQL
    fs.unlinkSync(tmpSqlPath);

    const stat = fs.statSync(zipPath);
    req.log.info({ filename: zipFilename, size: stat.size, by: req.currentUser?.id }, "Database backup (ZIP) created");
    res.json({ success: true, filename: zipFilename, size: stat.size, createdAt: now.toISOString() });
  } catch (err: any) {
    // Cleanup on error
    if (fs.existsSync(tmpSqlPath)) try { fs.unlinkSync(tmpSqlPath); } catch {}
    if (fs.existsSync(zipPath)) try { fs.unlinkSync(zipPath); } catch {}
    req.log.error({ err }, "Backup ZIP creation failed");
    res.status(500).json({ error: `Échec backup : ${err.message}` });
  }
});

// ─── Upload a ZIP backup ──────────────────────────────────────────────────────
router.post(
  "/admin/backup/upload",
  requireAuth, loadUser, requireBackupRole,
  upload.single("backup"),
  async (req, res): Promise<void> => {
    if (!req.file) { res.status(400).json({ error: "Aucun fichier reçu" }); return; }
    ensureBackupDir();

    try {
      // Validate ZIP structure
      const zip = new AdmZip(req.file.buffer);
      const entries = zip.getEntries();
      const sqlEntry = entries.find(e => e.entryName.endsWith(".sql"));
      if (!sqlEntry) {
        res.status(400).json({ error: "Le ZIP doit contenir un fichier .sql" });
        return;
      }

      // Save ZIP with a unique name if original conflicts
      let destFilename = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      if (!destFilename.endsWith(".zip")) destFilename += ".zip";

      // Avoid overwriting an existing file
      let destPath = path.join(BACKUP_DIR, destFilename);
      if (fs.existsSync(destPath)) {
        const stem = destFilename.replace(/\.zip$/, "");
        destFilename = `${stem}_import_${Date.now()}.zip`;
        destPath = path.join(BACKUP_DIR, destFilename);
      }

      fs.writeFileSync(destPath, req.file.buffer);
      const stat = fs.statSync(destPath);

      req.log.info({ filename: destFilename, size: stat.size, by: req.currentUser?.id }, "Backup ZIP uploaded");
      res.json({
        success: true,
        filename: destFilename,
        size: stat.size,
        createdAt: new Date().toISOString(),
        sqlFile: sqlEntry.entryName,
      });
    } catch (err: any) {
      req.log.error({ err }, "Backup ZIP upload failed");
      res.status(400).json({ error: `ZIP invalide : ${err.message}` });
    }
  }
);

// ─── Download backup ──────────────────────────────────────────────────────────
router.get("/admin/backup/download/:filename", requireAuth, loadUser, requireBackupRole, (req, res): void => {
  const filename = String(req.params.filename).replace(/[^a-zA-Z0-9._-]/g, "");
  const filePath = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(filePath)) { res.status(404).json({ error: "Fichier introuvable" }); return; }
  req.log.info({ filename, by: req.currentUser?.id }, "Backup downloaded");
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.download(filePath, filename);
});

// ─── Delete backup ────────────────────────────────────────────────────────────
router.delete("/admin/backup/:filename", requireAuth, loadUser, requireBackupRole, (req, res): void => {
  const filename = String(req.params.filename).replace(/[^a-zA-Z0-9._-]/g, "");
  const filePath = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(filePath)) { res.status(404).json({ error: "Fichier introuvable" }); return; }
  fs.unlinkSync(filePath);
  req.log.info({ filename, by: req.currentUser?.id }, "Backup deleted");
  res.json({ success: true });
});

export default router;
