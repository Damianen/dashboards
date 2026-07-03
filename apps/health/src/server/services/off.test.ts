import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { mapOffProduct, searchProducts } from "./off";

describe("mapOffProduct", () => {
  it("converts caffeine_100g grams to milligrams (Red Bull regression)", () => {
    // OFF normalizes caffeine to GRAMS per 100 g: Red Bull's 0.032 g/100 ml
    // must surface as 32 mg, never 0.032 mg.
    const product = mapOffProduct("90162602", {
      product_name: "Red Bull",
      nutriments: { "energy-kcal_100g": 46, caffeine_100g: 0.032 },
    });
    expect(product.per100g.caffeineMg).toBe(32);
    expect(product.per100g.kcal).toBe(46);
  });

  it("coerces numeric strings for nutrients and serving quantity", () => {
    const product = mapOffProduct("123", {
      product_name: "Oats",
      nutriments: {
        "energy-kcal_100g": "372",
        proteins_100g: "13.5",
        carbohydrates_100g: "58.7",
        fat_100g: "7",
        fiber_100g: "10.1",
        sugars_100g: "1.1",
        salt_100g: "0.02",
        caffeine_100g: "0.032",
      },
      serving_quantity: "40",
    });
    expect(product.per100g).toEqual({
      kcal: 372,
      proteinG: 13.5,
      carbG: 58.7,
      fatG: 7,
      fiberG: 10.1,
      sugarG: 1.1,
      saltG: 0.02,
      caffeineMg: 32,
    });
    expect(product.servingG).toBe(40);
  });

  it("keeps missing nutrients null — never 0", () => {
    const product = mapOffProduct("123", {
      product_name: "Mystery snack",
      nutriments: { "energy-kcal_100g": 100 },
    });
    expect(product.per100g).toEqual({
      kcal: 100,
      proteinG: null,
      carbG: null,
      fatG: null,
      fiberG: null,
      sugarG: null,
      saltG: null,
      caffeineMg: null,
    });
    expect(product.servingG).toBeNull();

    const bare = mapOffProduct("456", {});
    expect(bare.per100g.kcal).toBeNull();
    expect(bare.per100g.caffeineMg).toBeNull();
  });

  it("falls back to the barcode when the name is missing or blank", () => {
    expect(mapOffProduct("5000112637922", {}).name).toBe("5000112637922");
    expect(mapOffProduct("5000112637922", { product_name: "   " }).name).toBe(
      "5000112637922",
    );
    expect(mapOffProduct("5000112637922", { product_name: 42 }).name).toBe(
      "5000112637922",
    );
    expect(
      mapOffProduct("5000112637922", { product_name: "  Coca-Cola Zero " }).name,
    ).toBe("Coca-Cola Zero");
  });

  it("takes the first brand of OFF's comma-joined brands string", () => {
    expect(
      mapOffProduct("1", { brands: "Red Bull, Red Bull GmbH" }).brand,
    ).toBe("Red Bull");
    expect(mapOffProduct("1", { brands: "" }).brand).toBeNull();
    expect(mapOffProduct("1", {}).brand).toBeNull();
    expect(mapOffProduct("1", { brands: 7 }).brand).toBeNull();
  });

  it("keeps the raw payload and only string image urls", () => {
    const p = { product_name: "X", image_front_small_url: 3 };
    const product = mapOffProduct("1", p);
    expect(product.imageUrl).toBeNull();
    expect(product.raw).toBe(p);
    expect(
      mapOffProduct("1", { image_front_small_url: "https://img" }).imageUrl,
    ).toBe("https://img");
  });
});

describe("searchProducts result mapping", () => {
  const fetchMock = vi.fn<typeof fetch>();
  let savedUserAgent: string | undefined;

  beforeAll(() => {
    savedUserAgent = process.env.OFF_USER_AGENT;
    process.env.OFF_USER_AGENT = "test-suite";
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
  });

  afterAll(() => {
    vi.unstubAllGlobals();
    if (savedUserAgent === undefined) delete process.env.OFF_USER_AGENT;
    else process.env.OFF_USER_AGENT = savedUserAgent;
  });

  function jsonResponse(body: unknown): Response {
    return { ok: true, json: async () => body } as Response;
  }

  it("maps the new backend's hits (array brands) and drops empty barcodes", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        hits: [
          {
            code: "111",
            product_name: "Cola",
            brands: ["BrandA", "BrandB"],
            image_front_small_url: "https://img/a",
          },
          { code: "222", product_name: "Fanta", brands: "First, Second" },
          { product_name: "No barcode" },
        ],
      }),
    );
    await expect(searchProducts("cola")).resolves.toEqual([
      {
        barcode: "111",
        name: "Cola",
        brand: "BrandA",
        imageUrl: "https://img/a",
      },
      { barcode: "222", name: "Fanta", brand: "First", imageUrl: null },
    ]);
  });

  it("falls back to the legacy endpoint (comma-string brands) when search fails", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 503 } as Response)
      .mockResolvedValueOnce(
        jsonResponse({
          products: [
            { code: "333", product_name: "Beans", brands: "Heinz, Kraft" },
            { code: "", product_name: "dropped" },
          ],
        }),
      );
    await expect(searchProducts("beans")).resolves.toEqual([
      { barcode: "333", name: "Beans", brand: "Heinz", imageUrl: null },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
