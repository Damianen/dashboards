import { Bank } from "@/generated/prisma/client";

// Enable Banking environment + bank→ASPSP routing.
//
// Secrets only via env / mounted files (apps/finance + root CLAUDE.md). The
// private key is read from EB_PRIVATE_KEY_PATH at call time, never bundled.

const DEFAULT_API_BASE = "https://api.enablebanking.com";

// Sandbox routes every connect to EB's "Mock ASPSP" so the full consent +
// sync flow works before real bank consent exists.
const SANDBOX_ASPSP_NAME = "Mock ASPSP";

interface BankAspsp {
  name: string;
  country: string;
}

// Real ASPSP per bank. Brand + market only — no personal data here.
const BANK_ASPSP: Record<Bank, BankAspsp> = {
  [Bank.ING]: { name: "ING", country: "NL" },
  [Bank.REVOLUT]: { name: "Revolut", country: "NL" },
};

export interface EbConfig {
  appId: string;
  keyPath: string;
  redirectUrl: string;
  apiBase: string;
  sandbox: boolean;
}

export function ebConfig(): EbConfig {
  return {
    appId: process.env.EB_APP_ID ?? "",
    keyPath: process.env.EB_PRIVATE_KEY_PATH ?? "",
    redirectUrl: process.env.EB_REDIRECT_URL ?? "",
    apiBase: (process.env.EB_API_BASE || DEFAULT_API_BASE).replace(/\/+$/, ""),
    sandbox: process.env.EB_SANDBOX === "true",
  };
}

/** The ASPSP to authorize against for a bank, honoring sandbox mode. */
export function aspspForBank(bank: Bank): BankAspsp {
  const real = BANK_ASPSP[bank];
  return ebConfig().sandbox
    ? { name: SANDBOX_ASPSP_NAME, country: real.country }
    : real;
}

/** Whether enough is configured to make signed EB calls. */
export function isConfigured(): boolean {
  const c = ebConfig();
  return Boolean(c.appId && c.keyPath && c.redirectUrl);
}
