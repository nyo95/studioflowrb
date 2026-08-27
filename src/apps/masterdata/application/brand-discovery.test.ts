import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TransactionClient } from "@platform/core/db";
import { BrandDiscoveryService, matchDiscoveryBrand, type DiscoveryBrandRecord } from "./brand-discovery";

const brand = (overrides: Partial<DiscoveryBrandRecord> = {}): DiscoveryBrandRecord => ({
  id: "brand-1", name: "Formica",
  categories: [{ id: "cat-1", name: "High Pressure Laminate", slug: "hpl", synonyms: ["laminasi"], sortOrder: 2 }],
  links: [{ kind: "WEBSITE", url: "https://example.com", label: "Site" }, { kind: "PRICE_LIST", url: "https://private.example", label: "Private" }],
  activeSkus: [{ id: "sku-1", code: "FX-100", name: "Formica Walnut", media: [] }],
  ...overrides,
});

const context = { grants: ["masterdata.discovery.read"], actor: { kind: "USER" as const, userId: "u", label: "User" } };
const tx = {} as TransactionClient;

describe("Brand Discovery", () => {
  it("uses every locked tier in exact order", () => {
    assert.equal(matchDiscoveryBrand(brand(), "Formica")?.tier, 1);
    assert.equal(matchDiscoveryBrand(brand(), "Form")?.tier, 2);
    assert.equal(matchDiscoveryBrand(brand(), "HPL")?.tier, 3);
    assert.equal(matchDiscoveryBrand(brand(), "laminasi")?.tier, 4);
    assert.equal(matchDiscoveryBrand(brand(), "pressure")?.tier, 5);
    assert.equal(matchDiscoveryBrand(brand(), "FX-1")?.tier, 6);
    assert.equal(matchDiscoveryBrand(brand(), "walnut")?.tier, 7);
  });

  it("sorts by tier, reason count, normalized name, then id and removes private links", async () => {
    const records = [
      brand({ id: "b", name: "Zeta Formica" }),
      brand({ id: "a", name: "Formica" }),
      brand({ id: "c", name: "Álpha Formica" }),
    ];
    const service = new BrandDiscoveryService({ runTransaction: (work) => work(tx), brands: { loadLiveBrands: async () => records } });
    const result = await service.search(context, { query: "formica", limit: 10 });
    assert.deepEqual(result.items.map(({ id }) => id), ["a", "c", "b"]);
    assert.deepEqual(result.items[0]?.links.map(({ kind }) => kind), ["WEBSITE"]);
  });

  it("ranks empty suggestions by distinct Brand count then category ordering", async () => {
    const second = { id: "cat-2", name: "Acoustic", slug: "acoustic", synonyms: [], sortOrder: 1 };
    const records = [brand(), brand({ id: "brand-2", categories: [...brand().categories, second] }), brand({ id: "brand-3", categories: [second] })];
    const service = new BrandDiscoveryService({ runTransaction: (work) => work(tx), brands: { loadLiveBrands: async () => records } });
    const result = await service.suggestions(context);
    assert.deepEqual(result.items.map(({ id, brandCount }) => [id, brandCount]), [["cat-2", 2], ["cat-1", 2]]);
  });
});
