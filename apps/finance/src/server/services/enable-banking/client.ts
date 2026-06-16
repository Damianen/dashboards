import { ebConfig } from "./config";
import { getJwt } from "./jwt";
import type {
  EbAspspsResponse,
  EbBalancesResponse,
  EbSession,
  EbSessionStatus,
  EbStartAuthResponse,
  EbTransactionsResponse,
} from "./types";

// Thin typed wrapper over the EB REST API. Logging is status + EB error code
// only — NEVER transaction payloads, IBANs, tokens or the private key
// (apps/finance/CLAUDE.md).

export class EnableBankingError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
  ) {
    super(message);
    this.name = "EnableBankingError";
  }

  /** Session/consent gone — caller should mark the connection EXPIRED. */
  get isConsentExpired(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

type Query = Record<string, string | undefined>;

async function ebFetch<T>(
  path: string,
  init: Omit<RequestInit, "body"> & { query?: Query; body?: unknown } = {},
): Promise<T> {
  const { apiBase } = ebConfig();
  const jwt = await getJwt();

  const url = new URL(`${apiBase}${path}`);
  for (const [k, v] of Object.entries(init.query ?? {})) {
    if (v !== undefined) url.searchParams.set(k, v);
  }

  const method = init.method ?? "GET";
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

  if (!res.ok) {
    // Read only the EB error code; the body may carry PII so it is discarded.
    let code: string | undefined;
    try {
      const body = (await res.json()) as { code?: string; error?: string };
      code = body.code ?? body.error;
    } catch {
      // non-JSON error body — ignore
    }
    throw new EnableBankingError(
      res.status,
      code,
      `EB ${method} ${path} -> ${res.status}${code ? ` (${code})` : ""}`,
    );
  }

  return (await res.json()) as T;
}

export interface StartAuthParams {
  aspsp: { name: string; country: string };
  redirectUrl: string;
  state: string;
  validUntil: string; // ISO datetime
  psuType?: string;
}

export interface GetTransactionsParams {
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string; // YYYY-MM-DD
  continuationKey?: string;
}

/** The EB operations the app uses; swappable for fixtures in tests. */
export interface EbClient {
  listAspsps(country: string, psuType?: string): Promise<EbAspspsResponse>;
  startAuth(p: StartAuthParams): Promise<EbStartAuthResponse>;
  createSession(code: string): Promise<EbSession>;
  getSession(sessionId: string): Promise<EbSessionStatus>;
  getBalances(accountUid: string): Promise<EbBalancesResponse>;
  getTransactions(
    accountUid: string,
    p?: GetTransactionsParams,
  ): Promise<EbTransactionsResponse>;
}

export const liveClient: EbClient = {
  listAspsps(country, psuType = "personal") {
    return ebFetch<EbAspspsResponse>("/aspsps", {
      query: { country, psu_type: psuType },
    });
  },
  startAuth(p) {
    return ebFetch<EbStartAuthResponse>("/auth", {
      method: "POST",
      body: {
        access: { valid_until: p.validUntil },
        aspsp: p.aspsp,
        redirect_url: p.redirectUrl,
        state: p.state,
        psu_type: p.psuType ?? "personal",
      },
    });
  },
  createSession(code) {
    return ebFetch<EbSession>("/sessions", {
      method: "POST",
      body: { code },
    });
  },
  getSession(sessionId) {
    return ebFetch<EbSessionStatus>(`/sessions/${sessionId}`);
  },
  getBalances(accountUid) {
    return ebFetch<EbBalancesResponse>(`/accounts/${accountUid}/balances`);
  },
  getTransactions(accountUid, p = {}) {
    return ebFetch<EbTransactionsResponse>(
      `/accounts/${accountUid}/transactions`,
      {
        query: {
          date_from: p.dateFrom,
          date_to: p.dateTo,
          continuation_key: p.continuationKey,
        },
      },
    );
  },
};
