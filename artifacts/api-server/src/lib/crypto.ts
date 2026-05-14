import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

const ALGORITHM = "aes-256-cbc";

function getKey(): Buffer {
  const raw = process.env["ENCRYPTION_KEY"] ?? process.env["SESSION_SECRET"] ?? "vanilla-erp-default-key-change-in-prod";
  return createHash("sha256").update(raw).digest();
}

export function encrypt(text: string): string {
  const key = getKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

export function decrypt(encryptedText: string): string {
  const key = getKey();
  const [ivHex, dataHex] = encryptedText.split(":");
  if (!ivHex || !dataHex) throw new Error("Invalid encrypted format");
  const iv = Buffer.from(ivHex, "hex");
  const data = Buffer.from(dataHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function encryptIfNeeded(text: string | null | undefined): string | null {
  if (!text) return null;
  try { return encrypt(text); } catch { return text; }
}

export function decryptIfNeeded(text: string | null | undefined): string | null {
  if (!text) return null;
  try { return decrypt(text); } catch { return text; }
}
