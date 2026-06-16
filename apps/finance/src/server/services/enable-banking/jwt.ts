import { readFile } from "node:fs/promises";

import { importPKCS8, SignJWT } from "jose";

import { ebConfig } from "./config";

// EB authenticates every request with an RS256 JWT signed by the application's
// private key. Header { typ, alg, kid=app id }; claims iss/aud fixed by EB,
// exp ≤ 24h. We mint a 1h token and cache it until ~1 min before expiry.

const ALG = "RS256";
const TOKEN_TTL_SECONDS = 3600;
const REFRESH_SKEW_SECONDS = 60;

let cached: { token: string; expEpoch: number } | null = null;

async function loadPrivateKey() {
  const { keyPath } = ebConfig();
  if (!keyPath) throw new Error("EB_PRIVATE_KEY_PATH is not set");
  const pem = await readFile(keyPath, "utf8");
  return importPKCS8(pem, ALG);
}

/** A signed EB JWT, cached across calls until just before it expires. */
export async function getJwt(now: Date = new Date()): Promise<string> {
  const nowEpoch = Math.floor(now.getTime() / 1000);
  if (cached && cached.expEpoch - REFRESH_SKEW_SECONDS > nowEpoch) {
    return cached.token;
  }

  const { appId } = ebConfig();
  if (!appId) throw new Error("EB_APP_ID is not set");

  const key = await loadPrivateKey();
  const exp = nowEpoch + TOKEN_TTL_SECONDS;
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: ALG, kid: appId, typ: "JWT" })
    .setIssuer("enablebanking.com")
    .setAudience("api.enablebanking.com")
    .setIssuedAt(nowEpoch)
    .setExpirationTime(exp)
    .sign(key);

  cached = { token, expEpoch: exp };
  return token;
}

/** Drop the cached token (tests / key rotation). */
export function resetJwtCache(): void {
  cached = null;
}
