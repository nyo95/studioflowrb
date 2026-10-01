import { createHash } from "node:crypto";

import { type PrismaClient } from "@/generated/prisma/client";
import { prepareAuditEvent, type AuditActor } from "@platform/core/audit";
import { AppError } from "@platform/core/errors";
import { requirePermission, type PermissionGrants } from "@platform/core/rbac";
import { createWorkbook, loadWorkbook, workbookToBuffer, type Workbook, type WorkbookCellValue, type Worksheet, type WorksheetRow } from "@platform/utilities/tabular";
import { titleCaseWords } from "@platform/utilities/text-case";

import { MASTERDATA_PERMISSIONS, type MasterDataServicePorts, requiredAmount } from "./shared";

/**
 * The supplier-and-price database workbook, shaped like the owner's own Excel file so an existing file can be imported
 * and an export can be edited and brought back:
 * - "Database - <Supplier type>" sheets: Nama <type>, Kategori Pekerjaan, Alamat, No. HP / WA (1 and 2), Email,
 *   IG / Website, Nama PIC, Termin Pembayaran, Catatan. One sheet per supplier type.
 * - "Database Harga - <name>" sheets: a title, a header row (No, Nama Material, Spesifikasi, Satuan, one column per
 *   supplier, Catatan), section heading rows (FLOOR WORKS ...) that become the pricing category, and item rows with an
 *   amount per supplier. A "Harga Beli / Sumber" list layout (one supplier per row) is read too.
 * Importing is all or nothing and previewed first: the preview runs the real import and rolls it back.
 */

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_ITEMS = 1500;
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const UNIT_ALIASES: Readonly<Record<string, string>> = { mtr: "m", nos: "pcs", no: "pcs", pc: "pcs", unit: "pcs", lembar: "sheet" };

export type PriceDatabaseOptions = { priceKind: "labor" | "material-labor"; defaultUnitId?: string | null };
type WorkbookFile = Buffer | { data: Buffer; name?: string; type?: string };
type Message = { level: "info" | "warning" | "error"; sheet?: string; row?: number; message: string };
type ParsedSupplier = { sheet: string; row: number; typeName: string; name: string; categories: string[]; address: string | null; phones: string[]; email: string | null; pic: string | null; notes: string | null };
type ParsedItem = { sheet: string; row: number; category: string; area: string; name: string; notes: string; unitText: string; amounts: Array<{ supplier: string; pic: string | null; amount: string }> };
type Parsed = { suppliers: ParsedSupplier[]; items: ParsedItem[]; messages: Message[] };
type Totals = { suppliersCreated: number; suppliersExisting: number; suppliersFromPrices: number; categoriesCreated: number; pricesCreated: number; pricesUpdated: number; pricesUnchanged: number };
type RunResult = { totals: Totals; messages: Message[]; errors: Message[] };

class DryRun extends Error { constructor(readonly result: RunResult) { super("dry run"); } }

const key = (value: string) => value.trim().toLocaleLowerCase();
const bytesOf = (file: WorkbookFile) => Buffer.isBuffer(file) ? { data: file, name: undefined as string | undefined } : { data: file.data, name: file.name };
const fileError = (message: string): never => { throw new AppError("VALIDATION", "PRICE_DATABASE_WORKBOOK_INVALID", message); };
const emptyText = (value: string) => value === "" || /^-+$/.test(value) || /^(n\/a|tbc|tba|by request)$/i.test(value);

const SHOUTED_FILLER = new Set(["AND", "DAN", "THE", "FOR", "ATAU", "OF"]);

/** Section headings are often typed in capitals ("FLOOR WORKS"). Make them a normal name; short words such as MEP or DB stay as acronyms. */
function headingName(text: string): string {
  const trimmed = text.trim();
  if (trimmed !== trimmed.toLocaleUpperCase() || !/[A-Z]/.test(trimmed)) return titleCaseWords(trimmed);
  return titleCaseWords(trimmed.split(/\s+/).map((word) => (word.length <= 3 && !SHOUTED_FILLER.has(word) ? word : word.charAt(0) + word.slice(1).toLocaleLowerCase())).join(" "));
}

function cellText(value: WorkbookCellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const object = value as unknown as Record<string, unknown>;
  if (Array.isArray(object.richText)) return (object.richText as Array<{ text: string }>).map((part) => part.text).join("").trim();
  if (object.result !== undefined && object.result !== null) return cellText(object.result as WorkbookCellValue);
  if (typeof object.text === "string") return object.text.trim();
  return "";
}

/** "Rp 1.250.000", "135000", 135000, "-" and "By Request" -> a plain decimal string, null for no price, undefined for unreadable. */
function readAmount(value: WorkbookCellValue): string | null | undefined {
  if (typeof value === "number") return value < 0 || !Number.isFinite(value) ? undefined : Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
  const raw = cellText(value).replace(/^rp\.?\s*/i, "").trim();
  if (emptyText(raw)) return null;
  const text = raw.replace(/\s/g, "");
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(text)) return text.replace(/\./g, "").replace(",", ".");
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(text)) return text.replace(/,/g, "");
  if (/^\d+([.,]\d+)?$/.test(text)) return text.replace(",", ".");
  return undefined;
}

function findHeader(ws: Worksheet): { row: number; headers: string[] } | null {
  for (let r = 1; r <= Math.min(ws.rowCount, 15); r += 1) {
    const headers: string[] = [];
    ws.getRow(r).eachCell({ includeEmpty: false }, (cell, col) => { headers[col] = cellText(cell.value); });
    const lower = headers.map((header) => (header ?? "").toLocaleLowerCase());
    if (lower.some((h) => /^nama (subcon|supplier|vendor|toko)/.test(h)) && lower.some((h) => h.startsWith("alamat"))) return { row: r, headers };
    if (lower.some((h) => /^nama (material|item|pekerjaan)/.test(h))) return { row: r, headers };
  }
  return null;
}

function splitList(value: string): string[] {
  return value.split(/[,;/]/).map((part) => part.trim()).filter((part) => part && !emptyText(part));
}

function parseWorkbook(workbook: Workbook): Parsed {
  const parsed: Parsed = { suppliers: [], items: [], messages: [] };
  for (const ws of workbook.worksheets) {
    const sheet = ws.name;
    const header = findHeader(ws);
    if (!header) { parsed.messages.push({ level: "info", sheet, message: "Ignored: no supplier or price table found." }); continue; }
    const lower = header.headers.map((h) => (h ?? "").toLocaleLowerCase());
    const col = (test: (h: string) => boolean) => lower.findIndex((h) => h !== undefined && test(h));
    const isSupplierSheet = lower.some((h) => /^nama (subcon|supplier|vendor|toko)/.test(h)) && lower.some((h) => h.startsWith("alamat"));

    if (isSupplierSheet) {
      const typeMatch = /^database\s*[-–—]\s*(.+)$/i.exec(sheet.trim());
      const nameCol = col((h) => /^nama (subcon|supplier|vendor|toko)/.test(h));
      const typeName = typeMatch ? typeMatch[1]!.trim() : header.headers[nameCol]!.replace(/^nama\s+/i, "").trim();
      const phoneCols = lower.map((h, i) => (/^no\.?\s*hp/.test(h) ? i : -1)).filter((i) => i >= 0);
      const cols = { category: col((h) => h.startsWith("kategori")), address: col((h) => h.startsWith("alamat")), email: col((h) => h === "email"), links: col((h) => h.startsWith("ig")), pic: col((h) => /^nama pic/.test(h)), terms: col((h) => h.startsWith("termin")), notes: col((h) => h.startsWith("catatan")) };
      for (let r = header.row + 1; r <= ws.rowCount; r += 1) {
        const row = ws.getRow(r);
        const get = (c: number) => (c > 0 ? cellText(row.getCell(c).value) : "");
        const name = get(nameCol);
        if (!name) continue;
        const clean = (c: number) => { const text = get(c); return emptyText(text) ? null : text; };
        const notes = [clean(cols.notes), clean(cols.terms) ? `Payment terms: ${clean(cols.terms)}` : null, clean(cols.links) ? `IG / Website: ${clean(cols.links)}` : null].filter(Boolean).join("\n");
        parsed.suppliers.push({
          sheet, row: r, typeName, name: titleCaseWords(name), categories: splitList(get(cols.category)), address: clean(cols.address),
          phones: phoneCols.map((c) => get(c)).filter((phone) => !emptyText(phone)), email: clean(cols.email), pic: clean(cols.pic), notes: notes || null,
        });
      }
      continue;
    }

    // Price sheet.
    if (lower.some((h) => /^harga (lama|baru)/.test(h))) { parsed.messages.push({ level: "warning", sheet, message: "Skipped: size-based sheets with old and new prices are not supported yet." }); continue; }
    const nameCol = col((h) => /^nama (material|item|pekerjaan)/.test(h));
    const specCol = col((h) => h.startsWith("spesifikasi"));
    const unitCol = col((h) => h === "satuan");
    const notesCol = col((h) => h.startsWith("catatan"));
    const amountListCol = col((h) => h.startsWith("harga beli"));
    const sourceCol = col((h) => h.startsWith("sumber"));
    const typeCol = col((h) => h === "jenis");
    const listLayout = amountListCol > 0 && sourceCol > 0;
    const firstSupplierCol = Math.max(nameCol, specCol, unitCol) + 1;
    const supplierCols: Array<{ col: number; name: string; pic: string | null }> = [];
    if (!listLayout) {
      for (let c = firstSupplierCol; c < header.headers.length; c += 1) {
        const text = header.headers[c] ?? "";
        if (!text || c === notesCol || /^(no|ukuran|jenis|sumber)\b/i.test(text)) continue;
        const match = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(text);
        supplierCols.push({ col: c, name: titleCaseWords(match ? match[1]!.trim() : text), pic: match ? titleCaseWords(match[2]!.trim()) : null });
      }
      if (supplierCols.length === 0) { parsed.messages.push({ level: "warning", sheet, message: "Skipped: no supplier columns found after the Spesifikasi/Satuan columns." }); continue; }
    }
    const fallbackCategory = titleCaseWords((/^database harga\s*[-–—]\s*(.+)$/i.exec(sheet.trim())?.[1] ?? sheet).trim());
    let section = "";
    let area = "";
    for (let r = header.row + 1; r <= ws.rowCount; r += 1) {
      const row = ws.getRow(r);
      const texts: string[] = [];
      row.eachCell({ includeEmpty: false }, (cell, c) => { const t = cellText(cell.value); if (t) texts[c] = t; });
      const filled = texts.filter((t) => t !== undefined);
      if (filled.length === 0) continue;
      const name = nameCol > 0 ? texts[nameCol] ?? "" : "";
      // A merged heading repeats one non-numeric text across the row; real item rows carry an amount or differ cell to cell.
      if (new Set(filled).size === 1 && readAmount(filled[0]!) === undefined) { section = headingName(filled[0]!); area = ""; continue; }
      // A lone name with nothing else on the row is a sub-heading (an area such as "Store Area") for the rows below it.
      if (name && filled.length === 1 && texts[nameCol] === name && readAmount(name) === undefined) { area = titleCaseWords(name); continue; }
      if (!name || /^total\b/i.test(name)) continue;
      const spec = specCol > 0 ? texts[specCol] ?? "" : "";
      const ref = notesCol > 0 ? texts[notesCol] ?? "" : "";
      const notes = [spec && !emptyText(spec) ? spec : "", ref && !emptyText(ref) ? `Ref: ${ref}` : ""].filter(Boolean).join(" · ");
      const amounts: ParsedItem["amounts"] = [];
      const item: ParsedItem = { sheet, row: r, area, category: section || (typeCol > 0 && texts[typeCol] ? headingName(texts[typeCol]!) : fallbackCategory), name: titleCaseWords(name), notes, unitText: unitCol > 0 ? texts[unitCol] ?? "" : "", amounts };
      let bad = false;
      if (listLayout) {
        const amount = readAmount(row.getCell(amountListCol).value);
        const supplier = texts[sourceCol] ?? "";
        if (amount === undefined) { parsed.messages.push({ level: "error", sheet, row: r, message: `Amount "${texts[amountListCol]}" is not a number.` }); bad = true; }
        else if (amount && supplier) amounts.push({ supplier: titleCaseWords(supplier), pic: null, amount });
      } else {
        for (const supplier of supplierCols) {
          const amount = readAmount(row.getCell(supplier.col).value);
          if (amount === undefined) { parsed.messages.push({ level: "error", sheet, row: r, message: `${supplier.name}: amount "${texts[supplier.col]}" is not a number.` }); bad = true; continue; }
          if (amount) amounts.push({ supplier: supplier.name, pic: supplier.pic, amount });
        }
      }
      if (bad) continue;
      if (amounts.length === 0) { parsed.messages.push({ level: "info", sheet, row: r, message: `"${item.name}" has no amounts and was skipped.` }); continue; }
      parsed.items.push(item);
    }
  }
  if (parsed.items.length > MAX_ITEMS) fileError(`The workbook has more than ${MAX_ITEMS} price rows.`);
  return parsed;
}

export function createPriceDatabaseWorkbookService(
  db: PrismaClient,
  ports: MasterDataServicePorts,
  createScopedService: (tx: unknown) => Record<string, (input: any) => Promise<any>>,
) {
  async function load(file: WorkbookFile): Promise<{ data: Buffer; parsed: Parsed }> {
    const { data, name } = bytesOf(file);
    if (data.length > MAX_BYTES) fileError("The workbook is larger than 8 MB.");
    if (name && !/\.xlsx$/i.test(name)) fileError("Choose an .xlsx file.");
    const workbook = await loadWorkbook(data).catch(() => null);
    if (!workbook) return fileError("The file could not be read as an Excel workbook.");
    return { data, parsed: parseWorkbook(workbook) };
  }

  function requireImport(grants: PermissionGrants) {
    requirePermission(grants, MASTERDATA_PERMISSIONS.vendorManage);
    requirePermission(grants, MASTERDATA_PERMISSIONS.priceWorkManage);
  }

  async function run(tx: PrismaClient, grants: PermissionGrants, actor: AuditActor, parsed: Parsed, options: PriceDatabaseOptions): Promise<RunResult> {
    const s = createScopedService(tx);
    const totals: Totals = { suppliersCreated: 0, suppliersExisting: 0, suppliersFromPrices: 0, categoriesCreated: 0, pricesCreated: 0, pricesUpdated: 0, pricesUnchanged: 0 };
    const messages: Message[] = parsed.messages.filter((m) => m.level !== "error");
    const errors: Message[] = parsed.messages.filter((m) => m.level === "error");
    const [types, units, categories, vendors] = await Promise.all([
      tx.vendorType.findMany({ where: { deleted_at: null } }),
      tx.unit.findMany({ where: { status: "ACTIVE" } }),
      tx.category.findMany({ where: { status: "ACTIVE" } }),
      tx.vendor.findMany({ where: { deleted_at: null }, include: { types: { include: { vendor_type: true } } } }),
    ]);
    const vendorByKey = new Map(vendors.map((vendor) => [key(vendor.name), { id: vendor.id, labor: vendor.types.some((t) => t.vendor_type.can_supply_labor) }] as const));
    const categoryCache = new Map<string, string>();
    const categoryId = async (name: string, where: { sheet?: string; row?: number }): Promise<string | null> => {
      const k = key(name);
      if (categoryCache.has(k)) return categoryCache.get(k)!;
      const matches = categories.filter((c) => key(c.name) === k);
      const found = matches.find((c) => c.kind === "WORK") ?? matches[0];
      if (found) { categoryCache.set(k, found.id); return found.id; }
      try {
        const created = await s.createCategory!({ grants, actor, name, kind: "WORK" });
        categoryCache.set(k, created.categoryId);
        totals.categoriesCreated += 1;
        return created.categoryId;
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
        errors.push({ sheet: where.sheet, row: where.row, level: "error", message: `Category "${name}": ${error.safeMessage}` });
        return null;
      }
    };
    const typeFor = (name: string) => types.find((t) => key(t.name) === key(name) || key(t.code) === key(name));

    // 1. Supplier sheets.
    for (const supplier of parsed.suppliers) {
      const where = { level: "error" as const, sheet: supplier.sheet, row: supplier.row };
      if (vendorByKey.has(key(supplier.name))) { totals.suppliersExisting += 1; continue; }
      const type = typeFor(supplier.typeName);
      if (!type) { errors.push({ ...where, message: `Supplier type "${supplier.typeName}" does not exist. Add it under Settings, or rename the sheet.` }); continue; }
      const categoryIds: string[] = [];
      for (const name of supplier.categories) { const id = await categoryId(name, where); if (id) categoryIds.push(id); }
      const person = supplier.pic ?? (supplier.phones.length || supplier.email ? supplier.name : null);
      try {
        const created = await s.createVendor!({ grants, actor, name: supplier.name, address: supplier.address ?? undefined, notes: supplier.notes ?? undefined, vendorTypeIds: [type.id], categoryIds, contacts: person ? [{ personName: person, phones: supplier.phones.slice(0, 3), email: supplier.email, isPrimary: true }] : [] });
        vendorByKey.set(key(supplier.name), { id: created.vendorId, labor: type.can_supply_labor });
        totals.suppliersCreated += 1;
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
        errors.push({ ...where, message: `${supplier.name}: ${error.safeMessage}` });
      }
    }

    // 2. Price sheets.
    const unitFor = (text: string) => {
      const k = key(text);
      const alias = UNIT_ALIASES[k] ?? k;
      return units.find((u) => key(u.code) === alias || key(u.name) === k || key(u.code) === k)?.id ?? options.defaultUnitId ?? null;
    };
    const subcon = typeFor("SUBCON");
    type Cell = { item: ParsedItem; name: string; vendorId: string; amount: string; unitId: string; categoryId: string };
    const cells: Cell[] = [];
    for (const item of parsed.items) {
      const where = { level: "error" as const, sheet: item.sheet, row: item.row };
      const cat = await categoryId(item.category, where);
      const unitId = unitFor(item.unitText);
      if (!unitId) { errors.push({ ...where, message: `Unit "${item.unitText || "(none)"}" is not a known unit. Add it under Units, or choose a default unit.` }); continue; }
      if (!cat) continue;
      for (const amount of item.amounts) {
        let vendor = vendorByKey.get(key(amount.supplier));
        if (!vendor) {
          if (!subcon) { errors.push({ ...where, message: `Supplier "${amount.supplier}" does not exist and there is no Subcon type to create it with.` }); continue; }
          try {
            const created = await s.createVendor!({ grants, actor, name: amount.supplier, vendorTypeIds: [subcon.id], contacts: amount.pic ? [{ personName: amount.pic, isPrimary: true }] : [] });
            vendor = { id: created.vendorId, labor: subcon.can_supply_labor };
            vendorByKey.set(key(amount.supplier), vendor);
            totals.suppliersFromPrices += 1;
            messages.push({ level: "warning", sheet: item.sheet, row: item.row, message: `Supplier "${amount.supplier}" was not in the supplier sheets and is created as ${subcon.name}.` });
          } catch (error) {
            if (!(error instanceof AppError)) throw error;
            errors.push({ ...where, message: `${amount.supplier}: ${error.safeMessage}` });
            continue;
          }
        }
        if (!vendor.labor) { errors.push({ ...where, message: `${amount.supplier} cannot provide labor, so it cannot hold a work price.` }); continue; }
        let normalized: string;
        try { normalized = requiredAmount(amount.amount); } catch { errors.push({ ...where, message: `${amount.supplier}: amount "${amount.amount}" is not valid.` }); continue; }
        cells.push({ item, name: item.name, vendorId: vendor.id, amount: normalized, unitId, categoryId: cat });
      }
    }

    // The same item name can be priced once per area for one supplier ("Second Skin Partition" in Shopfront Area and in Store Area).
    // Within one import such repeats are told apart by their area, so each keeps its own price.
    const repeats = new Map<string, number>();
    for (const cell of cells) repeats.set(`${cell.vendorId}|${key(cell.name)}`, (repeats.get(`${cell.vendorId}|${key(cell.name)}`) ?? 0) + 1);
    for (const cell of cells) if ((repeats.get(`${cell.vendorId}|${key(cell.name)}`) ?? 0) > 1) cell.name = `${cell.item.name} (${cell.item.area || cell.item.category})`;
    const priceTable: any = options.priceKind === "labor" ? tx.priceLabor : tx.priceMaterialLabor;
    const existing: Array<any> = cells.length ? await priceTable.findMany({ where: { deleted_at: null, vendor_id: { in: [...new Set(cells.map((cell) => cell.vendorId))] } } }) : [];
    const existingByKey = new Map(existing.map((price) => [`${price.vendor_id}|${key(price.name)}`, price] as const));
    const toCreate = new Map<string, Cell[]>(); // category|vendor -> cells
    for (const cell of cells) {
      const where = { level: "error" as const, sheet: cell.item.sheet, row: cell.item.row };
      const found = existingByKey.get(`${cell.vendorId}|${key(cell.name)}`);
      if (!found) { const groupKey = `${cell.categoryId}|${cell.vendorId}`; toCreate.set(groupKey, [...(toCreate.get(groupKey) ?? []), cell]); continue; }
      const notes = cell.item.notes || null;
      if (found.amount.toString() === cell.amount && found.unit_id === cell.unitId && found.category_id === cell.categoryId && (found.notes ?? null) === notes) { totals.pricesUnchanged += 1; continue; }
      try {
        const common = { grants, actor, name: found.name, categoryId: cell.categoryId, vendorId: cell.vendorId, unitId: cell.unitId, amount: cell.amount, currency: found.currency, notes };
        if (options.priceKind === "labor") await s.updatePriceLabor!({ ...common, priceLaborId: found.id });
        else await s.updatePriceMaterialLabor!({ ...common, priceMaterialLaborId: found.id, scopeNote: found.scope_note });
        totals.pricesUpdated += 1;
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
        errors.push({ ...where, message: `${cell.name}: ${error.safeMessage}` });
      }
    }
    for (const group of toCreate.values()) {
      for (let start = 0; start < group.length; start += 100) {
        const chunk = group.slice(start, start + 100);
        try {
          const created = await s.createWorkPricesBulk!({ grants, actor, kind: options.priceKind, vendorId: chunk[0]!.vendorId, categoryId: chunk[0]!.categoryId, currency: "IDR", rows: chunk.map((cell) => ({ name: cell.name, unitId: cell.unitId, amount: cell.amount, notes: cell.item.notes || null })) });
          totals.pricesCreated += created.ids.length;
        } catch (error) {
          if (!(error instanceof AppError)) throw error;
          const rows = (error.details as { rows?: Array<{ rowIndex: number; message: string }> } | undefined)?.rows;
          if (error.code === "BULK_ROWS_INVALID" && rows) for (const problem of rows) { const cell = chunk[problem.rowIndex]; if (cell) errors.push({ level: "error", sheet: cell.item.sheet, row: cell.item.row, message: `${cell.name}: ${problem.message}` }); }
          else errors.push({ level: "error", message: error.safeMessage });
        }
      }
    }
    return { totals, messages, errors };
  }

  const hashOf = (data: Buffer, options: PriceDatabaseOptions) => createHash("sha256").update(data).update(JSON.stringify({ k: options.priceKind, u: options.defaultUnitId ?? null })).digest("hex");
  const normalizeOptions = (options?: Partial<PriceDatabaseOptions>): PriceDatabaseOptions => ({ priceKind: options?.priceKind === "material-labor" ? "material-labor" : "labor", defaultUnitId: options?.defaultUnitId || null });

  return {
    /** Downloads suppliers (one sheet per supplier type) and work prices (labor and material + labor matrices) in the import layout. */
    async exportPriceDatabase(input: { grants: PermissionGrants }): Promise<{ filename: string; mimeType: string; data: Buffer }> {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.vendorRead);
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.priceWorkRead);
      const [vendors, labor, materialLabor] = await Promise.all([
        db.vendor.findMany({ where: { deleted_at: null }, orderBy: { name: "asc" }, include: { types: { include: { vendor_type: true } }, categories: { include: { category: true } }, contacts: true } }),
        db.priceLabor.findMany({ where: { deleted_at: null }, include: { category: true, vendor: true, unit: true }, orderBy: [{ category: { name: "asc" } }, { name: "asc" }] }),
        db.priceMaterialLabor.findMany({ where: { deleted_at: null }, include: { category: true, vendor: true, unit: true }, orderBy: [{ category: { name: "asc" } }, { name: "asc" }] }),
      ]);
      const workbook = createWorkbook();
      const styleHeader = (row: WorksheetRow) => { row.font = { bold: true }; row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE7E5E4" } }; };

      const typeNames = [...new Set(vendors.flatMap((vendor) => vendor.types.map((t) => t.vendor_type.name)))].sort();
      for (const typeName of typeNames.length ? typeNames : ["Supplier"]) {
        const ws = workbook.addWorksheet(`Database - ${typeName}`.slice(0, 31));
        ws.addRow([`DATABASE ${typeName.toUpperCase()} — INTERIOR CONSTRUCTION`]);
        ws.addRow(["Edit and import this sheet back. A supplier that already exists is left unchanged."]);
        styleHeader(ws.addRow(["No", `Nama ${typeName}`, "Kategori Pekerjaan", "Alamat", "No. HP / WA", "No. HP / WA 2", "Email", "IG / Website", "Nama PIC", "Termin Pembayaran", "Catatan"]));
        let n = 0;
        for (const vendor of vendors.filter((v) => v.types.some((t) => t.vendor_type.name === typeName))) {
          const contact = [...vendor.contacts].sort((a, b) => Number(b.is_primary) - Number(a.is_primary))[0];
          const links = Array.isArray(vendor.info_links) ? (vendor.info_links as Array<{ url?: string }>).map((l) => l.url).filter(Boolean).join(", ") : "";
          n += 1;
          ws.addRow([n, vendor.name, vendor.categories.map((c) => c.category.name).join(", "), vendor.address ?? "", contact?.phone ?? "", contact?.extra_phones?.[0] ?? "", contact?.email ?? "", links, contact?.person_name ?? "", "", vendor.notes ?? ""]);
        }
        ws.columns.forEach((column, index) => { column.width = [5, 28, 24, 36, 18, 18, 28, 22, 22, 18, 40][index] ?? 18; });
      }

      const matrix = (title: string, sheetName: string, prices: typeof labor) => {
        if (prices.length === 0) return;
        const suppliers = [...new Map(prices.map((p) => [p.vendor.id, p.vendor.name] as const)).entries()].sort((a, b) => a[1].localeCompare(b[1]));
        const ws = workbook.addWorksheet(sheetName);
        ws.addRow([title]);
        ws.addRow(["Prices in Rp. Section rows become the pricing category. Leave a supplier's cell blank when it has no price."]);
        styleHeader(ws.addRow(["No", "Nama Material", "Spesifikasi", "Satuan", ...suppliers.map(([, name]) => name), "Catatan / Merk Referensi"]));
        const byCategory = new Map<string, typeof prices>();
        for (const price of prices) byCategory.set(price.category.name, [...(byCategory.get(price.category.name) ?? []), price]);
        for (const [category, rows] of byCategory) {
          const heading = ws.addRow([category.toUpperCase()]);
          heading.font = { bold: true };
          const items = new Map<string, typeof prices>();
          for (const price of rows) items.set(key(price.name), [...(items.get(key(price.name)) ?? []), price]);
          for (const group of items.values()) {
            const first = group[0]!;
            ws.addRow(["-", first.name, first.notes ?? "", first.unit.code, ...suppliers.map(([id]) => { const hit = group.find((p) => p.vendor.id === id); return hit ? Number(hit.amount.toString()) : null; }), ""]);
          }
        }
        ws.columns.forEach((column, index) => { column.width = index === 1 ? 36 : index === 2 ? 40 : index === 3 ? 10 : 18; });
        ws.eachRow((row) => row.eachCell((cell) => { if (typeof cell.value === "number") cell.numFmt = "#,##0"; }));
      };
      matrix("DATABASE HARGA — LABOR ONLY", "Database Harga - Labor", labor);
      matrix("DATABASE HARGA — MATERIAL + LABOR", "Database Harga - Material Labor", materialLabor);
      const data = await workbookToBuffer(workbook);
      return { filename: "masterdata-supplier-price-database.xlsx", mimeType: XLSX_MIME, data };
    },

    /** Runs the real import and rolls it back, so the preview and the apply cannot disagree. */
    async previewPriceDatabaseImport(input: { grants: PermissionGrants; actor: AuditActor; file: WorkbookFile; options?: Partial<PriceDatabaseOptions> }) {
      requireImport(input.grants);
      const options = normalizeOptions(input.options);
      const { data, parsed } = await load(input.file);
      let result: RunResult | null = null;
      try {
        await ports.runTransaction(async (tx) => { throw new DryRun(await run(tx as PrismaClient, input.grants, input.actor, parsed, options)); });
      } catch (error) {
        if (error instanceof DryRun) result = error.result; else throw error;
      }
      return { hash: hashOf(data, options), totals: result!.totals, messages: result!.messages, errors: result!.errors };
    },

    async applyPriceDatabaseImport(input: { grants: PermissionGrants; actor: AuditActor; file: WorkbookFile; hash: string; options?: Partial<PriceDatabaseOptions> }) {
      requireImport(input.grants);
      const options = normalizeOptions(input.options);
      const { data, parsed } = await load(input.file);
      const actual = hashOf(data, options);
      if (actual !== input.hash) throw new AppError("CONFLICT", "PRICE_DATABASE_WORKBOOK_CHANGED", "The workbook or options changed after the preview. Preview it again.");
      return ports.runTransaction(async (tx) => {
        const result = await run(tx as PrismaClient, input.grants, input.actor, parsed, options);
        if (result.errors.length) throw new AppError("VALIDATION", "PRICE_DATABASE_IMPORT_ERRORS", "Fix the workbook problems before applying. Nothing was saved.", { details: { errors: result.errors.slice(0, 200) } });
        await ports.auditWriter.write(prepareAuditEvent({ appId: "masterdata", action: "price-database-workbook.applied", entityType: "price_database_workbook", entityId: actual, actor: input.actor, metadata: { ...result.totals, price_kind: options.priceKind } }), tx as any);
        return { totals: result.totals, messages: result.messages };
      });
    },
  };
}
