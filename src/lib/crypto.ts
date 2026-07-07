import crypto from "node:crypto";

/**
 * AES-256-GCM for secret settings at rest, so a stolen sqlite file alone doesn't
 * leak the GitHub App key / Shopify token. The key is derived from
 * SETTINGS_ENCRYPTION_KEY (preferred) or NEXTAUTH_SECRET via scrypt.
 */
function key(): Buffer {
  const material = process.env.SETTINGS_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET;
  if (!material) {
    throw new Error("Set SETTINGS_ENCRYPTION_KEY (or NEXTAUTH_SECRET) to store secrets.");
  }
  // Fixed salt: this protects data at rest; the material is already high-entropy.
  return crypto.scryptSync(material, "publish-console.settings.v1", 32);
}

const PREFIX = "enc:v1:";

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ct]).toString("base64");
}

export function decryptSecret(stored: string): string {
  if (!stored.startsWith(PREFIX)) return stored; // tolerate legacy/plain values
  const raw = Buffer.from(stored.slice(PREFIX.length), "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ct = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

export function isEncrypted(stored: string): boolean {
  return stored.startsWith(PREFIX);
}
