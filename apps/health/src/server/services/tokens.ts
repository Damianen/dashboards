// Encrypted storage for rotating OAuth tokens (Withings, Oura). Tokens live
// AES-256-GCM-encrypted in the oauth_tokens table (CLAUDE.md guardrail): never in
// env, never logged. The decrypted form leaves this service only as the return
// value of getTokens() — handed straight to the integration client, nothing else.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { OauthProvider } from "@/generated/prisma/client";
import { prisma } from "@/server/db";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12; // 96-bit nonce, the GCM standard
const KEY_BYTES = 32; // AES-256

/**
 * The encryption key: 32 raw bytes base64-decoded from TOKEN_ENCRYPTION_KEY. Read
 * lazily (not at module load) so a missing key only fails an actual crypto call and
 * tests can stub the env. Throws if absent or not exactly 32 bytes.
 */
function key(): Buffer {
  const b64 = process.env.TOKEN_ENCRYPTION_KEY;
  if (!b64) throw new Error("TOKEN_ENCRYPTION_KEY is not set");
  const buf = Buffer.from(b64, "base64");
  if (buf.length !== KEY_BYTES) {
    throw new Error(
      `TOKEN_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes, got ${buf.length}`,
    );
  }
  return buf;
}

/**
 * Encrypt with a fresh random IV. Output is "iv.ciphertext.tag", each part base64.
 * The 128-bit GCM auth tag binds the ciphertext: any later tampering fails decrypt().
 */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [iv, ciphertext, tag].map((b) => b.toString("base64")).join(".");
}

/**
 * Reverse of encrypt(). A tampered tag or ciphertext (or a wrong key) makes final()
 * throw on GCM verification — we surface that, never returning unauthenticated bytes.
 */
export function decrypt(payload: string): string {
  const [ivB64, ctB64, tagB64] = payload.split(".");
  if (!ivB64 || !ctB64 || !tagB64) {
    throw new Error("malformed token payload");
  }
  const decipher = createDecipheriv(ALGO, key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** The decrypted token set for a provider, as the integration client consumes it. */
export interface OauthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope: string | null;
}

/**
 * A stored token exists but can't be decrypted (rotated TOKEN_ENCRYPTION_KEY, corrupted
 * row) — only reconnecting the provider can fix it. Syncs map this to their stable
 * re-auth marker so Settings shows "Reconnect" instead of an opaque crypto error.
 */
export class ReauthRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReauthRequiredError";
  }
}

/** The stored token set for `provider`, decrypted, or null if not connected. */
export async function getTokens(
  provider: OauthProvider,
): Promise<OauthTokens | null> {
  const row = await prisma.oauthToken.findUnique({ where: { provider } });
  if (!row) return null;
  // A missing/malformed TOKEN_ENCRYPTION_KEY is a config error, not a re-auth case —
  // surface it as-is before touching the row's ciphertext.
  key();
  try {
    return {
      accessToken: decrypt(row.accessTokenEnc),
      refreshToken: decrypt(row.refreshTokenEnc),
      expiresAt: row.expiresAt,
      scope: row.scope,
    };
  } catch {
    throw new ReauthRequiredError(
      `stored ${provider} tokens cannot be decrypted (encryption key changed?) — reconnect in Settings`,
    );
  }
}

/**
 * Upsert the encrypted token set for `provider` (one row per provider, keyed on the
 * model's @id). Both tokens are re-encrypted with a fresh IV on every write. Withings
 * refresh tokens are single-use — the caller persists the rotated pair here BEFORE
 * spending the new access token.
 */
export async function saveTokens(
  provider: OauthProvider,
  tokens: OauthTokens,
): Promise<void> {
  const accessTokenEnc = encrypt(tokens.accessToken);
  const refreshTokenEnc = encrypt(tokens.refreshToken);
  const fields = {
    accessTokenEnc,
    refreshTokenEnc,
    expiresAt: tokens.expiresAt,
    scope: tokens.scope,
  };
  await prisma.oauthToken.upsert({
    where: { provider },
    create: { provider, ...fields },
    update: fields,
  });
}
