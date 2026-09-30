import ExcelJS from "exceljs";

import { isDateOnlyString } from "@platform/utilities/date";

import type { ExtraSheet, TableColumn, TableRow } from "./types";

const NUMERIC = /^-?\d+(?:\.\d+)?$/;

function cellValue(raw: unknown, column: TableColumn): ExcelJS.CellValue {
  const text = String(raw ?? "").trim();
  if (!text) return "";
  if (column.type === "date" && isDateOnlyString(text)) return new Date(`${text}T00:00:00Z`);
  if ((column.type === "number" || column.type === "money") && NUMERIC.test(text)) return Number(text);
  return text; // string cells are never evaluated as formulas
}

export async function writeXlsx(columns: TableColumn[], rows: TableRow[], sheetName: string, extraSheets: ExtraSheet[] = []): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet(sheetName);
  sheet.addRow(columns.map((column) => column.header));
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  columns.forEach((column, index) => {
    const target = sheet.getColumn(index + 1);
    target.width = column.width ?? Math.min(40, Math.max(12, column.header.length + 2));
    if (column.type === "date") target.numFmt = "yyyy-mm-dd";
  });
  for (const row of rows) sheet.addRow(columns.map((column) => cellValue(row[column.key], column)));
  for (const extra of extraSheets) {
    const target = book.addWorksheet(extra.name);
    for (const values of extra.rows) target.addRow(values);
    if (extra.protect) await target.protect("", {});
  }
  return Buffer.from(await book.xlsx.writeBuffer());
}

const INVALID = Symbol("invalid");

function readCell(value: ExcelJS.CellValue): string | typeof INVALID {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value !== "object") return String(value).trim();
  if ("formula" in value || "sharedFormula" in value) {
    const result = (value as { result?: unknown }).result;
    return result === undefined || result === null || typeof result === "object" ? INVALID : String(result).trim();
  }
  if ("richText" in value) return value.richText.map((part) => part.text ?? "").join("").trim();
  if ("text" in value) return String(value.text ?? "").trim();
  return INVALID;
}

/** Reads a sheet into a grid of strings; unreadable cells come back as `null` so the caller can report them. */
export async function readXlsx(data: Buffer, sheetName?: string): Promise<{ grid: Array<Array<string | null>>; rowNumbers: number[] } | null> {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(data as never);
  const sheet = sheetName ? book.getWorksheet(sheetName) : book.worksheets[0];
  if (!sheet) return null;
  const grid: Array<Array<string | null>> = [];
  const rowNumbers: number[] = [];
  sheet.eachRow((row, rowNumber) => {
    const values: Array<string | null> = [];
    for (let index = 1; index <= Math.max(row.cellCount, sheet.columnCount); index++) {
      const value = readCell(row.getCell(index).value);
      values.push(value === INVALID ? null : value);
    }
    grid.push(values);
    rowNumbers.push(rowNumber);
  });
  return { grid, rowNumbers };
}
