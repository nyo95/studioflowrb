export const SCHEDULE_SECTIONS = ["MATERIAL", "FIXTURE"] as const;
export type ScheduleSection = (typeof SCHEDULE_SECTIONS)[number];

/** One photo per option; prepared (cropped JPEG) upload stays under the server-action body limit. */
export const SCHEDULE_IMAGE_BYTES = 3 * 1024 * 1024;

export const SCHEDULE_OPTION_STATUSES = ["DRAFT", "APPROVED", "NOT_USED"] as const;
export type ScheduleOptionStatus = (typeof SCHEDULE_OPTION_STATUSES)[number];

/** Board card fields a user may choose to show; empty selection means "show every populated field" (default). */
export const SCHEDULE_CARD_FIELD_KEYS = ["brand", "sku", "color", "pattern", "finishing", "dimension", "location", "qty"] as const;
export type ScheduleCardFieldKey = (typeof SCHEDULE_CARD_FIELD_KEYS)[number];

export type ScheduleSnapshotInput = {
  brandName?: string | null;
  productName: string;
  skuText?: string | null;
  color?: string | null;
  pattern?: string | null;
  finishing?: string | null;
  dimension?: string | null;
};

export function normalizeScheduleCategory(value: string): { label: string; key: string } {
  const label = value.trim().replace(/\s+/g, " ");
  const key = label.toLocaleUpperCase("id-ID");
  return { label, key };
}

export function normalizeSchedulePrefix(value: string): string {
  return value.trim().replace(/[^A-Za-z0-9]/g, "").toLocaleUpperCase("id-ID").slice(0, 8);
}

/** Legacy-compatible prefix overrides (e.g. PAINT → PT). */
const LEGACY_PREFIX_MAP: Record<string, string> = {
  PAINT: "PT",
};

export function fallbackPrefix(category: string): string {
  const { key } = normalizeScheduleCategory(category);
  const mapped = LEGACY_PREFIX_MAP[key];
  if (mapped) return mapped;
  const alnum = key.replace(/[^A-Z0-9]/g, "");
  return (alnum.slice(0, 2) || "IT").padEnd(2, "X");
}

export function scheduleCode(prefix: string, increment: number): string {
  return `${normalizeSchedulePrefix(prefix)}-${String(increment).padStart(2, "0")}`;
}

export function optionLabel(index: number): string {
  let n = index + 1;
  let label = "";
  while (n > 0) {
    n -= 1;
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26);
  }
  return label;
}

/** Inverse of `optionLabel` ("A" → 0, "Z" → 25, "AA" → 26); -1 for anything else. */
export function optionLabelIndex(label: string): number {
  if (!/^[A-Z]+$/.test(label)) return -1;
  let n = 0;
  for (const char of label) n = n * 26 + (char.charCodeAt(0) - 64);
  return n - 1;
}

/** Next label after the highest existing one (legacy: last label + 1), so deleted labels are never reused. */
export function nextOptionLabel(existing: readonly string[]): string {
  const highest = existing.reduce((max, label) => Math.max(max, optionLabelIndex(label)), -1);
  return optionLabel(highest + 1);
}

export function compareOptionLabels(a: string, b: string): number {
  return optionLabelIndex(a) - optionLabelIndex(b) || a.localeCompare(b);
}

/** Split a sheet code like "PT-03" into prefix and increment; null when it is not a schedule code. */
export function parseScheduleCode(code: string): { prefix: string; increment: number } | null {
  const match = /^\s*([A-Za-z0-9]+)\s*-\s*(\d+)\s*$/.exec(code);
  if (!match) return null;
  const increment = Number(match[2]);
  if (!Number.isInteger(increment) || increment < 1) return null;
  return { prefix: normalizeSchedulePrefix(match[1]), increment };
}

export function scheduleSearchKey(input: ScheduleSnapshotInput): string {
  return [input.brandName, input.productName, input.skuText, input.color, input.pattern, input.finishing, input.dimension]
    .map((part) => (part ?? "").trim().toLocaleLowerCase("id-ID"))
    .filter(Boolean)
    .join(" | ");
}

export function nextGapless(entries: Array<{ increment: number }>): number {
  return entries.length + 1;
}

export function isPermutation(current: readonly string[], next: readonly string[]): boolean {
  if (current.length !== next.length) return false;
  const counts = new Map<string, number>();
  for (const id of current) counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const id of next) {
    const count = counts.get(id) ?? 0;
    if (count === 0) return false;
    if (count === 1) counts.delete(id);
    else counts.set(id, count - 1);
  }
  return counts.size === 0;
}

export function parseLegacyScheduleCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  row.push(field);
  if (row.some((cell) => cell.trim())) rows.push(row);
  const [header, ...body] = rows;
  if (!header) return [];
  const keys = header.map((cell) => cell.trim().toLocaleLowerCase("id-ID"));
  return body.map((cells) => Object.fromEntries(keys.map((key, index) => [key, cells[index]?.trim() ?? ""])));
}

/** One row of the legacy Google Sheets export (`lib/schedule/csv-parse.ts`). */
export type LegacySheetRow = {
  code: string;
  category: string | null;
  brand: string | null;
  product: string | null;
  initialsType: string | null;
  imageUrl: string | null;
  location: string | null;
  contact: string | null;
  qty: string | null;
  unit: string | null;
};

function sheetRecords(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) { record.push(field); field = ""; continue; }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      record.push(field); records.push(record); record = []; field = "";
      continue;
    }
    field += char;
  }
  if (field.length > 0 || record.length > 0) { record.push(field); records.push(record); }
  return records.map((r) => r.map((cell) => cell.trim())).filter((r) => r.some((cell) => cell.length > 0));
}

const header = (value: string) => value.replace(/^\uFEFF/, "").trim().toLowerCase();

/**
 * Parse the legacy Google Sheets schedule export. The header row may sit below
 * title rows; it starts with `code` and has `ex` + `type` (Material sheets also
 * `product category`). Returns null when no such header exists.
 */
export function parseLegacyScheduleSheet(text: string, section: ScheduleSection): LegacySheetRow[] | null {
  const records = sheetRecords(text);
  const required = section === "MATERIAL" ? ["product category", "ex", "type"] : ["ex", "type"];
  const headerIndex = records.findIndex((r) => {
    const cells = r.map(header);
    return cells[0] === "code" && required.every((name) => cells.includes(name));
  });
  if (headerIndex === -1) return null;
  const keys = records[headerIndex].map(header);
  const rows: LegacySheetRow[] = [];
  for (const record of records.slice(headerIndex + 1)) {
    const cell = (...names: string[]) => {
      for (const name of names) {
        const index = keys.indexOf(name);
        const value = index >= 0 ? (record[index] ?? "").trim() : "";
        if (value) return value;
      }
      return null;
    };
    const code = cell("code");
    if (!code) continue;
    rows.push({
      code,
      category: section === "MATERIAL" ? cell("product category", "product_category") : cell("category", "product category"),
      brand: cell("ex"),
      product: cell("type"),
      initialsType: cell("initials type", "initials_type"),
      imageUrl: cell("image"),
      location: cell("location"),
      contact: cell("contact"),
      // Legacy ignored quantity on Material sheets.
      qty: section === "MATERIAL" ? null : cell("qty", "schedule_qty"),
      unit: cell("unit", "schedule_unit"),
    });
  }
  return rows;
}
