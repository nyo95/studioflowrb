import ExcelJS from "exceljs";
import {
  MASTERDATA_WORKBOOK_SHEETS, WORKBOOK_COLUMNS,
  type MasterDataWorkbookSheet, type WorkbookCell, type WorkbookCodec, type WorkbookData, type WorkbookRow,
} from "../application/import-export";

const MANIFEST_SHEET = "Manifest";
const MANIFEST_COLUMNS = ["format_version", "exported_at", "scope"] as const;

function cellValue(cell: ExcelJS.Cell): WorkbookCell {
  if (cell.formula) throw new Error("Workbook formulas are not allowed.");
  const value = cell.value;
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  throw new Error("Unsupported workbook cell value.");
}

function readRows(worksheet: ExcelJS.Worksheet): WorkbookRow[] {
  const headers = worksheet.getRow(1).values;
  if (!Array.isArray(headers)) throw new Error("Workbook header row is missing.");
  const columns = headers.slice(1).map((value) => String(value ?? "").trim());
  if (columns.some((column) => !column)) throw new Error("Workbook headers cannot be blank.");
  const rows: WorkbookRow[] = [];
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const record: Record<string, WorkbookCell> = {};
    let populated = false;
    columns.forEach((column, index) => {
      const value = cellValue(row.getCell(index + 1));
      record[column] = value;
      if (value !== null && value !== "") populated = true;
    });
    if (populated) rows.push(record);
  }
  return rows;
}

export const xlsxWorkbookCodec: WorkbookCodec = {
  async encode(data: WorkbookData): Promise<Uint8Array> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "StudioFlow Master Data";
    workbook.created = new Date(data.manifest.exportedAt);
    const manifest = workbook.addWorksheet(MANIFEST_SHEET);
    manifest.addRow([...MANIFEST_COLUMNS]);
    manifest.addRow([data.manifest.formatVersion, data.manifest.exportedAt, data.manifest.scope]);
    for (const sheet of MASTERDATA_WORKBOOK_SHEETS) {
      const worksheet = workbook.addWorksheet(sheet);
      worksheet.addRow([...WORKBOOK_COLUMNS[sheet]]);
      for (const row of data.sheets[sheet]) worksheet.addRow(WORKBOOK_COLUMNS[sheet].map((column) => row[column] ?? null));
      worksheet.views = [{ state: "frozen", ySplit: 1 }];
      worksheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: WORKBOOK_COLUMNS[sheet].length } };
    }
    return new Uint8Array(await workbook.xlsx.writeBuffer());
  },

  async decode(bytes: Uint8Array): Promise<WorkbookData> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer);
    const allowedSheets = new Set([MANIFEST_SHEET, ...MASTERDATA_WORKBOOK_SHEETS]);
    if (workbook.worksheets.some(({ name }) => !allowedSheets.has(name as MasterDataWorkbookSheet | typeof MANIFEST_SHEET))) throw new Error("Unknown workbook sheet.");
    const manifestSheet = workbook.getWorksheet(MANIFEST_SHEET);
    if (!manifestSheet) throw new Error("Workbook manifest is missing.");
    const manifestRows = readRows(manifestSheet);
    const manifest = manifestRows[0];
    if (!manifest || manifestRows.length !== 1) throw new Error("Workbook manifest must contain one row.");
    const sheets = Object.fromEntries(MASTERDATA_WORKBOOK_SHEETS.map((sheet) => {
      const worksheet = workbook.getWorksheet(sheet);
      if (!worksheet) throw new Error(`Workbook sheet ${sheet} is missing.`);
      return [sheet, readRows(worksheet)];
    })) as Record<MasterDataWorkbookSheet, WorkbookRow[]>;
    return {
      manifest: {
        formatVersion: String(manifest.format_version ?? ""),
        exportedAt: String(manifest.exported_at ?? ""),
        scope: String(manifest.scope ?? ""),
      },
      sheets,
    };
  },
};
