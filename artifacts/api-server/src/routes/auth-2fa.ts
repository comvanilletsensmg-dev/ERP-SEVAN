import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { TOTP } from "otplib";
import QRCode from "qrcode";
import { requireAuth } from "../middlewares/auth";
import { loadUser } from "../middlewares/roles";
import { encrypt, decrypt } from "../lib/crypto";

const router: IRouter = Router();
const APP_NAME = "Vanilla ERP";

const emailOtpStore = new Map<string, { code: string; expiresAt: number }>();

function generateEmailOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

const totp = new TOTP();

async function verifyTotp(token: string, secret: string): Promise<boolean> {
  const result = await totp.verify(token, { secret });
  return result.valid;
}

async function buildOtpauthUrl(email: string, secret: string): Promise<string> {
  return totp.toURI({ label: email, secret, issuer: APP_NAME });
}

// ─── Current user 2FA status ──────────────────────────────────────────────────
router.get("/auth/2fa/status", requireAuth, loadUser, async (req, res): Promise<void> => {
  const user = req.currentUser;
  res.json({
    enabled: !!(user as any).twoFactorEnabled,
    method: (user as any).twoFactorMethod ?? null,
  });
});

// ─── Generate TOTP setup (QR code) ───────────────────────────────────────────
router.post("/auth/2fa/setup", requireAuth, loadUser, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  const secret = totp.generateSecret();
  const otpauthUrl = await buildOtpauthUrl(user.email, secret);
  const qrCode = await QRCode.toDataURL(otpauthUrl);

  await db.update(usersTable)
    .set({ twoFactorSecret: encrypt(secret), twoFactorMethod: "totp" })
    .where(eq(usersTable.id, user.id));

  req.log.info({ userId: user.id }, "2FA setup initiated");
  res.json({ secret, qrCode, otpauthUrl });
});

// ─── Enable 2FA (verify code before enabling) ─────────────────────────────────
router.post("/auth/2fa/enable", requireAuth, loadUser, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  const { code } = req.body as { code: string };

  const [dbUser] = await db.select().from(usersTable).where(eq(usersTable.id, user.id));
  if (!dbUser?.twoFactorSecret) {
    res.status(400).json({ error: "Lance d'abord la configuration 2FA" });
    return;
  }

  const secret = decrypt(dbUser.twoFactorSecret);
  if (!(await verifyTotp(code, secret))) {
    res.status(401).json({ error: "Code invalide. Vérifie l'heure de ton appareil." });
    return;
  }

  await db.update(usersTable)
    .set({ twoFactorEnabled: true })
    .where(eq(usersTable.id, user.id));

  req.log.info({ userId: user.id }, "2FA enabled");
  res.json({ success: true });
});

// ─── Disable 2FA ──────────────────────────────────────────────────────────────
router.post("/auth/2fa/disable", requireAuth, loadUser, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  const { code } = req.body as { code: string };

  const [dbUser] = await db.select().from(usersTable).where(eq(usersTable.id, user.id));
  if (!dbUser?.twoFactorEnabled) {
    res.status(400).json({ error: "La 2FA n'est pas activée" }); return;
  }

  if (dbUser.twoFactorSecret && dbUser.twoFactorMethod === "totp") {
    const secret = decrypt(dbUser.twoFactorSecret);
    if (!(await verifyTotp(code, secret))) { res.status(401).json({ error: "Code invalide" }); return; }
  }

  await db.update(usersTable)
    .set({ twoFactorEnabled: false, twoFactorSecret: null })
    .where(eq(usersTable.id, user.id));

  req.log.info({ userId: user.id }, "2FA disabled");
  res.json({ success: true });
});

// ─── Verify code during login (session has pending2faUserId) ─────────────────
router.post("/auth/2fa/verify", async (req, res): Promise<void> => {
  const pendingUserId = (req.session as any)?.pending2faUserId;
  if (!pendingUserId) {
    res.status(401).json({ error: "Pas de session 2FA en attente" }); return;
  }

  const { code } = req.body as { code: string };
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, pendingUserId));
  if (!user) { res.status(401).json({ error: "Utilisateur introuvable" }); return; }

  let isValid = false;

  if (user.twoFactorMethod === "email") {
    const stored = emailOtpStore.get(user.id);
    if (stored && stored.code === code && Date.now() < stored.expiresAt) {
      isValid = true;
      emailOtpStore.delete(user.id);
    }
  } else {
    if (!user.twoFactorSecret) { res.status(500).json({ error: "Secret 2FA manquant" }); return; }
    const secret = decrypt(user.twoFactorSecret);
    isValid = await verifyTotp(code, secret);
  }

  if (!isValid) {
    res.status(401).json({ error: "Code invalide ou expiré" }); return;
  }

  (req.session as any).pending2faUserId = undefined;
  (req.session as any).userId = user.id;

  res.json({
    user: { id: user.id, email: user.email, name: user.name ?? null, role: user.role, createdAt: user.createdAt.toISOString() },
  });
});

// ─── Send email OTP ───────────────────────────────────────────────────────────
router.post("/auth/2fa/email-otp/send", async (req, res): Promise<void> => {
  const pendingUserId = (req.session as any)?.pending2faUserId;
  if (!pendingUserId) { res.status(401).json({ error: "Pas de session 2FA en attente" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, pendingUserId));
  if (!user) { res.status(401).json({ error: "Utilisateur introuvable" }); return; }

  const code = generateEmailOtp();
  emailOtpStore.set(user.id, { code, expiresAt: Date.now() + 10 * 60 * 1000 });

  try {
    const { sendEmail } = await import("../services/email");
    await sendEmail({
      to: user.email,
      subject: "Code de vérification — Vanilla ERP",
      body: `<p>Votre code de connexion :</p><p style="font-size:32px;font-weight:bold;letter-spacing:6px;font-family:monospace">${code}</p><p>Ce code expire dans <strong>10 minutes</strong>.</p>`,
    });
    res.json({ success: true, message: `Code envoyé à ${user.email}` });
  } catch {
    req.log.warn({ devCode: process.env["NODE_ENV"] !== "production" ? code : undefined }, "Email OTP — envoi email échoué");
    res.json({ success: true, message: "Code généré (email non configuré en dev)" });
  }
});

// ─── Admin: get all users 2FA status ─────────────────────────────────────────
router.get("/admin/security/2fa-status", requireAuth, loadUser, async (req, res): Promise<void> => {
  const users = await db.select({
    id: usersTable.id,
    name: usersTable.name,
    email: usersTable.email,
    role: usersTable.role,
    twoFactorEnabled: usersTable.twoFactorEnabled,
    twoFactorMethod: usersTable.twoFactorMethod,
  }).from(usersTable);

  res.json(users.map(u => ({
    ...u,
    name: u.name ?? u.email,
    twoFactorEnabled: u.twoFactorEnabled ?? false,
    twoFactorMethod: u.twoFactorMethod ?? null,
  })));
});

export { emailOtpStore };
export default router;
