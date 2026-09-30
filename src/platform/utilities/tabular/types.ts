export type TableFormat = "xlsx" | "csv" | "pdf";
export type ImportFormat = "xlsx" | "csv";

/** One column description drives export, template and import matching. */
export type TableColumn = {
  key: string;
  header: string;
  /** Other header spellings the importer accepts (case and spacing are ignored). */
  aliases?: string[];
  type?: "text" | "number" | "date" | "money";
  /** Excel width in characters; relative weight in the PDF. */
  width?: number;
  required?: boolean;
  example?: string;
  note?: string;
};

export type TableRow = Record<string, unknown>;

/** Plain-data PDF model. Apps and modules pass overrides; the defaults are one sensible table layout. */
export type PdfTableTemplate = {
  pageSize: "A4" | "Letter";
  orientation: "portrait" | "landscape";
  title?: string;
  subtitle?: string;
  footerText?: string;
  showPageNumbers: boolean;
  showGeneratedAt: boolean;
  /** `#rrggbb` header colour. */
  accentColor?: string;
  zebraRows: boolean;
  /** Relative column weights, one per column; falls back to each column's `width`. */
  columnWidths?: number[];
};

export type ExtraSheet = { name: string; rows: string[][]; protect?: boolean };

export type FileResult = { filename: string; mimeType: string; data: Buffer };

export type ParsedRow = { row: number; values: Record<string, string> };

export type ParsedTable = {
  format: ImportFormat;
  rows: ParsedRow[];
  unknownHeaders: string[];
  /** Cells (1-based row, column key) holding a formula without a stored result or another unreadable value. */
  invalidCells: Array<{ row: number; column: string }>;
};
