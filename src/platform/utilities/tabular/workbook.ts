import ExcelJS from "exceljs";

/**
 * Multi-sheet workbook access for apps whose files do not fit the single flat table of `parseTabularFile`
 * (title rows, section headings, merged cells, several sheets). Domain meaning stays in the app; this only
 * opens and creates workbooks so the spreadsheet library is imported in exactly one place.
 */
export type WorkbookCellValue = ExcelJS.CellValue;
export type Workbook = ExcelJS.Workbook;
export type Worksheet = ExcelJS.Worksheet;
export type WorksheetRow = ExcelJS.Row;

export function createWorkbook(): Workbook {
  return new ExcelJS.Workbook();
}

/** Opens an .xlsx buffer. Throws when the bytes are not a readable workbook. */
export async function loadWorkbook(data: Buffer): Promise<Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data as unknown as ExcelJS.Buffer);
  return workbook;
}

export async function workbookToBuffer(workbook: Workbook): Promise<Buffer> {
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
