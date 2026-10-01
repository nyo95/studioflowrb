/**
 * Shared tabular export/import (WO-PLAT-TABULAR-01). One column description drives an
 * Excel/CSV/PDF export, a blank import template, and the header matching of an uploaded
 * Excel/CSV file. Server-side only. Domain validation, permissions and audit stay in the app.
 */
import { AppError } from "@platform/core/errors";

import { readCsv, writeCsv } from "./csv";
import { DEFAULT_PDF_TEMPLATE, writePdf } from "./pdf";
import type { ExtraSheet, FileResult, ImportFormat, ParsedRow, ParsedTable, PdfTableTemplate, TableColumn, TableFormat, TableRow } from "./types";
import { readXlsx, writeXlsx } from "./xlsx";

export type { ExtraSheet, FileResult, ImportFormat, ParsedRow, ParsedTable, PdfTableTemplate, TableColumn, TableFormat, TableRow };
export { DEFAULT_PDF_TEMPLATE };
export { createWorkbook, loadWorkbook, workbookToBuffer, type Workbook, type WorkbookCellValue, type Worksheet, type WorksheetRow } from "./workbook";

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MIME: Record<TableFormat, string> = { xlsx: XLSX_MIME, csv: "text/csv; charset=utf-8", pdf: "application/pdf" };
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_ROWS = 5000;

function fail(code: string, message: string): never {
  throw new AppError("VALIDATION", code, message);
}

const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID");
const withExtension = (filename: string, format: TableFormat) => `${filename.replace(/\.(xlsx|csv|pdf)$/i, "")}.${format}`;

export async function exportTable(input: {
  format: TableFormat;
  filename: string;
  sheetName?: string;
  title?: string;
  columns: TableColumn[];
  rows: TableRow[];
  /** PDF template overrides for this caller. */
  pdf?: Partial<PdfTableTemplate>;
  /** Extra xlsx-only sheets (reference lists, notes). */
  extraSheets?: ExtraSheet[];
}): Promise<FileResult> {
  if (input.columns.length === 0) fail("TABULAR_COLUMNS_REQUIRED", "Provide at least one table column.");
  const data =
    input.format === "xlsx" ? await writeXlsx(input.columns, input.rows, input.sheetName ?? "Sheet1", input.extraSheets)
    : input.format === "csv" ? writeCsv(input.columns, input.rows)
    : await writePdf(input.columns, input.rows, { title: input.title, ...input.pdf });
  return { filename: withExtension(input.filename, input.format), mimeType: MIME[input.format], data };
}

/** A blank import file with the headers (and optionally one example row) from the same columns the importer matches. */
export async function buildImportTemplate(input: {
  format: ImportFormat;
  filename: string;
  sheetName?: string;
  columns: TableColumn[];
  includeExample?: boolean;
  /** Short instructions; written to a "Notes" sheet in xlsx templates (a CSV has nowhere to put them). */
  notes?: string[];
}): Promise<FileResult> {
  const rows: TableRow[] = input.includeExample ? [Object.fromEntries(input.columns.map((column) => [column.key, column.example ?? ""]))] : [];
  const notes = [
    ...input.columns.filter((column) => column.required || column.note).map((column) => [column.header, [column.required ? "Required." : "", column.note ?? ""].filter(Boolean).join(" ")]),
    ...(input.notes ?? []).map((note) => [note, ""]),
  ];
  return exportTable({
    format: input.format,
    filename: input.filename,
    sheetName: input.sheetName,
    columns: input.columns,
    rows,
    extraSheets: input.format === "xlsx" && notes.length ? [{ name: "Notes", rows: [["Column", "Note"], ...notes] }] : undefined,
  });
}

/** CSV text as a grid of raw cells (BOM, quotes and `,`/`;` handled). */
export function parseCsvText(text: string): string[][] {
  return readCsv(Buffer.from(text, "utf8"));
}

/**
 * The raw cell grid of an uploaded `.xlsx` (first or named sheet) or `.csv`, for callers that parse a
 * layout of their own (title rows above the header). Unreadable cells become empty strings.
 */
export async function readTabularGrid(input: { data: Buffer; filename: string; sheetName?: string; maxBytes?: number }): Promise<string[][]> {
  if (input.data.length > (input.maxBytes ?? DEFAULT_MAX_BYTES)) fail("TABULAR_FILE_TOO_LARGE", `The file is larger than ${Math.round((input.maxBytes ?? DEFAULT_MAX_BYTES) / 1024 / 1024)} MB.`);
  const name = input.filename.toLowerCase();
  if (name.endsWith(".csv")) return readCsv(input.data);
  if (!name.endsWith(".xlsx")) fail("TABULAR_FILE_TYPE", "Upload an .xlsx or .csv file.");
  let sheet: Awaited<ReturnType<typeof readXlsx>>;
  try { sheet = await readXlsx(input.data, input.sheetName); } catch { fail("TABULAR_XLSX_INVALID", "The uploaded file is not a readable .xlsx workbook."); }
  if (!sheet) fail("TABULAR_XLSX_SHEET", "The workbook does not contain a readable sheet.");
  return sheet.grid.map((row) => row.map((cell) => cell ?? ""));
}

/**
 * Reads an uploaded `.xlsx` or `.csv` into rows keyed by column. Throws a plain validation error
 * for a wrong type, oversize/empty/unreadable file, duplicate headers or a missing required column.
 * Unknown headers and unreadable cells are returned for the caller to decide on.
 */
export async function parseTabularFile(input: {
  data: Buffer;
  filename: string;
  columns: TableColumn[];
  maxBytes?: number;
  maxRows?: number;
  /** xlsx: read this sheet instead of the first one. */
  sheetName?: string;
}): Promise<ParsedTable> {
  const maxBytes = input.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxRows = input.maxRows ?? DEFAULT_MAX_ROWS;
  if (input.data.length > maxBytes) fail("TABULAR_FILE_TOO_LARGE", `The file is larger than ${Math.round(maxBytes / 1024 / 1024)} MB.`);
  const name = input.filename.toLowerCase();
  const format: ImportFormat = name.endsWith(".xlsx") ? "xlsx" : name.endsWith(".csv") ? "csv" : fail("TABULAR_FILE_TYPE", "Upload an .xlsx or .csv file.");

  let grid: Array<Array<string | null>>;
  let rowNumbers: number[];
  if (format === "csv") {
    grid = readCsv(input.data);
    rowNumbers = grid.map((_, index) => index + 1);
  } else {
    let sheet: Awaited<ReturnType<typeof readXlsx>>;
    try { sheet = await readXlsx(input.data, input.sheetName); } catch { fail("TABULAR_XLSX_INVALID", "The uploaded file is not a readable .xlsx workbook."); }
    if (!sheet) fail("TABULAR_XLSX_SHEET", input.sheetName ? `The workbook must contain a sheet named "${input.sheetName}".` : "The workbook does not contain a readable sheet.");
    ({ grid, rowNumbers } = sheet);
  }
  if (grid.length === 0 || !grid[0].some((value) => value?.trim())) fail("TABULAR_FILE_EMPTY", "The file has no readable rows.");

  const header = grid[0].map((value) => (value ?? "").trim());
  const seen = new Set<string>();
  for (const title of header) {
    const key = normalize(title);
    if (!key) continue;
    if (seen.has(key)) fail("TABULAR_HEADER_DUPLICATE", `The file has a duplicate header: ${title}.`);
    seen.add(key);
  }
  const lookup = new Map<string, TableColumn>();
  for (const column of input.columns) for (const title of [column.header, ...(column.aliases ?? [])]) lookup.set(normalize(title), column);
  const matched = header.map((title) => lookup.get(normalize(title)) ?? null);
  const missing = input.columns.filter((column) => column.required && !matched.includes(column)).map((column) => column.header);
  if (missing.length > 0) fail("TABULAR_REQUIRED_COLUMNS", `Missing required column: ${missing.join(", ")}.`);

  const rows: ParsedRow[] = [];
  const invalidCells: ParsedTable["invalidCells"] = [];
  for (let index = 1; index < grid.length; index++) {
    const source = grid[index];
    if (!source.some((value) => value === null || value.trim())) continue;
    const values: Record<string, string> = {};
    matched.forEach((column, cell) => {
      if (!column) return;
      values[column.key] = source[cell] ?? "";
      if (source[cell] === null) invalidCells.push({ row: rowNumbers[index], column: column.key });
    });
    if (rows.length >= maxRows) fail("TABULAR_ROW_LIMIT", `The file has more than ${maxRows.toLocaleString("en-US")} data rows.`);
    rows.push({ row: rowNumbers[index], values });
  }
  if (rows.length === 0) fail("TABULAR_FILE_EMPTY", "The file has no readable rows.");
  return { format, rows, unknownHeaders: header.filter((title, index) => title && !matched[index]), invalidCells };
}
