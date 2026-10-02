import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { AppError } from "@platform/core/errors";
import { MASTERDATA_PERMISSIONS } from "@/apps/masterdata/public";

import { snapshotFromMasterData } from "./master-data-source";

const material = {
  id: "material-price",
  skuId: "sku-1",
  skuName: "Board",
  skuCode: "BOARD",
  supplierVendor: { id: "vendor-1", name: "Vendor", slug: "vendor" },
  amount: "100",
  amountLabel: null,
  currency: "IDR",
  unit: { id: "unit-1", code: "PCS", name: "Pieces" },
  measurement: {
    baseUnit: { id: "unit-1", code: "PCS", name: "Pieces" },
    purchaseUnit: null,
    dimensionLength: null,
    dimensionWidth: null,
    dimensionThickness: null,
    dimensionUnit: null,
    purchaseToBaseFactor: null,
  },
  sourceLink: null,
};

const work = {
  id: "work-price",
  name: "Install",
  slug: "install",
  kind: "labor" as const,
  category: { id: "category-1", name: "Labor", slug: "labor" },
  vendor: { id: "vendor-1", name: "Vendor", slug: "vendor" },
  unit: { id: "unit-1", code: "M2", name: "Square meter" },
  amount: "50",
  amountLabel: null,
  currency: "IDR",
  scopeNote: null,
  spec: null,
  dimDisplay: null,
  notes: null,
};

describe("snapshotFromMasterData", () => {
  it("checks material permission before reading and returns a material snapshot when allowed", async () => {
    let materialReads = 0;
    const read = {
      getMaterialPriceOption: async () => { materialReads += 1; return material; },
      listWorkPricesRead: async () => [],
    };
    await assert.rejects(
      () => snapshotFromMasterData({ grants: [], sourceKind: "material", sourceRefId: material.id, read }),
      (error: unknown) => error instanceof AppError && error.code === "PERMISSION_DENIED",
    );
    assert.equal(materialReads, 0);
    const snapshot = await snapshotFromMasterData({ grants: [MASTERDATA_PERMISSIONS.priceMaterialRead], sourceKind: "material", sourceRefId: material.id, read });
    assert.equal(snapshot.titleSnapshot, "Board");
    assert.equal(snapshot.currencySnapshot, "IDR");
    assert.equal(materialReads, 1);
  });

  it("checks work permission before reading and returns a work snapshot when allowed", async () => {
    let workReads = 0;
    const read = {
      getMaterialPriceOption: async () => null,
      listWorkPricesRead: async () => { workReads += 1; return [work]; },
    };
    await assert.rejects(
      () => snapshotFromMasterData({ grants: [], sourceKind: "labor", sourceRefId: work.id, read }),
      (error: unknown) => error instanceof AppError && error.code === "PERMISSION_DENIED",
    );
    assert.equal(workReads, 0);
    const snapshot = await snapshotFromMasterData({ grants: [MASTERDATA_PERMISSIONS.priceWorkRead], sourceKind: "labor", sourceRefId: work.id, read });
    assert.equal(snapshot.titleSnapshot, "Install");
    assert.equal(snapshot.kategori, "UPAH");
    assert.equal(workReads, 1);
  });
});
