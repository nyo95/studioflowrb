import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TransactionClient } from "@platform/core/db";
import { AppError } from "@platform/core/errors";
import { PublicReadService, type PublicReadRepository } from "../application/public-read";

const tx = {} as TransactionClient;
const now = new Date("2026-08-27T00:00:00.000Z");
const repository: PublicReadRepository = {
  searchMaterials: async () => [],
  findMaterial: async () => ({
    id: "sku", code: "M-1", name: "Material", kind: "MATERIAL", updatedAt: now,
    brand: { id: "brand", name: "Brand" }, category: { id: "category", name: "HPL", path: null },
    baseUnit: { id: "unit", code: "sheet", label: "lembar" },
    prices: [
      { id: "price-null", amount: "0", currency: "IDR", unitCode: "sheet", supplierPartyId: null, supplierName: null, sourceUrl: null, updatedByUserId: null, updatedByLabel: "User", updatedAt: now, provenanceValid: true },
      { id: "price-sup", amount: "125000", currency: "IDR", unitCode: "sheet", supplierPartyId: "party", supplierName: "Supplier", sourceUrl: null, updatedByUserId: null, updatedByLabel: "User", updatedAt: now, provenanceValid: true },
    ],
  }),
  searchWorkPrices: async () => [],
  findWorkPrice: async () => ({ id: "work", code: "W-1", name: "Install", kind: "LABOR_ONLY", amount: "100", currency: "IDR", category: { id: "category", name: "Finishing", path: "finishing" }, unitCode: "m2", vendorName: null, scopeNote: null, updatedByUserId: null, updatedByLabel: "User", updatedAt: now }),
};
const service = new PublicReadService({ runTransaction: (work) => work(tx), reads: repository });
const context = { grants: ["masterdata.sku.read", "masterdata.price.read"], actor: { kind: "USER" as const, userId: "u", label: "User" } };

describe("Master Data public reads", () => {
  it("returns every eligible supplier price as prices[] with decimal and instant strings", async () => {
    const result = await service.getMaterial(context, "sku");
    assert.deepEqual(result?.prices.map((price) => [price.id, price.amount, price.supplierPartyId]), [
      ["price-null", "0", null],
      ["price-sup", "125000", "party"],
    ]);
    assert.equal(result?.prices[0]?.updatedAt, "2026-08-27T00:00:00.000Z");
    assert.equal("price" in (result ?? {}), false);
    assert.equal("notes" in (result ?? {}), false);
    assert.equal(result?.ready, true);
    assert.deepEqual(result?.notReadyReasons, []);
  });

  it("returns an empty prices list as not ready instead of inventing a price", async () => {
    const empty = new PublicReadService({ runTransaction: (work) => work(tx), reads: { ...repository, findMaterial: async () => ({ ...(await repository.findMaterial(tx, "sku"))!, prices: [] }) } });
    const result = await empty.getMaterial(context, "sku");
    assert.deepEqual(result?.prices, []);
    assert.equal(result?.ready, false);
    assert.deepEqual(result?.notReadyReasons, ["MISSING_CANONICAL_PRICE"]);
  });

  it("fails readiness instead of leaking invalid provenance", async () => {
    const invalid = new PublicReadService({ runTransaction: (work) => work(tx), reads: { ...repository, findMaterial: async () => ({ ...(await repository.findMaterial(tx, "sku"))!, prices: [await repository.findMaterial(tx, "sku").then((r) => r!.prices[1]!), { ...await repository.findMaterial(tx, "sku").then((r) => r!.prices[0]!), id: "price-bad", provenanceValid: false }] }) } });
    const result = await invalid.getMaterial(context, "sku");
    assert.equal(result?.ready, false);
    assert.deepEqual(result?.prices.map((price) => price.id), ["price-sup"]);
    assert.deepEqual(result?.notReadyReasons, ["INVALID_PRICE_PROVENANCE"]);
  });

  it("requires both SKU and price grants for BQ material reads", async () => {
    await assert.rejects(() => service.getMaterial({ ...context, grants: ["masterdata.sku.read"] }, "sku"), (error: unknown) => error instanceof AppError && error.kind === "FORBIDDEN");
  });
});
