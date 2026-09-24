export const SCHEDULE_SECTIONS = ["MATERIAL", "FIXTURE"] as const;
export type ScheduleSection = (typeof SCHEDULE_SECTIONS)[number];

/** One photo per option; prepared (cropped JPEG) upload stays under the server-action body limit. */
export const SCHEDULE_IMAGE_BYTES = 3 * 1024 * 1024;

export const SCHEDULE_OPTION_STATUSES = ["DRAFT", "APPROVED", "NOT_USED"] as const;
export type ScheduleOptionStatus = (typeof SCHEDULE_OPTION_STATUSES)[number];

/**
 * Board card fields, in the order they render. `card_fields = null` on an entry
 * means "no override" and renders SCHEDULE_DEFAULT_CARD_FIELDS; an array is an
 * explicit choice and may legitimately be empty (show captions for nothing),
 * matching legacy's null-vs-list distinction. Type (the product designation) is
 * the card's title and is always shown, so it is not a toggle.
 */
export const SCHEDULE_CARD_FIELD_KEYS = ["brand", "color", "pattern", "finishing", "dimension", "location", "qty", "notes"] as const;
export type ScheduleCardFieldKey = (typeof SCHEDULE_CARD_FIELD_KEYS)[number];

/** What a card shows until someone chooses otherwise (owner decision 2026-09-23). */
export const SCHEDULE_DEFAULT_CARD_FIELDS: readonly ScheduleCardFieldKey[] = ["brand", "color", "finishing", "location", "notes"];

/** Extra (free-form) spec fields are addressed as `x:<slug>` in a card-field list. */
export const SCHEDULE_EXTRA_KEY_PREFIX = "x:";
/** Per option; a spec sheet with more than this is a document, not a card. */
export const SCHEDULE_EXTRA_MAX = 12;
export const SCHEDULE_EXTRA_LABEL_MAX = 60;
export const SCHEDULE_EXTRA_VALUE_MAX = 300;

/** One free-form specification line the studio added to an option, e.g. "Abrasion class" / "PEI IV". */
export type ScheduleExtraField = { label: string; value: string };

export type ScheduleSnapshotInput = {
  brandName?: string | null;
  productName: string;
  color?: string | null;
  pattern?: string | null;
  finishing?: string | null;
  dimension?: string | null;
  extra?: readonly ScheduleExtraField[] | null;
};

/** Stable key for an extra field, derived from its label so the choice survives re-ordering. */
export function extraFieldKey(label: string): string {
  return SCHEDULE_EXTRA_KEY_PREFIX + label.trim().toLocaleLowerCase("id-ID").replace(/\s+/g, "-").slice(0, SCHEDULE_EXTRA_LABEL_MAX);
}

export function isScheduleCardFieldKey(value: string): boolean {
  if ((SCHEDULE_CARD_FIELD_KEYS as readonly string[]).includes(value)) return true;
  return value.startsWith(SCHEDULE_EXTRA_KEY_PREFIX) && value.length > SCHEDULE_EXTRA_KEY_PREFIX.length && value.length <= SCHEDULE_EXTRA_KEY_PREFIX.length + SCHEDULE_EXTRA_LABEL_MAX;
}

/**
 * Canonical render order: the standard fields in declaration order, then extra
 * fields in the order they sit on the option. Legacy re-sorted the same way, so
 * toggling a field off and on again never moves its row to the bottom.
 */
export function orderCardFields(fields: readonly string[], extraKeys: readonly string[] = []): string[] {
  const chosen = new Set(fields);
  const ordered: string[] = [...SCHEDULE_CARD_FIELD_KEYS].filter((key) => chosen.has(key));
  for (const key of extraKeys) if (chosen.has(key) && !ordered.includes(key)) ordered.push(key);
  // Extras whose option has since been edited away keep their place at the end
  // rather than being silently dropped from the stored choice.
  for (const key of fields) if (isScheduleCardFieldKey(key) && !ordered.includes(key)) ordered.push(key);
  return ordered;
}

export function normalizeExtraFields(input: unknown): ScheduleExtraField[] {
  if (!Array.isArray(input)) return [];
  const out: ScheduleExtraField[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const label = String((raw as { label?: unknown }).label ?? "").trim().replace(/\s+/g, " ").slice(0, SCHEDULE_EXTRA_LABEL_MAX);
    const value = String((raw as { value?: unknown }).value ?? "").trim().slice(0, SCHEDULE_EXTRA_VALUE_MAX);
    if (!label || !value) continue;
    const key = extraFieldKey(label);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label, value });
    if (out.length === SCHEDULE_EXTRA_MAX) break;
  }
  return out;
}

// ── Board/print card view — shared by the on-screen ScheduleBoard and the
// printable catalogue route so a card renders identically in both places.
// The printed sheet must show exactly what the on-screen card shows, not a
// re-derived approximation, so both call these same functions.

export type ScheduleSampleRequestView = {
  id: string;
  status: "REQUESTED" | "RECEIVED";
  requestedFrom: string;
  note: string | null;
  requestedByName: string;
  requestedAt: Date;
  receivedByName: string | null;
  receivedAt: Date | null;
  receivedNote: string | null;
};

export type ScheduleOptionView = {
  id: string;
  label: string;
  isFinal: boolean;
  status: string;
  brandId: string | null;
  brandName: string | null;
  productName: string;
  color: string | null;
  pattern: string | null;
  finishing: string | null;
  dimension: string | null;
  notes: string | null;
  /** Free-form spec lines beyond the typed columns. */
  extra: ScheduleExtraField[];
  /** Short-lived signed URL of the option photo. */
  imageUrl: string | null;
  /** Latest physical sample request against this option, if any. */
  sampleRequest: ScheduleSampleRequestView | null;
};

export type ScheduleEntryView = {
  id: string;
  section: ScheduleSection;
  category: string;
  code: string;
  qty: string | null;
  unit: string | null;
  location: string | null;
  /** null = no override; the card renders SCHEDULE_DEFAULT_CARD_FIELDS. */
  cardFields: string[] | null;
  options: ScheduleOptionView[];
};

export const SCHEDULE_SECTION_LABEL: Record<ScheduleSection, string> = { MATERIAL: "Material", FIXTURE: "Fixture" };

export function specLine(option: Pick<ScheduleOptionView, "color" | "pattern" | "finishing" | "dimension">): string {
  return [option.color, option.pattern, option.finishing, option.dimension].filter(Boolean).join(" · ");
}

export function finalOf(entry: ScheduleEntryView): ScheduleOptionView | null {
  return entry.options.find((option) => option.isFinal) ?? null;
}

/**
 * The option a card speaks for: the final one, else the first. Legacy fell back
 * the same way (`selectedCatalogOption`), so a row with one unapproved option
 * still shows its product instead of reading as empty.
 */
export function shownOptionOf(entry: ScheduleEntryView): ScheduleOptionView | null {
  return finalOf(entry) ?? entry.options[0] ?? null;
}

/** The option a template would be made from: the final one, or the only one. */
export function templateSourceOf(entry: ScheduleEntryView): ScheduleOptionView | null {
  return finalOf(entry) ?? (entry.options.length === 1 ? entry.options[0] : null);
}

/**
 * One label per field, used on the card and in the edit form alike. Type is the
 * product designation ("Nude Pro - ATS 1132 M"): it is the card's title, always
 * shown, so it is not in this list.
 */
export const SCHEDULE_CARD_FIELD_LABEL: Record<ScheduleCardFieldKey, string> = {
  brand: "Brand",
  color: "Color",
  pattern: "Pattern",
  finishing: "Finishing",
  dimension: "Size",
  location: "Location",
  qty: "Qty",
  notes: "Notes",
};

/** The free-form spec lines a card can caption, in the order they sit on the option. */
export function extraChoicesOf(entry: ScheduleEntryView): Array<{ key: string; label: string }> {
  const shown = shownOptionOf(entry);
  return (shown?.extra ?? []).map((field) => ({ key: extraFieldKey(field.label), label: field.label }));
}

export function cardFieldLabel(key: string, extras: ReadonlyArray<{ key: string; label: string }>): string {
  return SCHEDULE_CARD_FIELD_LABEL[key as ScheduleCardFieldKey] ?? extras.find((extra) => extra.key === key)?.label ?? key;
}

/**
 * Which fields caption a board card. `cardFields === null` means "no override"
 * and renders the default set plus every extra spec line the option carries;
 * an array is an explicit, ordered choice and may legitimately be empty.
 * Matches legacy's null-vs-list `catalog_fields` and its "Use project default".
 */
/** Shared by `effectiveCardFields` and any client-side draft mirroring the same null-vs-list choice before it is saved. */
export function resolveCardFields(override: readonly string[] | null, extraKeys: readonly string[]): string[] {
  if (override !== null) return orderCardFields(override, extraKeys);
  return orderCardFields([...SCHEDULE_DEFAULT_CARD_FIELDS, ...extraKeys], extraKeys);
}

export function effectiveCardFields(entry: ScheduleEntryView): string[] {
  const extras = extraChoicesOf(entry);
  return resolveCardFields(entry.cardFields, extras.map((extra) => extra.key));
}

/** The current display value for each selectable card field — what the board card itself renders. */
export function cardFieldValuesOf(entry: ScheduleEntryView): Record<string, string | null | undefined> {
  const shown = shownOptionOf(entry);
  const quantity = entry.qty ? `${entry.qty}${entry.unit ? ` ${entry.unit}` : ""}` : null;
  return {
    brand: shown?.brandName,
    color: shown?.color,
    pattern: shown?.pattern,
    finishing: shown?.finishing,
    dimension: shown?.dimension,
    location: entry.location,
    qty: quantity,
    notes: shown?.notes,
    ...Object.fromEntries((shown?.extra ?? []).map((field) => [extraFieldKey(field.label), field.value])),
  };
}

/**
 * Values that state "nothing was specified yet". Ported from legacy
 * `schedule-spec-fields.ts`: a row whose brand and type are both placeholders
 * is kept out of the cross-project reuse pool instead of polluting every search.
 */
const SPEC_PLACEHOLDERS = new Set([
  "N/A", "UNKNOWN", "PENDING", "-", "—", "[RESERVED]", "GENERIC", "DRAFT",
  "MANUAL ITEM", "NEW ITEM", "CUSTOM", "MANUAL",
]);

export function isSpecPlaceholder(value: string | null | undefined): boolean {
  const text = (value ?? "").trim();
  return text.length === 0 || SPEC_PLACEHOLDERS.has(text.toLocaleUpperCase("id-ID"));
}

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

/**
 * Project-local + cross-project reuse key. Empty when the row carries no real
 * specification (brand and type both placeholder), which keeps it out of the
 * reuse search: `searchReusableOptions` requires a two-character query, and no
 * query matches an empty key.
 */
export function scheduleSearchKey(input: ScheduleSnapshotInput): string {
  if (isSpecPlaceholder(input.brandName) && isSpecPlaceholder(input.productName)) return "";
  return [
    input.brandName,
    input.productName,
    input.color,
    input.pattern,
    input.finishing,
    input.dimension,
    ...(input.extra ?? []).flatMap((field) => [field.label, field.value]),
  ]
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
