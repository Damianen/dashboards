import type { Macros } from "@/lib/rules";

// Open Food Facts client. OFF blocks anonymous clients, so EVERY request must
// identify itself via the User-Agent below. We stay far under OFF's rate limits
// (~100 req/min product lookups, ~10 req/min search) because food.ts caches
// products locally and only search hits the network on demand.

const TIMEOUT_MS = 8000;
const PRODUCT_FIELDS =
  "product_name,brands,nutriments,serving_quantity,image_front_small_url";

function userAgent(): string {
  const ua = process.env.OFF_USER_AGENT;
  if (!ua) throw new Error("OFF_USER_AGENT is not set");
  return ua;
}

/** GET `url` with the required User-Agent and an 8s timeout; throws on non-2xx
 *  or bad JSON so callers can fall back to a cached row / the legacy search. */
async function offFetch(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": userAgent() },
      signal: controller.signal,
      // Our 30-day DB TTL owns freshness — never let Next's fetch cache serve stale OFF data.
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`OFF ${res.status} for ${url}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Coerce an OFF numeric value (number or numeric string) to a finite number, else null. */
function numOrNull(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/** First brand from OFF's comma-joined `brands` string. */
function firstBrand(brands: unknown): string | null {
  if (typeof brands !== "string") return null;
  return brands.split(",")[0]?.trim() || null;
}

export interface OffProduct {
  barcode: string;
  name: string;
  brand: string | null;
  imageUrl: string | null;
  per100g: Macros;
  servingG: number | null;
  raw: unknown;
}

/**
 * Look up a product by barcode. OFF returns HTTP 200 with `status === 0` for an
 * unknown barcode, so we branch on the body, not the status code. Every nutrient
 * is nullable: a missing key stays null, never 0.
 */
export async function fetchProduct(barcode: string): Promise<OffProduct | null> {
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(
    barcode,
  )}?fields=${PRODUCT_FIELDS}`;
  const body = (await offFetch(url)) as {
    status?: number;
    product?: Record<string, unknown>;
  };
  if (body.status === 0 || !body.product) return null;

  const p = body.product;
  const n = (p.nutriments ?? {}) as Record<string, unknown>;
  const name =
    typeof p.product_name === "string" && p.product_name.trim()
      ? p.product_name.trim()
      : barcode;
  return {
    barcode,
    name,
    brand: firstBrand(p.brands),
    imageUrl:
      typeof p.image_front_small_url === "string"
        ? p.image_front_small_url
        : null,
    per100g: {
      kcal: numOrNull(n["energy-kcal_100g"]),
      proteinG: numOrNull(n["proteins_100g"]),
      carbG: numOrNull(n["carbohydrates_100g"]),
      fatG: numOrNull(n["fat_100g"]),
      fiberG: numOrNull(n["fiber_100g"]),
      sugarG: numOrNull(n["sugars_100g"]),
      saltG: numOrNull(n["salt_100g"]),
    },
    servingG: numOrNull(p.serving_quantity),
    raw: p,
  };
}

export interface OffSearchResult {
  barcode: string;
  name: string;
  brand: string | null;
  imageUrl: string | null;
}

/**
 * Search products by free text. Prefers the new search backend; on any failure
 * (it is frequently overloaded) falls back to the legacy CGI endpoint. The two
 * backends disagree on shape — results key (`hits` vs `products`) and `brands`
 * (array vs comma-string) — so each is mapped on its own terms.
 */
export async function searchProducts(
  query: string,
  pageSize = 10,
): Promise<OffSearchResult[]> {
  try {
    const url = `https://search.openfoodfacts.org/search?q=${encodeURIComponent(
      query,
    )}&page_size=${pageSize}`;
    const body = (await offFetch(url)) as { hits?: Record<string, unknown>[] };
    return (body.hits ?? [])
      .map((h) => ({
        barcode: typeof h.code === "string" ? h.code : "",
        name: typeof h.product_name === "string" ? h.product_name : "",
        brand: Array.isArray(h.brands)
          ? ((h.brands[0] as string | undefined) ?? null)
          : firstBrand(h.brands),
        imageUrl:
          typeof h.image_front_small_url === "string"
            ? h.image_front_small_url
            : null,
      }))
      .filter((r) => r.barcode !== "");
  } catch {
    const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(
      query,
    )}&search_simple=1&action=process&json=1&page_size=${pageSize}`;
    const body = (await offFetch(url)) as {
      products?: Record<string, unknown>[];
    };
    return (body.products ?? [])
      .map((p) => ({
        barcode: typeof p.code === "string" ? p.code : "",
        name: typeof p.product_name === "string" ? p.product_name : "",
        brand: firstBrand(p.brands),
        imageUrl:
          typeof p.image_front_small_url === "string"
            ? p.image_front_small_url
            : null,
      }))
      .filter((r) => r.barcode !== "");
  }
}
