import { Router, type IRouter } from "express";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import { requireAuth } from "../middlewares/auth";
import { loadUser } from "../middlewares/roles";

const execFileAsync = promisify(execFile);
const BACKUP_DIR = path.join(process.cwd(), "..", "..", "backups");
const ADMIN_ROLES = ["SUPER_ADMIN", "ADMIN", "DG", "DGA"];

const router: IRouter = Router();

function requireAdmin(req: any, res: any, next: any) {
  if (!ADMIN_ROLES.includes(req.currentUser?.role)) {
    res.status(403).json({ error: "Accès réservé aux administrateurs" });
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

// ─── List backups ─────────────────────────────────────────────────────────────
router.get("/admin/backup/list", requireAuth, loadUser, requireAdmin, (req, res): void => {
  ensureBackupDir();
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith(".sql") || f.endsWith(".sql.gz"))
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

// ─── Create backup ────────────────────────────────────────────────────────────
router.post("/admin/backup/create", requireAuth, loadUser, requireAdmin, async (req, res): Promise<void> => {
  ensureBackupDir();
  const dbUrl = process.env["DATABASE_URL"];
  if (!dbUrl) { res.status(500).json({ error: "DATABASE_URL non configuré" }); return; }

  const db = parseDbUrl(dbUrl);
  if (!db) { res.status(500).json({ error: "URL base de données invalide" }); return; }

  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `backup_${stamp}.sql`;
  const filePath = path.join(BACKUP_DIR, filename);

  try {
    const env = { ...process.env, PGPASSWORD: db.password };
    await execFileAsync("pg_dump", [
      "-h", db.host, "-p", db.port, "-U", db.user, "-d", db.database,
      "--no-password", "--format=plain", `--file=${filePath}`,
    ], { env });

    const stat = fs.statSync(filePath);
    req.log.info({ filename, size: stat.size, by: req.currentUser?.id }, "Database backup created");
    res.json({ success: true, filename, size: stat.size, createdAt: now.toISOString() });
  } catch (err: any) {
    req.log.error({ err }, "Backup creation failed");
    res.status(500).json({ error: `Échec backup : ${err.message}` });
  }
});

// ─── Download backup ──────────────────────────────────────────────────────────
router.get("/admin/backup/download/:filename", requireAuth, loadUser, requireAdmin, (req, res): void => {
  const filename = String(req.params.filename).replace(/[^a-zA-Z0-9._-]/g, "");
  const filePath = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(filePath)) { res.status(404).json({ error: "Fichier introuvable" }); return; }
  req.log.info({ filename, by: req.currentUser?.id }, "Backup downloaded");
  res.download(filePath, filename);
});

// ─── Delete backup ────────────────────────────────────────────────────────────
router.delete("/admin/backup/:filename", requireAuth, loadUser, requireAdmin, (req, res): void => {
  const filename = String(req.params.filename).replace(/[^a-zA-Z0-9._-]/g, "");
  const filePath = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(filePath)) { res.status(404).json({ error: "Fichier introuvable" }); return; }
  fs.unlinkSync(filePath);
  req.log.info({ filename, by: req.currentUser?.id }, "Backup deleted");
  res.json({ success: true });
});

export default router;
