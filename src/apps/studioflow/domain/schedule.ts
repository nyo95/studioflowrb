export const SCHEDULE_SECTIONS = ["MATERIAL", "FIXTURE"] as const;
export type ScheduleSection = (typeof SCHEDULE_SECTIONS)[number];

export const SCHEDULE_OPTION_STATUSES = ["DRAFT", "APPROVED", "NOT_USED"] as const;
export type ScheduleOptionStatus = (typeof SCHEDULE_OPTION_STATUSES)[number];

export type ScheduleSnapshotInput = {
  brandName?: string | null;
  productName: string;
  skuText?: string | null;
  color?: string | null;
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

export function fallbackPrefix(category: string): string {
  const { key } = normalizeScheduleCategory(category);
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

export function scheduleSearchKey(input: ScheduleSnapshotInput): string {
  return [input.brandName, input.productName, input.skuText, input.color, input.finishing, input.dimension]
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
