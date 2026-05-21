import "server-only";
import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  type CipherGCM,
  type DecipherGCM,
} from "crypto";

/**
 * AES-256-GCM encryption for integration credentials.
 *
 * Output format (base64): [12-byte IV][16-byte auth tag][ciphertext]
 *
 * Operational notes:
 *   - The key MUST be 32 bytes, base64-encoded in INTEGRATION_ENCRYPTION_KEY.
 *     Generate with `openssl rand -base64 32`.
 *   - Losing the key = every stored credential is unrecoverable. Treat it
 *     with the same care as SUPABASE_SERVICE_ROLE_KEY.
 *   - Rotation: when you eventually rotate this key, you'll need a one-time
 *     migration that decrypts with the old key and re-encrypts with the new
 *     one. Punt until needed.
 */

function getKey(): Buffer {
  const raw = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "INTEGRATION_ENCRYPTION_KEY is not set. Generate with `openssl rand -base64 32`."
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      `INTEGRATION_ENCRYPTION_KEY must decode to 32 bytes (got ${key.length}). Regenerate with openssl.`
    );
  }
  return key;
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv) as CipherGCM;
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64");
}

export function decrypt(b64: string): string {
  const key = getKey();
  const buf = Buffer.from(b64, "base64");
  if (buf.length < 28) {
    throw new Error("Ciphertext is too short — corrupted or wrong format?");
  }
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv) as DecipherGCM;
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString(
    "utf8"
  );
}
