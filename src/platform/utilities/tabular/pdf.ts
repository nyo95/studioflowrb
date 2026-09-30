import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

import { formatDateOnly, isDateOnlyString } from "@platform/utilities/date";
import { formatDecimal, isDecimalString } from "@platform/utilities/decimal";

import type { PdfTableTemplate, TableColumn, TableRow } from "./types";

export const DEFAULT_PDF_TEMPLATE: PdfTableTemplate = {
  pageSize: "A4",
  orientation: "portrait",
  showPageNumbers: true,
  showGeneratedAt: false,
  zebraRows: true,
};

const PAGE_SIZES = { A4: [595.28, 841.89], Letter: [612, 792] } as const;
const MARGIN = 32;
const FONT_SIZE = 7;
const LINE = 8.5;
const MAX_CELL_LINES = 4;

const REPLACEMENTS: Record<string, string> = {
  "–": "-",
  "—": "-",
  "‘": "'",
  "’": "'",
  "“": '"',
  "”": '"',
  "×": "x",
  "…": "...",
  "•": "-",
  " ": " ",
};

/** The built-in PDF fonts only cover Latin-1: swap common punctuation, replace anything else, never throw. */
function printable(text: string): string {
  return Array.from(text.replace(/[\r\n\t]+/g, " "))
    .map((char) => REPLACEMENTS[char] ?? (/^[\x20-\x7e\xa1-\xff]$/.test(char) ? char : "?"))
    .join("");
}

function display(raw: unknown, column: TableColumn): string {
  const text = String(raw ?? "").trim();
  if (!text) return "";
  if ((column.type === "number" || column.type === "money") && isDecimalString(text)) return formatDecimal(text);
  if (column.type === "date" && isDateOnlyString(text)) return formatDateOnly(text);
  return text;
}

function color(hex?: string) {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex ?? "");
  if (!match) return rgb(0.12, 0.31, 0.45);
  const [r, g, b] = [0, 2, 4].map((offset) => parseInt(match[1].slice(offset, offset + 2), 16) / 255);
  return rgb(r, g, b);
}

function wrap(text: string, font: PDFFont, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (let word of printable(text).split(" ")) {
    // break a word that is wider than the column
    while (font.widthOfTextAtSize(word, FONT_SIZE) > width && word.length > 1) {
      let cut = word.length - 1;
      while (cut > 1 && font.widthOfTextAtSize(word.slice(0, cut), FONT_SIZE) > width) cut--;
      if (line) { lines.push(line); line = ""; }
      lines.push(word.slice(0, cut));
      word = word.slice(cut);
    }
    const next = line ? `${line} ${word}` : word;
    if (!line || font.widthOfTextAtSize(next, FONT_SIZE) <= width) line = next;
    else { lines.push(line); line = word; }
  }
  lines.push(line);
  if (lines.length > MAX_CELL_LINES) return [...lines.slice(0, MAX_CELL_LINES - 1), `${lines[MAX_CELL_LINES - 1].slice(0, -3)}...`];
  return lines;
}

export async function writePdf(columns: TableColumn[], rows: TableRow[], override: Partial<PdfTableTemplate> = {}): Promise<Buffer> {
  const template = { ...DEFAULT_PDF_TEMPLATE, ...override };
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const [short, long] = PAGE_SIZES[template.pageSize];
  const pageSize: [number, number] = template.orientation === "landscape" ? [long, short] : [short, long];
  const contentWidth = pageSize[0] - MARGIN * 2;
  const weights = template.columnWidths?.length === columns.length ? template.columnWidths : columns.map((column) => column.width ?? 15);
  const total = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  const widths = weights.map((weight) => (weight / total) * contentWidth);
  const accent = color(template.accentColor);

  let page = document.addPage(pageSize);
  let y = 0;
  const startPage = (first: boolean) => {
    if (!first) page = document.addPage(pageSize);
    y = pageSize[1] - MARGIN;
    if (template.title) { page.drawText(printable(template.title), { x: MARGIN, y: y - 10, size: 14, font: bold }); y -= 22; }
    if (template.subtitle) { page.drawText(printable(template.subtitle), { x: MARGIN, y: y - 6, size: 9, font }); y -= 16; }
    let x = MARGIN;
    columns.forEach((column, index) => {
      page.drawRectangle({ x, y: y - 14, width: widths[index], height: 16, color: accent });
      page.drawText(wrap(column.header, bold, widths[index] - 6)[0], { x: x + 3, y: y - 9, size: FONT_SIZE, font: bold, color: rgb(1, 1, 1) });
      x += widths[index];
    });
    y -= 18;
  };
  startPage(true);

  rows.forEach((row, rowIndex) => {
    const cells = columns.map((column, index) => wrap(display(row[column.key], column), font, widths[index] - 6));
    const height = Math.max(...cells.map((lines) => lines.length)) * LINE + 4;
    if (y - height < MARGIN + 18) startPage(false);
    if (template.zebraRows && rowIndex % 2) page.drawRectangle({ x: MARGIN, y: y - height, width: contentWidth, height, color: rgb(0.96, 0.97, 0.98) });
    let x = MARGIN;
    cells.forEach((lines, index) => {
      lines.forEach((line, lineIndex) => page.drawText(line, { x: x + 3, y: y - 8 - lineIndex * LINE, size: FONT_SIZE, font }));
      x += widths[index];
    });
    y -= height;
  });

  const pages = document.getPages();
  const generated = template.showGeneratedAt ? `Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC` : null;
  pages.forEach((current, index) => {
    const footer = [template.footerText, generated, template.showPageNumbers ? `Page ${index + 1} of ${pages.length}` : null].filter(Boolean).join("  |  ");
    if (footer) current.drawText(printable(footer), { x: MARGIN, y: 14, size: FONT_SIZE, font });
  });
  return Buffer.from(await document.save());
}
