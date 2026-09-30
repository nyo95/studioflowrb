import assert from "node:assert/strict";
import { describe, it } from "node:test";

import ExcelJS from "exceljs";

import { AppError } from "@platform/core/errors";

import { buildImportTemplate, exportTable, parseTabularFile, type TableColumn } from "./index";

const columns: TableColumn[] = [
  { key: "code", header: "Code", required: true, aliases: ["Kode"] },
  { key: "name", header: "Name" },
  { key: "amount", header: "Amount", type: "money" },
  { key: "on", header: "Date", type: "date" },
];

const rows = [
  { code: "A-1", name: 'Kayu "jati", 2 m\nbaris dua', amount: "1250.5", on: "2026-09-30" },
  { code: "B-2", name: "Rak – besi × 3", amount: "-4", on: "" },
  { code: "C-3", name: "=SUM(A1:A2)", amount: "", on: "" },
];

const expected = rows.map((row) => ({ code: row.code, name: row.name, amount: row.amount, on: row.on }));

async function roundTrip(format: "xlsx" | "csv") {
  const file = await exportTable({ format, filename: "x", columns, rows });
  return parseTabularFile({ data: file.data, filename: file.filename, columns });
}

const code = (error: unknown) => error instanceof AppError && error.code;

describe("tabular export and import", () => {
  it("round-trips xlsx", async () => {
    const parsed = await roundTrip("xlsx");
    assert.deepEqual(parsed.rows.map((row) => row.values), expected);
    assert.deepEqual(parsed.rows.map((row) => row.row), [2, 3, 4]);
  });

  it("round-trips csv including quotes, newlines, formula-looking text and a BOM", async () => {
    const file = await exportTable({ format: "csv", filename: "x.csv", columns, rows });
    assert.equal(file.data.subarray(0, 3).toString("hex"), "efbbbf");
    assert.match(file.data.toString("utf8"), /'=SUM\(A1:A2\)/);
    const parsed = await parseTabularFile({ data: file.data, filename: file.filename, columns });
    assert.deepEqual(parsed.rows.map((row) => row.values), expected);
  });

  it("keeps formula-looking text a plain string in xlsx", async () => {
    const file = await exportTable({ format: "xlsx", filename: "x", columns, rows });
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(file.data as never);
    assert.equal(book.worksheets[0].getRow(4).getCell(2).value, "=SUM(A1:A2)");
  });

  it("reads a semicolon CSV and header aliases", async () => {
    const parsed = await parseTabularFile({ data: Buffer.from("kode;NAME\r\nZ-9;Papan\r\n"), filename: "a.csv", columns });
    assert.deepEqual(parsed.rows[0].values, { code: "Z-9", name: "Papan" });
    assert.deepEqual(parsed.unknownHeaders, []);
  });

  it("reports unknown headers and rejects the bad files", async () => {
    const extra = await parseTabularFile({ data: Buffer.from("Code,Colour\nA,red\n"), filename: "a.csv", columns });
    assert.deepEqual(extra.unknownHeaders, ["Colour"]);
    const bad = (data: string | Buffer, filename: string, options: Partial<Parameters<typeof parseTabularFile>[0]> = {}) =>
      parseTabularFile({ data: Buffer.from(data), filename, columns, ...options });
    await assert.rejects(bad("Name\nx\n", "a.csv"), (e) => code(e) === "TABULAR_REQUIRED_COLUMNS");
    await assert.rejects(bad("Code,code\nx,y\n", "a.csv"), (e) => code(e) === "TABULAR_HEADER_DUPLICATE");
    await assert.rejects(bad("", "a.csv"), (e) => code(e) === "TABULAR_FILE_EMPTY");
    await assert.rejects(bad("Code\n", "a.csv"), (e) => code(e) === "TABULAR_FILE_EMPTY");
    await assert.rejects(bad("Code\nx\n", "a.txt"), (e) => code(e) === "TABULAR_FILE_TYPE");
    await assert.rejects(bad("Code\nx\n", "a.csv", { maxBytes: 3 }), (e) => code(e) === "TABULAR_FILE_TOO_LARGE");
    await assert.rejects(bad("Code\nx\ny\n", "a.csv", { maxRows: 1 }), (e) => code(e) === "TABULAR_ROW_LIMIT");
    await assert.rejects(bad('Code\n"open\n', "a.csv"), (e) => code(e) === "TABULAR_CSV_INVALID");
    await assert.rejects(bad("not a workbook", "a.xlsx"), (e) => code(e) === "TABULAR_XLSX_INVALID");
  });

  it("reads a named sheet and flags a formula cell without a stored result", async () => {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet("Data");
    sheet.addRow(["Code", "Name"]);
    sheet.addRow(["A", { formula: "1+1" }]);
    const data = Buffer.from(await book.xlsx.writeBuffer());
    const parsed = await parseTabularFile({ data, filename: "a.xlsx", columns, sheetName: "Data" });
    assert.deepEqual(parsed.invalidCells, [{ row: 2, column: "name" }]);
    await assert.rejects(parseTabularFile({ data, filename: "a.xlsx", columns, sheetName: "Missing" }), (e) => code(e) === "TABULAR_XLSX_SHEET");
  });

  it("builds an import template that the importer accepts", async () => {
    const template = await buildImportTemplate({ format: "xlsx", filename: "tpl", columns: [{ ...columns[0], example: "A-1" }, ...columns.slice(1)], includeExample: true, notes: ["Fill one row per item."] });
    const parsed = await parseTabularFile({ data: template.data, filename: template.filename, columns });
    assert.equal(parsed.rows[0].values.code, "A-1");
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(template.data as never);
    assert.deepEqual(book.worksheets.map((sheet) => sheet.name), ["Sheet1", "Notes"]);
  });

  it("writes valid PDFs for empty, small and multi-page tables and honours template overrides", async () => {
    const many = Array.from({ length: 200 }, (_, index) => ({ code: `C-${index}`, name: "Nama 中文 panjang ".repeat(20), amount: "1000", on: "2026-09-30" }));
    for (const input of [[], rows, many]) {
      const file = await exportTable({ format: "pdf", filename: "x", title: "Daftar", columns, rows: input });
      assert.equal(file.data.subarray(0, 4).toString(), "%PDF");
      assert.equal(file.mimeType, "application/pdf");
    }
    const landscape = await exportTable({ format: "pdf", filename: "x", columns, rows: many, pdf: { orientation: "landscape", pageSize: "Letter", footerText: "Internal", accentColor: "#336699", zebraRows: false } });
    const portrait = await exportTable({ format: "pdf", filename: "x", columns, rows: many });
    assert.notEqual(landscape.data.length, portrait.data.length);
  });

  it("requires at least one column", async () => {
    await assert.rejects(exportTable({ format: "csv", filename: "x", columns: [], rows: [] }), (e) => code(e) === "TABULAR_COLUMNS_REQUIRED");
  });
});
