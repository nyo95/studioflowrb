import { AppError } from "@platform/core/errors";

import type { TableColumn, TableRow } from "./types";

const FORMULA_START = /^[=+\-@]/;

function cell(value: string): string {
  return /[",\r\n;]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Text that a spreadsheet would run as a formula gets a leading apostrophe. Numbers and dates are
 * written raw so the file imports back unchanged.
 */
function exportValue(raw: unknown, column: TableColumn): string {
  const text = String(raw ?? "").trim();
  if (!text) return "";
  const numeric = column.type === "number" || column.type === "money";
  return FORMULA_START.test(text) && !(numeric && /^-?\d+(?:\.\d+)?$/.test(text)) ? `'${text}` : text;
}

export function writeCsv(columns: TableColumn[], rows: TableRow[]): Buffer {
  const lines = [columns.map((column) => cell(column.header)).join(",")];
  for (const row of rows) lines.push(columns.map((column) => cell(exportValue(row[column.key], column))).join(","));
  return Buffer.from(`\uFEFF${lines.join("\r\n")}\r\n`, "utf8");
}

/** RFC 4180 reader: BOM, quoted fields, embedded newlines, and `,` or `;` (picked from the header line). */
export function readCsv(input: Buffer): string[][] {
  const text = input.toString("utf8").replace(/^\uFEFF/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === delimiter) { row.push(field); field = ""; }
    else if (char === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (char !== "\r") field += char;
  }
  if (quoted) throw new AppError("VALIDATION", "TABULAR_CSV_INVALID", "The CSV has an unfinished quoted value.");
  row.push(field);
  if (row.some((value) => value.length)) rows.push(row);
  return rows.map((values) => values.map((value) => (/^'[=+\-@]/.test(value) ? value.slice(1) : value)));
}
