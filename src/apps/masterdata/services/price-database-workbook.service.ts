import { createHash } from "node:crypto";

import { type PrismaClient } from "@/generated/prisma/client";
import { prepareAuditEvent, type AuditActor } from "@platform/core/audit";
import { AppError } from "@platform/core/errors";
import { requirePermission, type PermissionGrants } from "@platform/core/rbac";
import { exportTable, parseTabularFile, type FileResult, type ImportFormat, type TableColumn, type WorkbookCellValue } from "@platform/utilities/tabular";
import { titleCaseWords } from "@platform/utilities/text-case";

import type { createCategoryService } from "./category.service";
import type { createPricingService } from "./pricing.service";
import { asPrismaClient, MASTERDATA_PERMISSIONS, type MasterDataServicePorts, type TxClient, requiredPriceAmount } from "./shared";
import type { createVendorService } from "./vendor.service";

/** The Master Data commands an import runs inside its own transaction (typed, instead of any-keyed). */
export type PriceWorkbookScopedService = Pick<ReturnType<typeof createCategoryService>, "createCategory">
  & Pick<ReturnType<typeof createVendorService>, "createVendor">
  & Pick<ReturnType<typeof createPricingService>, "createWorkPricesBulk" | "updatePriceLabor" | "updatePriceMaterialLabor">;

/**
 * The supplier-and-work-price database as plain flat tables (owner decision 2026-10-09: no copy of the company's own Excel layout):
 * - "Prices" (the first sheet, or the only table of a CSV): Category, Item, Unit, Supplier, Price, Notes - one row per price of one supplier.
 * - "Suppliers" (optional second sheet of an .xlsx): Name, Type, Categories, Address, Phone, Email, PIC, Payment terms, Notes.
 * One shared column description drives the template, the export of current data and the import, so a downloaded file can be edited and
 * brought back, and its rows pasted into any other workbook. Importing is previewed first: the preview runs the real import and rolls it back.
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
const emptyText = (value: string) => value === "" || /^-+$/.test(value) || /^n\/a$/i.test(value);
/** In the company's lists "By Request" (and a 0) means the price depends on the request: kept as a price of 0, shown as "By request". */
const ON_REQUEST = /^(by request|tbc|tba|nego|negotiable)$/i;

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

/**
 * "Rp 1.250.000", "135000", 135000, "-" and "By Request" -> a plain decimal string, null for no price, undefined for unreadable.
 * A cell that starts with a quotation mark is a text price and is passed through untouched (still quoted) for the shared price grammar.
 */
function readAmount(value: WorkbookCellValue): string | null | undefined {
  if (typeof value === "number") return value < 0 || !Number.isFinite(value) ? undefined : Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
  const quoted = cellText(value);
  if (/^["\u201c\u201d]/.test(quoted)) return quoted;
  const raw = quoted.replace(/^rp\.?\s*/i, "").trim();
  if (ON_REQUEST.test(raw)) return "0";
  if (emptyText(raw)) return null;
  const text = raw.replace(/\s/g, "");
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(text)) return text.replace(/\./g, "").replace(",", ".");
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(text)) return text.replace(/,/g, "");
  if (/^\d+([.,]\d+)?$/.test(text)) return text.replace(",", ".");
  return undefined;
}

const PRICE_COLUMNS: TableColumn[] = [
  { key: "category", header: "Category", aliases: ["Kategori"], required: true, example: "Floor works", note: "The pricing category. It is created when it does not exist yet." },
  { key: "item", header: "Item", aliases: ["Nama Item", "Name", "Nama"], required: true, example: "Screeding base", note: "The work or service being priced." },
  { key: "unit", header: "Unit", aliases: ["Satuan"], example: "m2", note: "A unit code that already exists (m2, m, pcs ...). Blank rows use the default unit chosen on the page." },
  { key: "supplier", header: "Supplier", required: true, example: "PT Contoh Subcon", note: "A supplier that can provide labor. One that does not exist yet is created." },
  { key: "price", header: "Price", aliases: ["Harga", "Amount"], required: true, example: "135000", note: "A number. Use \"By Request\" in quotation marks for a price that depends on the request." },
  { key: "notes", header: "Notes", aliases: ["Catatan", "Specification", "Spesifikasi"], example: "Include materials", note: "Optional specification or remark." },
];
const SUPPLIER_COLUMNS: TableColumn[] = [
  { key: "name", header: "Name", aliases: ["Nama"], required: true, example: "PT Contoh Subcon" },
  { key: "type", header: "Type", aliases: ["Jenis"], required: true, example: "Subcon", note: "A supplier type that already exists." },
  { key: "categories", header: "Categories", aliases: ["Kategori"], example: "Floor works, Ceiling works", note: "Separated by commas." },
  { key: "address", header: "Address", aliases: ["Alamat"] },
  { key: "phone", header: "Phone", aliases: ["No. HP / WA", "HP"] },
  { key: "email", header: "Email" },
  { key: "pic", header: "PIC", aliases: ["Nama PIC", "Contact"] },
  { key: "terms", header: "Payment terms", aliases: ["Termin Pembayaran"] },
  { key: "notes", header: "Notes", aliases: ["Catatan"] },
];
const PRICES_SHEET = "Prices";
const SUPPLIERS_SHEET = "Suppliers";

function splitList(value: string): string[] {
  return value.split(/[,;]/).map((part) => part.trim()).filter((part) => part && !emptyText(part));
}

/** Reads the flat tables of an uploaded .xlsx or .csv into the shape the import runs on. */
async function parseFlat(data: Buffer, filename: string): Promise<Parsed> {
  const parsed: Parsed = { suppliers: [], items: [], messages: [] };
  const isCsv = /\.csv$/i.test(filename);
  if (!isCsv && !/\.xlsx$/i.test(filename)) fileError("Upload an .xlsx or .csv file made from the template.");
  let prices;
  try {
    prices = await parseTabularFile({ data, filename, columns: PRICE_COLUMNS, sheetName: PRICES_SHEET, maxBytes: MAX_BYTES, maxRows: MAX_ITEMS });
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    if (error.code === "TABULAR_XLSX_SHEET") return fileError('This file has no "Prices" sheet. Download the template from this page, fill it in, and upload that file.');
    if (error.code === "TABULAR_ROW_LIMIT") return fileError(`The file has more than ${MAX_ITEMS} price rows.`);
    return fileError(error.message);
  }
  for (const row of prices.rows) {
    const v = row.values;
    const price = readAmount(v.price ?? "");
    const name = (v.item ?? "").trim();
    if (!name && !(v.supplier ?? "").trim() && !(v.price ?? "").trim()) continue;
    if (price === undefined) { parsed.messages.push({ level: "error", sheet: PRICES_SHEET, row: row.row, message: `Price "${v.price}" is not a number.` }); continue; }
    if (price === null) { parsed.messages.push({ level: "info", sheet: PRICES_SHEET, row: row.row, message: `"${titleCaseWords(name)}" has no price and was skipped.` }); continue; }
    parsed.items.push({
      sheet: PRICES_SHEET, row: row.row, area: "", category: titleCaseWords((v.category ?? "").trim()), name: titleCaseWords(name), notes: (v.notes ?? "").trim(),
      unitText: (v.unit ?? "").trim(), amounts: [{ supplier: titleCaseWords((v.supplier ?? "").trim()), pic: null, amount: price }],
    });
  }
  if (!isCsv) {
    let suppliers;
    try {
      suppliers = await parseTabularFile({ data, filename, columns: SUPPLIER_COLUMNS, sheetName: SUPPLIERS_SHEET, maxBytes: MAX_BYTES, maxRows: MAX_ITEMS });
    } catch (error) {
      if (!(error instanceof AppError) || error.code !== "TABULAR_XLSX_SHEET") { if (error instanceof AppError) parsed.messages.push({ level: "error", sheet: SUPPLIERS_SHEET, message: error.message }); else throw error; }
    }
    for (const row of suppliers?.rows ?? []) {
      const v = row.values;
      const name = (v.name ?? "").trim();
      if (!name) continue;
      const clean = (value: string | undefined) => { const text = (value ?? "").trim(); return emptyText(text) ? null : text; };
      const notes = [clean(v.notes), clean(v.terms) ? `Payment terms: ${clean(v.terms)}` : null].filter(Boolean).join("\n");
      parsed.suppliers.push({
        sheet: SUPPLIERS_SHEET, row: row.row, typeName: (v.type ?? "").trim(), name: titleCaseWords(name), categories: splitList(v.categories ?? ""), address: clean(v.address),
        phones: clean(v.phone) ? [clean(v.phone)!] : [], email: clean(v.email), pic: clean(v.pic), notes: notes || null,
      });
    }
  }
  if (parsed.items.length > MAX_ITEMS) fileError(`The file has more than ${MAX_ITEMS} price rows.`);
  return parsed;
}

export function createPriceDatabaseWorkbookService(
  db: PrismaClient,
  ports: MasterDataServicePorts,
  createScopedService: (tx: TxClient) => PriceWorkbookScopedService,
) {
  async function load(file: WorkbookFile): Promise<{ data: Buffer; parsed: Parsed }> {
    const { data, name } = bytesOf(file);
    if (data.length > MAX_BYTES) fileError("The file is larger than 8 MB.");
    return { data, parsed: await parseFlat(data, name ?? "prices.xlsx") };
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
        const created = await s.createCategory({ grants, actor, name, kind: "WORK" });
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
      if (vendorByKey.has(key(supplier.name))) {
        // Existing suppliers are never changed from the file (owner, 2026-10-09); say so, so an edit made in Excel is not thought saved.
        totals.suppliersExisting += 1;
        messages.push({ level: "info", sheet: supplier.sheet, row: supplier.row, message: `Supplier "${supplier.name}" already exists; this row was not used. Edit suppliers on the Suppliers page.` });
        continue;
      }
      const type = typeFor(supplier.typeName);
      if (!type) { errors.push({ ...where, message: `Supplier type "${supplier.typeName}" does not exist. Add it under Settings, or rename the sheet.` }); continue; }
      const categoryIds: string[] = [];
      for (const name of supplier.categories) { const id = await categoryId(name, where); if (id) categoryIds.push(id); }
      const person = supplier.pic ?? (supplier.phones.length || supplier.email ? supplier.name : null);
      try {
        const created = await s.createVendor({ grants, actor, name: supplier.name, address: supplier.address ?? undefined, notes: supplier.notes ?? undefined, vendorTypeIds: [type.id], categoryIds, contacts: person ? [{ personName: person, phones: supplier.phones.slice(0, 3), email: supplier.email, isPrimary: true }] : [] });
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
    type Cell = { item: ParsedItem; name: string; vendorId: string; amount: string; label: string | null; unitId: string; categoryId: string };
    /** What the pricing services take: the plain decimal, or the label written back in quotation marks. */
    const amountInput = (cell: { amount: string; label: string | null }) => (cell.label !== null ? `"${cell.label}"` : cell.amount);
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
            const created = await s.createVendor({ grants, actor, name: amount.supplier, vendorTypeIds: [subcon.id], contacts: amount.pic ? [{ personName: amount.pic, isPrimary: true }] : [] });
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
        let normalized: { amount: string; label: string | null };
        try { normalized = requiredPriceAmount(amount.amount); } catch (error) { errors.push({ ...where, message: `${amount.supplier}: ${error instanceof AppError ? error.safeMessage : `amount "${amount.amount}" is not valid.`}` }); continue; }
        if (normalized.label !== null) messages.push({ level: "info", sheet: item.sheet, row: item.row, message: `${amount.supplier}: "${item.name}" is a text price: "${normalized.label}".` });
        cells.push({ item, name: item.name, vendorId: vendor.id, amount: normalized.amount, label: normalized.label, unitId, categoryId: cat });
      }
    }

    // The same item name can be priced once per area for one supplier ("Second Skin Partition" in Shopfront Area and in Store Area).
    // Within one import such repeats are told apart by their area, so each keeps its own price.
    // Repeats are told apart by their area (or section) when those differ, otherwise by their specification.
    const groups = new Map<string, Cell[]>();
    for (const cell of cells) groups.set(`${cell.vendorId}|${key(cell.name)}`, [...(groups.get(`${cell.vendorId}|${key(cell.name)}`) ?? []), cell]);
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      const places = group.map((cell) => cell.item.area || cell.item.category);
      const specs = group.map((cell) => cell.item.notes.slice(0, 40).trim());
      if (new Set(places).size === group.length) group.forEach((cell, index) => { cell.name = `${cell.item.name} (${places[index]})`; });
      else if (specs.every(Boolean) && new Set(specs).size === group.length) group.forEach((cell, index) => { cell.name = `${cell.item.name} (${specs[index]})`; });
    }
    const identityFacts = { unit: { select: { code: true } }, category: { select: { name: true } } } as const;
    const existing = !cells.length ? [] : options.priceKind === "labor"
      ? await tx.priceLabor.findMany({ where: { deleted_at: null, vendor_id: { in: [...new Set(cells.map((cell) => cell.vendorId))] } }, include: identityFacts })
      : await tx.priceMaterialLabor.findMany({ where: { deleted_at: null, vendor_id: { in: [...new Set(cells.map((cell) => cell.vendorId))] } }, include: identityFacts });
    const existingByKey = new Map(existing.map((price) => [`${price.vendor_id}|${key(price.name)}`, price] as const));
    const toCreate = new Map<string, Cell[]>(); // category|vendor -> cells
    for (const cell of cells) {
      const where = { level: "error" as const, sheet: cell.item.sheet, row: cell.item.row };
      const found = existingByKey.get(`${cell.vendorId}|${key(cell.name)}`);
      if (!found) { const groupKey = `${cell.categoryId}|${cell.vendorId}`; toCreate.set(groupKey, [...(toCreate.get(groupKey) ?? []), cell]); continue; }
      // A work price is one supplier + name (owner, 2026-10-09): a row that disagrees on unit or category is refused
      // instead of silently moving the existing price.
      if (found.unit_id !== cell.unitId || found.category_id !== cell.categoryId) {
        errors.push({ ...where, message: `"${found.name}" already exists for this supplier with unit ${found.unit.code} in ${found.category.name}. Use that unit and category to update it, or give this row a more specific name.` });
        continue;
      }
      const notes = cell.item.notes || null;
      if (found.amount.toString() === cell.amount && (found.amount_label ?? null) === cell.label && found.unit_id === cell.unitId && found.category_id === cell.categoryId && (found.notes ?? null) === notes) { totals.pricesUnchanged += 1; continue; }
      try {
        const common = { grants, actor, name: found.name, categoryId: cell.categoryId, vendorId: cell.vendorId, unitId: cell.unitId, amount: amountInput(cell), currency: found.currency, notes };
        if (options.priceKind === "labor") await s.updatePriceLabor({ ...common, priceLaborId: found.id });
        else await s.updatePriceMaterialLabor({ ...common, priceMaterialLaborId: found.id, scopeNote: "scope_note" in found && typeof found.scope_note === "string" ? found.scope_note : null });
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
          const created = await s.createWorkPricesBulk({ grants, actor, kind: options.priceKind, vendorId: chunk[0]!.vendorId, categoryId: chunk[0]!.categoryId, currency: "IDR", rows: chunk.map((cell) => ({ name: cell.name, unitId: cell.unitId, amount: amountInput(cell), notes: cell.item.notes || null })) });
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
    /** A blank file in the flat shape with one example row: Prices (all a CSV has), and for .xlsx also Suppliers and a Notes sheet. */
    async priceDatabaseTemplate(input: { grants: PermissionGrants; format?: ImportFormat }): Promise<FileResult> {
      requireImport(input.grants);
      const format = input.format ?? "xlsx";
      const example = (columns: TableColumn[]) => Object.fromEntries(columns.map((column) => [column.key, column.example ?? ""]));
      const sheetRows = (columns: TableColumn[], rows: Array<Record<string, string>>) => [columns.map((column) => column.header), ...rows.map((row) => columns.map((column) => row[column.key] ?? ""))];
      const notes = [
        ["How to use", ""],
        ["Fill the Prices sheet: one row per price of one supplier. Delete the example row first.", ""],
        ["Suppliers (optional): only adds suppliers that do not exist yet. A supplier that already exists is never changed from this sheet (the check lists it); edit it on the Suppliers page.", ""],
        ["Upload the file on the Import & export prices page; it is checked before anything is saved.", ""],
        ["", ""],
        ...[...PRICE_COLUMNS, ...SUPPLIER_COLUMNS].filter((column) => column.note).map((column) => [column.header, [column.required ? "Required. " : "", column.note ?? ""].join("")]),
      ];
      return exportTable({
        format, filename: "price-database-template", sheetName: PRICES_SHEET, columns: PRICE_COLUMNS, rows: [example(PRICE_COLUMNS)],
        extraSheets: format === "xlsx" ? [{ name: SUPPLIERS_SHEET, rows: sheetRows(SUPPLIER_COLUMNS, [example(SUPPLIER_COLUMNS)]) }, { name: "Notes", rows: notes }] : undefined,
      });
    },

    /** The current work prices of one kind (and, for .xlsx, the suppliers) in exactly the template's shape, no IDs, so it can be edited and imported back. */
    async exportPriceDatabase(input: { grants: PermissionGrants; priceKind?: "labor" | "material-labor"; format?: ImportFormat }): Promise<FileResult> {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.vendorRead);
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.priceWorkRead);
      const format = input.format ?? "xlsx";
      const include = { category: true, vendor: true, unit: true } as const;
      const order = [{ category: { name: "asc" as const } }, { name: "asc" as const }];
      const [vendors, prices] = await Promise.all([
        db.vendor.findMany({ where: { deleted_at: null }, orderBy: { name: "asc" }, include: { types: { include: { vendor_type: true } }, categories: { include: { category: true } }, contacts: true } }),
        input.priceKind === "material-labor"
          ? db.priceMaterialLabor.findMany({ where: { deleted_at: null }, include, orderBy: order })
          : db.priceLabor.findMany({ where: { deleted_at: null }, include, orderBy: order }),
      ]);
      const priceRows = prices.map((price) => ({
        category: price.category.name, item: price.name, unit: price.unit.code, supplier: price.vendor.name,
        price: price.amount_label ? `"${price.amount_label}"` : Number(price.amount.toString()) === 0 ? "By Request" : String(Number(price.amount.toString())), notes: price.notes ?? "",
      }));
      const supplierRows = vendors.map((vendor) => {
        const contact = [...vendor.contacts].sort((a, b) => Number(b.is_primary) - Number(a.is_primary))[0];
        return { name: vendor.name, type: vendor.types[0]?.vendor_type.name ?? "", categories: vendor.categories.map((c) => c.category.name).join(", "), address: vendor.address ?? "", phone: contact?.phone ?? "", email: contact?.email ?? "", pic: contact?.person_name ?? "", terms: "", notes: vendor.notes ?? "" };
      });
      return exportTable({
        format, filename: input.priceKind === "material-labor" ? "price-database-material-labor" : "price-database-labor", sheetName: PRICES_SHEET, columns: PRICE_COLUMNS, rows: priceRows,
        extraSheets: format === "xlsx" ? [{ name: SUPPLIERS_SHEET, rows: [SUPPLIER_COLUMNS.map((column) => column.header), ...supplierRows.map((row) => SUPPLIER_COLUMNS.map((column) => (row as Record<string, string>)[column.key] ?? ""))] }] : undefined,
      });
    },

    /** Runs the real import and rolls it back, so the preview and the apply cannot disagree. */
    async previewPriceDatabaseImport(input: { grants: PermissionGrants; actor: AuditActor; file: WorkbookFile; options?: Partial<PriceDatabaseOptions> }) {
      requireImport(input.grants);
      const options = normalizeOptions(input.options);
      const { data, parsed } = await load(input.file);
      let result: RunResult | null = null;
      try {
        await ports.runTransaction(async (tx) => { throw new DryRun(await run(asPrismaClient(tx), input.grants, input.actor, parsed, options)); });
      } catch (error) {
        if (error instanceof DryRun) result = error.result; else throw error;
      }
      return { hash: hashOf(data, options), totals: result!.totals, messages: result!.messages, errors: result!.errors };
    },

    /**
     * Saves the file the preview checked. By default the valid rows are saved and each row with a problem is skipped and reported
     * (`skipped`); with `applyValidRows: false` any problem refuses the whole file and nothing is saved.
     */
    async applyPriceDatabaseImport(input: { grants: PermissionGrants; actor: AuditActor; file: WorkbookFile; hash: string; applyValidRows?: boolean; options?: Partial<PriceDatabaseOptions> }) {
      requireImport(input.grants);
      const options = normalizeOptions(input.options);
      const { data, parsed } = await load(input.file);
      const actual = hashOf(data, options);
      if (actual !== input.hash) throw new AppError("CONFLICT", "PRICE_DATABASE_WORKBOOK_CHANGED", "The file or options changed after the check. Check it again.");
      return ports.runTransaction(async (tx) => {
        const result = await run(asPrismaClient(tx), input.grants, input.actor, parsed, options);
        if (result.errors.length && input.applyValidRows === false) throw new AppError("VALIDATION", "PRICE_DATABASE_IMPORT_ERRORS", "Fix the file problems before saving. Nothing was saved.", { details: { errors: result.errors.slice(0, 200) } });
        await ports.auditWriter.write(prepareAuditEvent({ appId: "masterdata", action: "price-database-workbook.applied", entityType: "price_database_workbook", entityId: actual, actor: input.actor, metadata: { ...result.totals, skipped: result.errors.length, price_kind: options.priceKind } }), tx);
        return { totals: result.totals, messages: result.messages, skipped: result.errors.slice(0, 200) };
      });
    },
  };
}
