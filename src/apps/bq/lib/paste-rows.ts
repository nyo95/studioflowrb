/**
 * Rows copied from a spreadsheet (owner 2026-10-14, "Tempel dari Excel"): split the clipboard, guess what each column
 * is, and turn the rows into Work Items. Pure functions, no I/O; the screen shows the result for a check before saving.
 */

export type PasteColumnRole = "name" | "spec" | "qty" | "unit" | "price" | "ignore";
export const PASTE_COLUMN_ROLES: readonly PasteColumnRole[] = ["name", "spec", "qty", "unit", "price", "ignore"];
export const PASTE_ROLE_LABEL: Record<PasteColumnRole, string> = {
  name: "Uraian", spec: "Spesifikasi", qty: "Jumlah", unit: "Satuan", price: "Harga satuan", ignore: "Abaikan",
};

export type PastedItem = {
  name: string;
  qty: string;
  unit: string;
  specification: string;
  hargaSnapshot: string | null;
  priceMode: "PRICED" | "TBC" | "BY_OWNER";
};
export type PastePreviewRow = { line: number; item: PastedItem; notes: string[] };
export type PastePreview = { rows: PastePreviewRow[]; skipped: number; problems: string[] };

/** Office words for units the studio stores under another code. */
const UNIT_ALIASES: Record<string, string> = { titik: "point", "m'": "m", "m1": "m", "mtr": "m", "meter": "m", "lump sum": "ls", "lumpsum": "ls", "bh": "pcs", "buah": "pcs" };

const HEADER_WORDS: Array<[RegExp, PasteColumnRole]> = [
  [/^(no\.?|nomor|#)$/i, "ignore"],
  [/^(description|uraian|uraian pekerjaan|pekerjaan|item|nama)$/i, "name"],
  [/^(vol\.?|volume|qty|jumlah|kuantitas)$/i, "qty"],
  [/^(sat\.?|satuan|unit|uom)$/i, "unit"],
  [/^(spec\.?|specification|spesifikasi|keterangan)$/i, "spec"],
  [/^(rate|harga|harga satuan|unit price|price)$/i, "price"],
  [/^(total|total rate|jumlah harga|subtotal)$/i, "ignore"],
];

/** Splits clipboard text into rows of cells; a quoted cell may hold tabs and line breaks, as Excel writes them. */
export function splitClipboard(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const source = text.replace(/\r\n?/g, "\n");
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]!;
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') { cell += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && cell === "") quoted = true;
    else if (char === "\t") { row.push(cell); cell = ""; }
    else if (char === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += char;
  }
  if (cell !== "" || row.length > 0) { row.push(cell); rows.push(row); }
  return rows.map((cells) => cells.map((value) => value.trim())).filter((cells) => cells.some((value) => value !== ""));
}

/** "1.250.000", "1,250,000", "36,5", "36.5", "Rp 275.000" → a plain decimal string; null when it is not a number. */
export function parseNumber(raw: string): string | null {
  const text = raw.replace(/rp\.?/i, "").replace(/\s/g, "");
  if (!/^-?[\d.,]+$/.test(text) || !/\d/.test(text)) return null;
  const lastDot = text.lastIndexOf(".");
  const lastComma = text.lastIndexOf(",");
  let normalized: string;
  if (lastDot >= 0 && lastComma >= 0) {
    const decimalMark = lastDot > lastComma ? "." : ",";
    const thousands = decimalMark === "." ? "," : ".";
    normalized = text.split(thousands).join("").replace(decimalMark, ".");
  } else if (lastComma >= 0) {
    normalized = /^-?\d{1,3}(,\d{3})+$/.test(text) ? text.replace(/,/g, "") : text.replace(",", ".");
  } else if (lastDot >= 0) {
    normalized = /^-?\d{1,3}(\.\d{3})+$/.test(text) ? text.replace(/\./g, "") : text;
  } else normalized = text;
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  // Spreadsheets show 4079999.9999999995 for 4080000: keep 6 decimals at most, drop trailing zeros.
  const value = Number(normalized);
  return Number.isFinite(value) ? String(Math.round(value * 1e6) / 1e6) : null;
}

function headerRole(cell: string): PasteColumnRole | null {
  const word = cell.trim();
  for (const [pattern, role] of HEADER_WORDS) if (pattern.test(word)) return role;
  return null;
}

/** True when the first row names its columns (DESCRIPTION, VOL, SAT, …). */
export function hasHeaderRow(rows: string[][]): boolean {
  const first = rows[0] ?? [];
  return first.filter((cell) => headerRole(cell) !== null).length >= 2;
}

/** A guess per column: from the header when there is one, else from what the cells hold. */
export function guessColumns(rows: string[][], knownUnits: readonly string[]): PasteColumnRole[] {
  const width = Math.max(0, ...rows.map((row) => row.length));
  if (hasHeaderRow(rows)) {
    const roles = Array.from({ length: width }, (_, index) => headerRole(rows[0]![index] ?? "") ?? "ignore");
    return dedupe(roles);
  }
  const units = new Set([...knownUnits.map((unit) => unit.toLowerCase()), ...Object.keys(UNIT_ALIASES)]);
  const body = rows.filter((row) => !isGroupOrTotal(row));
  const stats = Array.from({ length: width }, (_, index) => {
    const cells = body.map((row) => row[index] ?? "").filter((cell) => cell !== "");
    const numbers = cells.map(parseNumber).filter((value): value is string => value !== null);
    return {
      filled: cells.length,
      numeric: cells.length > 0 && numbers.length >= cells.length * 0.8,
      max: numbers.reduce((top, value) => Math.max(top, Number(value)), 0),
      // Row numbers: whole numbers no bigger than the row count (a few repeats or gaps allowed).
      sequential: numbers.length === cells.length && numbers.every((value) => Number.isInteger(Number(value))) && numbers.reduce((top, value) => Math.max(top, Number(value)), 0) <= cells.length + 5,
      unitLike: cells.length > 0 && cells.filter((cell) => units.has(cell.toLowerCase())).length >= cells.length * 0.6,
      ownerLike: cells.some((cell) => cell.toLowerCase() === "by owner"),
      length: cells.reduce((sum, cell) => sum + cell.length, 0) / Math.max(1, cells.length),
    };
  });
  const roles: PasteColumnRole[] = stats.map(() => "ignore");
  let named = false;
  let priced = false;
  stats.forEach((stat, index) => {
    if (stat.filled === 0) return;
    if (stat.unitLike) { roles[index] = "unit"; return; }
    if (stat.numeric || stat.ownerLike) {
      if (index === 0 && stat.sequential) return; // a running number
      if (!priced && (stat.max >= 10_000 || stat.ownerLike)) { roles[index] = "price"; priced = true; return; }
      if (!roles.includes("qty") && stat.max < 10_000) { roles[index] = "qty"; return; }
      return; // a second large number column is usually the line total
    }
    if (!named) { roles[index] = "name"; named = true; return; }
    if (!roles.includes("spec")) roles[index] = "spec";
  });
  return dedupe(roles);
}

/** One column per role (the first wins); the rest are ignored. */
function dedupe(roles: PasteColumnRole[]): PasteColumnRole[] {
  const seen = new Set<PasteColumnRole>();
  return roles.map((role) => {
    if (role === "ignore") return role;
    if (seen.has(role)) return "ignore";
    seen.add(role);
    return role;
  });
}

/** Group headings ("A", "WALL WORK") and total rows are not Work Items. */
function isGroupOrTotal(row: string[]): boolean {
  const text = row.join(" ").toLowerCase();
  if (/\b(sub ?total|grand total|total)\b/.test(text)) return true;
  return /^[a-z]$/i.test(row[0] ?? "") && row.filter((cell) => cell !== "").length <= 2;
}

/** Resolves a typed unit to a studio unit code: the code itself, an office alias, or the text as typed. */
export function resolveUnit(raw: string, knownUnits: readonly string[]): { unit: string; note: string | null } {
  const typed = raw.trim().toLowerCase();
  if (!typed) return { unit: "ls", note: "Satuan kosong → ls" };
  const known = new Set(knownUnits.map((unit) => unit.toLowerCase()));
  if (known.has(typed)) return { unit: typed, note: null };
  const alias = UNIT_ALIASES[typed];
  if (alias && known.has(alias)) return { unit: alias, note: `"${raw.trim()}" dibaca sebagai ${alias}` };
  return { unit: typed, note: `Satuan "${raw.trim()}" belum ada di Master Data` };
}

/** Turns the pasted rows into Work Items with notes per row; group headings, totals and empty names are skipped. */
export function buildPastePreview(rows: string[][], roles: readonly PasteColumnRole[], options: { withPrices: boolean; knownUnits: readonly string[] }): PastePreview {
  const at = (role: PasteColumnRole) => roles.indexOf(role);
  const problems: string[] = [];
  if (at("name") < 0) problems.push("Pilih kolom mana yang berisi Uraian.");
  const body = hasHeaderRow(rows) ? rows.slice(1) : rows;
  const preview: PastePreviewRow[] = [];
  let skipped = 0;
  body.forEach((row, index) => {
    const cell = (role: PasteColumnRole) => (at(role) >= 0 ? row[at(role)] ?? "" : "").trim();
    const name = cell("name");
    if (!name || isGroupOrTotal(row)) { skipped += 1; return; }
    const notes: string[] = [];
    const qty = parseNumber(cell("qty") || "1");
    if (qty === null || Number(qty) <= 0) notes.push(`Jumlah "${cell("qty")}" tidak terbaca → 1`);
    const unit = resolveUnit(cell("unit"), options.knownUnits);
    if (unit.note) notes.push(unit.note);
    const rawPrice = cell("price");
    let priceMode: PastedItem["priceMode"] = "PRICED";
    let hargaSnapshot: string | null = null;
    if (/^by ?owner$/i.test(rawPrice)) { priceMode = "BY_OWNER"; notes.push("Ditandai By Owner"); }
    else if (!options.withPrices) { priceMode = "TBC"; notes.push("Harga diisi nanti (TBC)"); }
    else if (!rawPrice || rawPrice === "-") { priceMode = "TBC"; notes.push("Harga kosong → TBC"); }
    else {
      hargaSnapshot = parseNumber(rawPrice);
      if (hargaSnapshot === null || Number(hargaSnapshot) < 0) { priceMode = "TBC"; hargaSnapshot = null; notes.push(`Harga "${rawPrice}" tidak terbaca → TBC`); }
    }
    preview.push({
      line: (hasHeaderRow(rows) ? index + 2 : index + 1),
      item: { name: name.slice(0, 160), qty: qty !== null && Number(qty) > 0 ? qty : "1", unit: unit.unit, specification: cell("spec").slice(0, 1000), hargaSnapshot, priceMode },
      notes,
    });
  });
  if (preview.length > 500) problems.push("Paling banyak 500 pekerjaan sekali tempel.");
  return { rows: preview, skipped, problems };
}
