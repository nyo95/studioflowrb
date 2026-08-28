import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TransactionClient } from "@platform/core/db";
import { AppError } from "@platform/core/errors";
import { ImportExportService, MASTERDATA_WORKBOOK_SHEETS, validateWorkbookStructure, type WorkbookData } from "./import-export";

const tx = {} as TransactionClient;
const allGrants = ["masterdata.import.execute", "masterdata.export.read", "masterdata.dictionary.read", "masterdata.dictionary.manage", "masterdata.party.read", "masterdata.brand.read", "masterdata.category.read", "masterdata.sku.read", "masterdata.price.read", "masterdata.price.manage"];
const context = { grants: allGrants, actor: { kind: "USER" as const, userId: "user", label: "Owner" } };
function data(): WorkbookData {
  return { manifest: { formatVersion: "1", exportedAt: "2026-08-27T00:00:00.000Z", scope: "all" }, sheets: Object.assign(Object.fromEntries(MASTERDATA_WORKBOOK_SHEETS.map((sheet) => [sheet, []])), { SkuPrice: [{ id: "00000000-0000-4000-8000-000000000001", sku_id: "00000000-0000-4000-8000-000000000002", amount: "0", updated_at: "2026-08-27T00:00:00.000Z" }] }) } as unknown as WorkbookData;
}

describe("Master Data workbook application", () => {
  it("rejects unknown versions, columns, duplicate price pairs, and stale rows", () => {
    const source = data();
    const invalid = { ...source, manifest: { ...source.manifest, formatVersion: "99" }, sheets: { ...source.sheets, SkuPrice: [...source.sheets.SkuPrice, { ...source.sheets.SkuPrice[0]!, unexpected: "x" }] } };
    const issues = validateWorkbookStructure(invalid, { "SkuPrice:00000000-0000-4000-8000-000000000001": "2026-08-28T00:00:00.000Z" });
    assert.deepEqual(new Set(issues.map(({ code }) => code)), new Set(["UNKNOWN_VERSION", "UNKNOWN_COLUMN", "DUPLICATE_SKU_PRICE", "STALE_ROW"]));
  });

  it("allows several supplier pairs per SKU and rejects repeating one pair", () => {
    const source = data();
    const secondSupplierRow = { ...source.sheets.SkuPrice[0]!, id: "00000000-0000-4000-8000-000000000003", supplier_party_id: "00000000-0000-4000-8000-000000000004", updated_at: null };
    const baseVersions = { "SkuPrice:00000000-0000-4000-8000-000000000001": "2026-08-27T00:00:00.000Z" };
    const ok = { ...source, sheets: { ...source.sheets, SkuPrice: [...source.sheets.SkuPrice, secondSupplierRow] } };
    assert.deepEqual(validateWorkbookStructure(ok, baseVersions).map((issue) => issue.code), []);
    const duplicatedPair = { ...source, sheets: { ...source.sheets, SkuPrice: [...source.sheets.SkuPrice, secondSupplierRow, { ...secondSupplierRow, id: "00000000-0000-4000-8000-000000000005" }] } };
    assert.deepEqual(validateWorkbookStructure(duplicatedPair, baseVersions).map((issue) => issue.code), ["DUPLICATE_SKU_PRICE"]);
  });

  it("rechecks conflicts and runs apply inside one supplied transaction", async () => {
    let appliedTx: TransactionClient | undefined;
    let current = "2026-08-27T00:00:00.000Z";
    const service = new ImportExportService({
      runTransaction: (work) => work(tx), now: () => new Date("2026-08-27T00:00:00.000Z"),
      codec: { encode: async () => new Uint8Array(), decode: async () => data() },
      store: { exportAll: async () => data(), currentVersions: async () => ({ "SkuPrice:00000000-0000-4000-8000-000000000001": current }) },
      applier: { apply: async (receivedTx, receivedContext) => { appliedTx = receivedTx; assert.equal(receivedContext.transaction, tx); return 1; } },
    });
    const preview = await service.preview(context, new Uint8Array());
    assert.equal(await service.apply(context, preview), 1); assert.equal(appliedTx, tx);
    current = "2026-08-28T00:00:00.000Z";
    await assert.rejects(() => service.apply(context, preview), (error: unknown) => error instanceof AppError && error.code === "WORKBOOK_STALE");
  });

  it("requires resource manage grants based on populated sheets", async () => {
    const service = new ImportExportService({ runTransaction: (work) => work(tx), now: () => new Date(), codec: { encode: async () => new Uint8Array(), decode: async () => data() }, store: { exportAll: async () => data(), currentVersions: async () => ({}) }, applier: { apply: async () => 0 } });
    await assert.rejects(() => service.preview({ ...context, grants: ["masterdata.import.execute"] }, new Uint8Array()), (error: unknown) => error instanceof AppError && error.kind === "FORBIDDEN");
  });

  it("writes one metadata-only audit event when exporting", async () => {
    const events: Array<{ action: string; metadata?: unknown; changes?: unknown }> = [];
    const service = new ImportExportService({
      runTransaction: (work) => work(tx), now: () => new Date("2026-08-27T00:00:00.000Z"), generateId: () => "export-id",
      codec: { encode: async () => new Uint8Array([1]), decode: async () => data() },
      store: { exportAll: async () => data(), currentVersions: async () => ({}) }, applier: { apply: async () => 0 },
      auditWriter: { write: async (event) => { events.push(event); } },
    });
    assert.deepEqual(await service.export(context), new Uint8Array([1]));
    assert.equal(events.length, 1);
    assert.equal(events[0]?.action, "masterdata.exported");
    assert.equal(events[0]?.changes, undefined);
    assert.deepEqual(Object.keys((events[0]?.metadata as { counts: object }).counts), [...MASTERDATA_WORKBOOK_SHEETS]);
  });
});
