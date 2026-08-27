import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MASTERDATA_WORKBOOK_SHEETS, type WorkbookData } from "../application/import-export";
import { xlsxWorkbookCodec } from "./xlsx-workbook";

function workbook(): WorkbookData {
  return {
    manifest: { formatVersion: "1", exportedAt: "2026-08-27T00:00:00.000Z", scope: "all" },
    sheets: Object.assign(Object.fromEntries(MASTERDATA_WORKBOOK_SHEETS.map((sheet) => [sheet, []])), {
      Unit: [{ id: "unit-1", code: "sheet", label: "lembar", symbol: null, aliases: '["sheet"]', usages: '["PURCHASE"]', sort_order: 1, updated_at: "2026-08-27T00:00:00.000Z" }],
      SkuPrice: [{ id: "price-1", sku_id: "sku-1", supplier_party_id: null, amount: "0", currency: "IDR", unit_id: "unit-1", source_link_id: null, notes: null, updated_by_user_id: null, updated_by_label: "Owner", updated_at: "2026-08-27T00:00:00.000Z" }],
    }),
  } as unknown as WorkbookData;
}

describe("Master Data XLSX round trip", () => {
  it("preserves canonical IDs, decimals, nulls, and manifest values", async () => {
    const source = workbook();
    const decoded = await xlsxWorkbookCodec.decode(await xlsxWorkbookCodec.encode(source));
    assert.deepEqual(decoded, source);
  });

  it("rejects formulas instead of evaluating workbook code", async () => {
    const bytes = await xlsxWorkbookCodec.encode(workbook());
    const ExcelJS = (await import("exceljs")).default;
    const raw = new ExcelJS.Workbook(); await raw.xlsx.load(bytes as never);
    raw.getWorksheet("Unit")!.getCell("B2").value = { formula: 'HYPERLINK("https://example.com")', result: "sheet" };
    const hostile = new Uint8Array(await raw.xlsx.writeBuffer());
    await assert.rejects(() => xlsxWorkbookCodec.decode(hostile), /formulas are not allowed/i);
  });
});
