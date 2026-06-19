// In-process, one-shot store for OAuth CSRF `state` tokens. The web OAuth bounce
// (app → provider → callback) must survive iOS Safari, which drops the Set-Cookie that
// rides the cross-origin authorize redirect — so the callback validates `state` against
// this server-side store instead of a cookie. The deploy is a single long-lived Node
// process (CLAUDE.md: one container per app), so this Map persists across the
// initiate→callback round trip; a container restart mid-flow just makes the user
// re-click Connect. State is a 128-bit random, one-shot, expiring token, so for this
// single-user app it carries the CSRF protection the cookie used to.

// 10 min to finish consent — mirrors the old state cookie's maxAge.
const TTL_MS = 10 * 60 * 1000;

// key = `${provider}:${state}` → expiry (epoch ms). Namespacing by provider keeps an
// Oura state from ever satisfying the Withings callback, and vice versa.
const pending = new Map<string, number>();

function prune(now: number): void {
  for (const [k, exp] of pending) {
    if (exp <= now) pending.delete(k);
  }
}

/** Record a freshly minted `state` for `provider` so its callback can validate it. */
export function rememberOauthState(provider: string, state: string): void {
  const now = Date.now();
  prune(now);
  pending.set(`${provider}:${state}`, now + TTL_MS);
}

/**
 * One-shot validation: true iff `state` was remembered for `provider` and has not
 * expired. Always consumes the entry (a state is never accepted twice), mirroring the
 * single-use semantics of the old state cookie.
 */
export function consumeOauthState(provider: string, state: string): boolean {
  const now = Date.now();
  const key = `${provider}:${state}`;
  const exp = pending.get(key);
  if (exp === undefined) return false;
  pending.delete(key);
  return exp > now;
}
