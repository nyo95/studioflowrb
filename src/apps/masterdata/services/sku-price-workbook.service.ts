import { createHash } from "node:crypto";


import { type PrismaClient } from "@/generated/prisma/client";
import { prepareAuditEvent, type AuditActor } from "@platform/core/audit";
import { AppError } from "@platform/core/errors";
import { requirePermission, type PermissionGrants } from "@platform/core/rbac";
import { buildImportTemplate, exportTable, parseTabularFile, type FileResult, type ImportFormat, type TableColumn, type TableFormat } from "@platform/utilities/tabular";

import type { createPricingService } from "./pricing.service";
import type { createSkuService } from "./sku.service";
import { asPrismaClient, MASTERDATA_PERMISSIONS, type MasterDataServicePorts, type TxClient, requiredPriceAmount, requiredCurrency, resolveSkuMeasurement, assertVendorMaterialCapable } from "./shared";

const SHEET = "SKU Prices";
/** True when a stored price already holds the typed amount: same number and same text label. */
function samePriceAmount(price: { amount: { toString(): string }; amount_label?: string | null }, text: string): boolean {
  const next = requiredPriceAmount(text);
  return price.amount.toString() === next.amount && (price.amount_label ?? null) === next.label;
}

const HEADERS = ["SKU ID", "Code", "Name", "Brand", "Category", "Base unit", "Purchase unit", "Length", "Width", "Thickness", "Dimension unit", "Notes", "Price ID", "Supplier", "Amount", "Currency", "Price notes"] as const;
const MAX_BYTES = 5 * 1024 * 1024;
const COLUMNS: TableColumn[] = HEADERS.map((header) => ({ key: header, header, required: true }));
const PDF_COLUMNS: TableColumn[] = HEADERS.filter((header) => !["SKU ID", "Price ID", "Notes", "Price notes"].includes(header)).map((header) => ({ key: header, header, type: header === "Amount" ? "money" : "text", width: header === "Name" ? 26 : header === "Supplier" ? 20 : 10 }));
const MAX_ROWS = 2000;

type WorkbookFile = Buffer | { data: Buffer; name?: string; type?: string };
type RowError = { row: number; column: string; message: string };
type Outcome = "create" | "update" | "unchanged" | "error";
type ParsedRow = Record<(typeof HEADERS)[number], string> & { row: number };
type ValidRow = ParsedRow & {
  sku: { id: string; name: string | null; code: string | null; notes: string | null; brand_id: string | null; base_unit_id: string; purchase_unit_id: string | null; dimension_length: { toString(): string } | null; dimension_width: { toString(): string } | null; dimension_thickness: { toString(): string } | null; dimension_unit_id: string | null; categories: Array<{ category_id: string }> } | null;
  price: { id: string; sku_id: string; supplier_vendor_id: string; amount: { toString(): string }; currency: string; notes: string | null; deleted_at: Date | null } | null;
  brandId: string | null; categoryId: string; baseUnitId: string; purchaseUnitId: string | null; dimensionUnitId: string | null; supplierId: string | null;
};

function clean(value: unknown): string { return String(value ?? "").trim(); }
function key(value: string): string { return value.trim().toLocaleLowerCase(); }
function bytesOf(file: WorkbookFile): { data: Buffer; name?: string; type?: string } { return Buffer.isBuffer(file) ? { data: file } : file; }
function fileError(message: string): never { throw new AppError("VALIDATION", "SKU_PRICE_WORKBOOK_INVALID", message); }
const INVALID_CELL = "__SKU_PRICE_INVALID_CELL__";
function same(a: string | null | undefined, b: string | null | undefined): boolean { return (a ?? "") === (b ?? ""); }

/** The Master Data commands an SKU workbook import runs inside its own transaction. */
export type SkuWorkbookScopedService = Pick<ReturnType<typeof createSkuService>, "createSku" | "updateSku">
  & Pick<ReturnType<typeof createPricingService>, "createPriceMaterial" | "updatePriceMaterial">;

export function createSkuPriceWorkbookService(
  db: PrismaClient,
  ports: MasterDataServicePorts,
  createScopedService: (tx: TxClient) => SkuWorkbookScopedService,
) {
  async function readRows(file: WorkbookFile): Promise<{ data: Buffer; rows: ParsedRow[] }> {
    const input = bytesOf(file);
    if (input.data.length > MAX_BYTES) fileError("The workbook is larger than 5 MB.");
    let table: Awaited<ReturnType<typeof parseTabularFile>>;
    try {
      table = await parseTabularFile({ data: input.data, filename: input.name ?? "workbook.xlsx", columns: COLUMNS, maxBytes: MAX_BYTES, maxRows: MAX_ROWS, sheetName: SHEET });
    } catch (error) {
      if (error instanceof AppError && error.code.startsWith("TABULAR_")) fileError(error.code === "TABULAR_ROW_LIMIT" ? "The workbook has more than 2,000 data rows." : error.message);
      throw error;
    }
    const invalid = new Set(table.invalidCells.map((cell) => `${cell.row}:${cell.column}`));
    const rows = table.rows.map((row) => Object.assign({ row: row.row }, Object.fromEntries(HEADERS.map((header) => [header, invalid.has(`${row.row}:${header}`) ? INVALID_CELL : row.values[header] ?? ""]))) as unknown as ParsedRow);
    return { data: input.data, rows };
  }

  async function validate(rows: ParsedRow[], client: PrismaClient = db): Promise<{ rows: Array<{ row: number; outcome: Outcome; errors: RowError[] }>; errors: RowError[]; valid: ValidRow[] }> {
    const [brands, categories, units, vendors] = await Promise.all([
      client.brand.findMany({ where: { deleted_at: null }, select: { id: true, name: true } }),
      client.category.findMany({ where: { status: "ACTIVE", kind: "PRODUCT" }, select: { id: true, name: true } }),
      client.unit.findMany({ where: { status: "ACTIVE" }, select: { id: true, code: true } }),
      client.vendor.findMany({ where: { deleted_at: null }, select: { id: true, name: true } }),
    ]);
    const brandByName = new Map(brands.map((x) => [key(x.name), x.id]));
    const categoryByName = new Map(categories.map((x) => [key(x.name), x.id]));
    const unitByCode = new Map(units.map((x) => [key(x.code), x.id]));
    const vendorByName = new Map(vendors.map((x) => [key(x.name), x.id]));
    const skuIds = rows.map((x) => x["SKU ID"]).filter(Boolean);
    const priceIds = rows.map((x) => x["Price ID"]).filter(Boolean);
    const [skus, prices] = await Promise.all([
      client.sku.findMany({ where: { id: { in: skuIds } }, include: { categories: true } }),
      client.priceMaterial.findMany({ where: { id: { in: priceIds } } }),
    ]);
    const skuById = new Map(skus.map((x) => [x.id, x])); const priceById = new Map(prices.map((x) => [x.id, x]));
    const seen = new Set<string>(); const results: Array<{ row: number; outcome: Outcome; errors: RowError[] }> = []; const valid: ValidRow[] = [];
    for (const source of rows) {
      const errors: RowError[] = []; const add = (column: string, message: string) => errors.push({ row: source.row, column, message });
      for (const header of HEADERS) if (source[header] === INVALID_CELL) add(header, "Cell must contain a plain value or a calculated result.");
      const skuId = source["SKU ID"]; const priceId = source["Price ID"];
      const sku = skuId ? skuById.get(skuId) ?? null : null; const price = priceId ? priceById.get(priceId) ?? null : null;
      if (skuId && !sku) add("SKU ID", "SKU was not found."); if (sku?.deleted_at) add("SKU ID", "SKU is archived.");
      if (priceId && !price) add("Price ID", "Material price was not found."); if (price?.deleted_at) add("Price ID", "Material price is archived.");
      if (price && skuId && price.sku_id !== skuId) add("Price ID", "This price does not belong to the SKU in this row.");
      const brandId = source.Brand ? brandByName.get(key(source.Brand)) ?? null : null; if (source.Brand && !brandId) add("Brand", "Brand was not found.");
      const categoryId = categoryByName.get(key(source.Category)); if (!categoryId) add("Category", "Product category was not found.");
      const baseUnitId = unitByCode.get(key(source["Base unit"])); if (!baseUnitId) add("Base unit", "Unit was not found.");
      const purchaseUnitId = source["Purchase unit"] ? unitByCode.get(key(source["Purchase unit"])) ?? null : null; if (source["Purchase unit"] && !purchaseUnitId) add("Purchase unit", "Unit was not found.");
      const dimensionUnitId = source["Dimension unit"] ? unitByCode.get(key(source["Dimension unit"])) ?? null : null; if (source["Dimension unit"] && !dimensionUnitId) add("Dimension unit", "Unit was not found.");
      const hasDimension = Boolean(source.Length || source.Width || source.Thickness || source["Dimension unit"]);
      if (hasDimension && (!source.Length || !source.Width || !source["Dimension unit"])) add("Dimension unit", "Length, width, and dimension unit must be filled together.");
      for (const column of ["Length", "Width", "Thickness"] as const) if (source[column]) try { if (Number(source[column]) <= 0) throw new Error(); } catch { add(column, "Value must be a positive decimal."); }
      const hasPrice = Boolean(source.Supplier || source.Amount || source.Currency || source["Price notes"] || priceId);
      const supplierId = source.Supplier ? vendorByName.get(key(source.Supplier)) ?? null : null; if (source.Supplier && !supplierId) add("Supplier", "Supplier was not found.");
      if (hasPrice && !source.Supplier) add("Supplier", "Supplier is required for a material price."); if (hasPrice && !source.Amount) add("Amount", "Amount is required for a material price.");
      if (source.Amount) try { requiredPriceAmount(source.Amount); } catch (error) { add("Amount", error instanceof AppError ? error.safeMessage : "Amount must be a non-negative decimal, or text in quotation marks."); }
      if (hasPrice && !source.Currency) add("Currency", "Currency is required for a material price."); if (source.Currency) try { requiredCurrency(source.Currency); } catch { add("Currency", "Currency must be a 3-letter code."); }
      if (errors.length === 0) {
        try {
          const baseUnit = await client.unit.findUniqueOrThrow({ where: { id: baseUnitId! } });
          const purchaseUnit = purchaseUnitId ? await client.unit.findUniqueOrThrow({ where: { id: purchaseUnitId } }) : null;
          await resolveSkuMeasurement(client, { dimensionLength: source.Length || null, dimensionWidth: source.Width || null, dimensionThickness: source.Thickness || null, dimensionUnitId }, baseUnit, purchaseUnit);
          if (supplierId) await assertVendorMaterialCapable(client, supplierId);
        } catch (error) {
          if (error instanceof AppError) add(error.code.startsWith("SKU_DIMENSION") ? "Dimension unit" : "Supplier", error.safeMessage);
          else throw error;
        }
      }
      if (!skuId && !hasPrice) add("Supplier", "A new SKU needs its first material price.");
      if (!source.Name && !source.Code) add("Name", "SKU name or code is required.");
      if (price && supplierId && price.supplier_vendor_id !== supplierId) add("Supplier", "Supplier cannot be changed for an existing price.");
      if (sku && !sku.deleted_at) {
        const livePrices = await client.priceMaterial.count({ where: { sku_id: sku.id, deleted_at: null } });
        const measurementChanged = sku.base_unit_id !== baseUnitId || sku.purchase_unit_id !== purchaseUnitId;
        if (livePrices > 0 && measurementChanged) add("Base unit", "Base unit and purchase unit cannot change while live material prices exist. The size can still be corrected.");
        if (sku.brand_id !== brandId && await client.priceMaterial.count({ where: { sku_id: sku.id, deleted_at: null, source_link_id: { not: null } } }) > 0) add("Brand", "Brand cannot change while live material prices have source links.");
      }
      const duplicate = skuId ? `${skuId}:${priceId || supplierId || "sku"}` : `${key(source.Code)}:${key(source.Name)}:${supplierId || ""}`;
      if (seen.has(duplicate)) add(priceId ? "Price ID" : "Supplier", "This row duplicates another SKU and supplier price row."); else seen.add(duplicate);
      const candidate = { ...source, sku, price, brandId, categoryId: categoryId ?? "", baseUnitId: baseUnitId ?? "", purchaseUnitId, dimensionUnitId, supplierId } as ValidRow;
      let outcome: Outcome = "error";
      if (errors.length === 0) {
        const skuChanged = !sku || !same(sku.name, source.Name || null) || !same(sku.code, source.Code || null) || !same(sku.notes, source.Notes || null) || sku.brand_id !== brandId || sku.base_unit_id !== baseUnitId || sku.purchase_unit_id !== purchaseUnitId || !same(sku.dimension_length?.toString() ?? null, source.Length || null) || !same(sku.dimension_width?.toString() ?? null, source.Width || null) || !same(sku.dimension_thickness?.toString() ?? null, source.Thickness || null) || sku.dimension_unit_id !== dimensionUnitId || sku.categories[0]?.category_id !== categoryId;
        const priceChanged = hasPrice && (!price || !samePriceAmount(price, source.Amount) || price.currency !== requiredCurrency(source.Currency) || !same(price.notes, source["Price notes"] || null));
        outcome = !sku ? "create" : skuChanged || priceChanged ? "update" : "unchanged";
        valid.push(candidate);
      }
      results.push({ row: source.row, outcome, errors });
    }
    return { rows: results, errors: results.flatMap((x) => x.errors), valid };
  }

  const api = {
    /** Every live SKU with one row per supplier price. Only `xlsx` and `csv` re-import; `pdf` is a read-only price list. */
    async exportSkuPriceList(input: { grants: PermissionGrants; format?: TableFormat }): Promise<FileResult> {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.skuRead); requirePermission(input.grants, MASTERDATA_PERMISSIONS.priceMaterialRead);
      const format = input.format ?? "xlsx";
      const [skus, brands, categories, units, vendors] = await Promise.all([
        db.sku.findMany({ where: { deleted_at: null }, include: { brand: true, base_unit: true, purchase_unit: true, dimension_unit: true, categories: { include: { category: true } }, material_prices: { where: { deleted_at: null }, include: { supplier_vendor: true } } }, orderBy: { name: "asc" } }),
        db.brand.findMany({ where: { deleted_at: null }, select: { name: true }, orderBy: { name: "asc" } }), db.category.findMany({ where: { status: "ACTIVE", kind: "PRODUCT" }, select: { name: true }, orderBy: { name: "asc" } }), db.unit.findMany({ where: { status: "ACTIVE" }, select: { code: true, name: true }, orderBy: { code: "asc" } }), db.vendor.findMany({ where: { deleted_at: null }, select: { name: true }, orderBy: { name: "asc" } }),
      ]);
      const rows: Array<Record<string, string>> = [];
      for (const sku of skus) {
        const common = { "SKU ID": sku.id, Code: sku.code ?? "", Name: sku.name ?? "", Brand: sku.brand?.name ?? "", Category: sku.categories[0]?.category.name ?? "", "Base unit": sku.base_unit.code, "Purchase unit": sku.purchase_unit?.code ?? "", Length: sku.dimension_length?.toString() ?? "", Width: sku.dimension_width?.toString() ?? "", Thickness: sku.dimension_thickness?.toString() ?? "", "Dimension unit": sku.dimension_unit?.code ?? "", Notes: sku.notes ?? "" };
        for (const price of sku.material_prices.length ? sku.material_prices : [null]) rows.push({ ...common, "Price ID": price?.id ?? "", Supplier: price?.supplier_vendor.name ?? "", Amount: price ? (price.amount_label ? `"${price.amount_label}"` : price.amount.toString()) : "", Currency: price?.currency ?? "", "Price notes": price?.notes ?? "" });
      }
      const reference: string[][] = [["Brands", "Categories", "Units", "Suppliers"]];
      for (let i = 0; i < Math.max(brands.length, categories.length, units.length, vendors.length); i += 1) reference.push([brands[i]?.name ?? "", categories[i]?.name ?? "", units[i] ? `${units[i].code} — ${units[i].name}` : "", vendors[i]?.name ?? ""]);
      return exportTable({
        format, filename: "sku-prices", sheetName: SHEET, title: "SKU price list",
        columns: format === "pdf" ? PDF_COLUMNS : COLUMNS, rows,
        pdf: { orientation: "landscape", showGeneratedAt: true },
        extraSheets: [{ name: "Reference", rows: reference, protect: true }],
      });
    },
    async exportSkuPriceWorkbook(input: { grants: PermissionGrants }): Promise<Buffer> {
      return (await api.exportSkuPriceList({ grants: input.grants, format: "xlsx" })).data;
    },
    /** A blank import file with the export's headers and one example row. */
    async skuPriceImportTemplate(input: { grants: PermissionGrants; format?: ImportFormat }): Promise<FileResult> {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.skuManage); requirePermission(input.grants, MASTERDATA_PERMISSIONS.priceMaterialManage);
      const example: Record<string, string> = { Code: "KYU-001", Name: "Kayu jati 2x20", Brand: "", Category: "Kayu", "Base unit": "pcs", Supplier: "PT Contoh", Amount: "120000", Currency: "IDR" };
      const notes: Record<string, string> = { "SKU ID": "Leave empty for a new SKU.", "Price ID": "Leave empty for a new price.", Category: "Must already exist.", "Base unit": "Unit code; must already exist.", Supplier: "Must already exist." };
      return buildImportTemplate({ format: input.format ?? "xlsx", filename: "sku-prices-template", sheetName: SHEET, columns: COLUMNS.map((column) => ({ ...column, required: false, example: example[column.key] ?? "", note: notes[column.key] })), includeExample: true, notes: ["Suppliers, units, categories and brands are never created by the import."] });
    },
    async previewSkuPriceImport(input: { grants: PermissionGrants; file: WorkbookFile }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.skuManage); requirePermission(input.grants, MASTERDATA_PERMISSIONS.priceMaterialManage);
      const parsed = await readRows(input.file); const check = await validate(parsed.rows); const totals = { create: check.rows.filter((x) => x.outcome === "create").length, update: check.rows.filter((x) => x.outcome === "update").length, unchanged: check.rows.filter((x) => x.outcome === "unchanged").length, error: check.rows.filter((x) => x.outcome === "error").length };
      return { hash: createHash("sha256").update(parsed.data).digest("hex"), totals, rows: check.rows, errors: check.errors };
    },
    async applySkuPriceImport(input: { grants: PermissionGrants; actor: AuditActor; file: WorkbookFile; hash: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.skuManage); requirePermission(input.grants, MASTERDATA_PERMISSIONS.priceMaterialManage);
      const parsed = await readRows(input.file); const actual = createHash("sha256").update(parsed.data).digest("hex"); if (actual !== input.hash) throw new AppError("CONFLICT", "SKU_PRICE_WORKBOOK_CHANGED", "The workbook changed after preview. Preview it again before applying.");
      return ports.runTransaction(async (tx) => {
        const check = await validate(parsed.rows, asPrismaClient(tx)); if (check.errors.length) throw new AppError("VALIDATION", "SKU_PRICE_IMPORT_ERRORS", "Fix the workbook errors before applying.", { details: { errors: check.errors } });
        const service = createScopedService(tx); let created = 0; let updated = 0;
        const newRows = new Map<string, ValidRow[]>();
        for (const row of check.valid) if (!row.sku) { const group = `${key(row.Code)}:${key(row.Name)}`; newRows.set(group, [...(newRows.get(group) ?? []), row]); }
        const completedNewGroups = new Set<string>();
        for (const row of check.valid) {
          const skuInput = { grants: input.grants, actor: input.actor, name: row.Name || null, code: row.Code || null, notes: row.Notes || null, brandId: row.brandId, baseUnitId: row.baseUnitId, purchaseUnitId: row.purchaseUnitId, dimensionLength: row.Length || null, dimensionWidth: row.Width || null, dimensionThickness: row.Thickness || null, dimensionUnitId: row.dimensionUnitId, categoryId: row.categoryId };
          let skuId = row.sku?.id;
          if (!skuId) { const group = `${key(row.Code)}:${key(row.Name)}`; if (completedNewGroups.has(group)) continue; const grouped = newRows.get(group)!; const result = await service.createSku({ ...skuInput, notes: skuInput.notes ?? undefined, purchaseUnitId: skuInput.purchaseUnitId ?? undefined, dimensionLength: skuInput.dimensionLength ?? undefined, dimensionWidth: skuInput.dimensionWidth ?? undefined, dimensionThickness: skuInput.dimensionThickness ?? undefined, dimensionUnitId: skuInput.dimensionUnitId ?? undefined, priceMaterials: grouped.map((entry) => ({ supplierVendorId: entry.supplierId!, amount: entry.Amount, currency: entry.Currency, notes: entry["Price notes"] || undefined })) }); skuId = result.skuId; completedNewGroups.add(group); created += 1; continue; }
          const before = check.rows.find((x) => x.row === row.row)!; if (before.outcome === "update") { await service.updateSku({ ...skuInput, skuId }); updated += 1; }
          if (row.Supplier && !row.price) { await service.createPriceMaterial({ grants: input.grants, actor: input.actor, skuId, supplierVendorId: row.supplierId!, amount: row.Amount, currency: row.Currency, notes: row["Price notes"] || undefined }); if (before.outcome !== "update") updated += 1; }
          else if (row.price && (!samePriceAmount(row.price, row.Amount) || row.price.currency !== requiredCurrency(row.Currency) || !same(row.price.notes, row["Price notes"] || null))) await service.updatePriceMaterial({ grants: input.grants, actor: input.actor, priceMaterialId: row.price.id, amount: row.Amount, currency: row.Currency, notes: row["Price notes"] || null });
        }
        await ports.auditWriter.write(prepareAuditEvent({ appId: "masterdata", action: "sku-price-workbook.applied", entityType: "sku_price_workbook", entityId: actual, actor: input.actor, metadata: { created, updated, unchanged: check.rows.filter((x) => x.outcome === "unchanged").length } }), tx);
        return { totals: { create: created, update: updated, unchanged: check.rows.filter((x) => x.outcome === "unchanged").length, error: 0 } };
      });
    },
  };
  return api;
}
