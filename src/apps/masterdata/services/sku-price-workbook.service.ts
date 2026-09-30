import { createHash } from "node:crypto";

import ExcelJS from "exceljs";

import { type PrismaClient } from "@/generated/prisma/client";
import { prepareAuditEvent, type AuditActor } from "@platform/core/audit";
import { AppError } from "@platform/core/errors";
import { requirePermission, type PermissionGrants } from "@platform/core/rbac";

import { MASTERDATA_PERMISSIONS, type MasterDataServicePorts, requiredAmount, requiredCurrency } from "./shared";

const SHEET = "SKU Prices";
const HEADERS = ["SKU ID", "Code", "Name", "Brand", "Category", "Base unit", "Purchase unit", "Length", "Width", "Thickness", "Dimension unit", "Notes", "Price ID", "Supplier", "Amount", "Currency", "Price notes"] as const;
const MAX_BYTES = 5 * 1024 * 1024;
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
function value(row: ExcelJS.Row, index: number): string {
  const cell = row.getCell(index);
  const raw = cell.value;
  if (raw === null || raw === undefined) return "";
  if (typeof raw === "object" && "text" in raw) return clean((raw as { text: string }).text);
  return clean(raw);
}
function same(a: string | null | undefined, b: string | null | undefined): boolean { return (a ?? "") === (b ?? ""); }

export function createSkuPriceWorkbookService(
  db: PrismaClient,
  ports: MasterDataServicePorts,
  createScopedService: (tx: unknown) => { createSku: (input: any) => Promise<{ skuId: string }>; updateSku: (input: any) => Promise<unknown>; createPriceMaterial: (input: any) => Promise<{ priceMaterialId: string }>; updatePriceMaterial: (input: any) => Promise<unknown> },
) {
  async function readRows(file: WorkbookFile): Promise<{ data: Buffer; rows: ParsedRow[] }> {
    const input = bytesOf(file);
    if (input.data.length > MAX_BYTES) fileError("The workbook is larger than 5 MB.");
    if ((input.name && !input.name.toLowerCase().endsWith(".xlsx")) || (input.type && input.type !== "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" && input.type !== "application/octet-stream")) fileError("Upload an .xlsx workbook.");
    const book = new ExcelJS.Workbook();
    try { await book.xlsx.load(input.data as any); } catch { fileError("The uploaded file is not a readable .xlsx workbook."); }
    const sheet = book.getWorksheet(SHEET);
    if (!sheet) fileError('The workbook must contain a sheet named "SKU Prices".');
    for (let index = 0; index < HEADERS.length; index += 1) if (value(sheet.getRow(1), index + 1) !== HEADERS[index]) fileError("The SKU Prices header row does not match the exported workbook.");
    const rows: ParsedRow[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1 || row.values.length === 0 || HEADERS.every((_, i) => !value(row, i + 1))) return;
      rows.push(Object.assign({ row: rowNumber }, Object.fromEntries(HEADERS.map((header, i) => [header, value(row, i + 1)]))) as unknown as ParsedRow);
    });
    if (rows.length > MAX_ROWS) fileError("The workbook has more than 2,000 data rows.");
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
      if (source.Amount) try { requiredAmount(source.Amount); } catch { add("Amount", "Amount must be a non-negative decimal."); }
      if (hasPrice && !source.Currency) add("Currency", "Currency is required for a material price."); if (source.Currency) try { requiredCurrency(source.Currency); } catch { add("Currency", "Currency must be a 3-letter code."); }
      if (!skuId && !hasPrice) add("Supplier", "A new SKU needs its first material price.");
      if (!source.Name && !source.Code) add("Name", "SKU name or code is required.");
      if (price && supplierId && price.supplier_vendor_id !== supplierId) add("Supplier", "Supplier cannot be changed for an existing price.");
      const duplicate = skuId ? `${skuId}:${priceId || supplierId || "sku"}` : `${key(source.Code)}:${key(source.Name)}:${supplierId || ""}`;
      if (seen.has(duplicate)) add(priceId ? "Price ID" : "Supplier", "This row duplicates another SKU and supplier price row."); else seen.add(duplicate);
      const candidate = { ...source, sku, price, brandId, categoryId: categoryId ?? "", baseUnitId: baseUnitId ?? "", purchaseUnitId, dimensionUnitId, supplierId } as ValidRow;
      let outcome: Outcome = "error";
      if (errors.length === 0) {
        const skuChanged = !sku || !same(sku.name, source.Name || null) || !same(sku.code, source.Code || null) || !same(sku.notes, source.Notes || null) || sku.brand_id !== brandId || sku.base_unit_id !== baseUnitId || sku.purchase_unit_id !== purchaseUnitId || !same(sku.dimension_length?.toString() ?? null, source.Length || null) || !same(sku.dimension_width?.toString() ?? null, source.Width || null) || !same(sku.dimension_thickness?.toString() ?? null, source.Thickness || null) || sku.dimension_unit_id !== dimensionUnitId || sku.categories[0]?.category_id !== categoryId;
        const priceChanged = hasPrice && (!price || price.amount.toString() !== requiredAmount(source.Amount) || price.currency !== requiredCurrency(source.Currency) || !same(price.notes, source["Price notes"] || null));
        outcome = !sku ? "create" : skuChanged || priceChanged ? "update" : "unchanged";
        valid.push(candidate);
      }
      results.push({ row: source.row, outcome, errors });
    }
    return { rows: results, errors: results.flatMap((x) => x.errors), valid };
  }

  return {
    async exportSkuPriceWorkbook(input: { grants: PermissionGrants }): Promise<Buffer> {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.skuRead); requirePermission(input.grants, MASTERDATA_PERMISSIONS.priceMaterialRead);
      const [skus, brands, categories, units, vendors] = await Promise.all([
        db.sku.findMany({ where: { deleted_at: null }, include: { brand: true, base_unit: true, purchase_unit: true, dimension_unit: true, categories: { include: { category: true } }, material_prices: { where: { deleted_at: null }, include: { supplier_vendor: true } } }, orderBy: { name: "asc" } }),
        db.brand.findMany({ where: { deleted_at: null }, select: { name: true }, orderBy: { name: "asc" } }), db.category.findMany({ where: { status: "ACTIVE", kind: "PRODUCT" }, select: { name: true }, orderBy: { name: "asc" } }), db.unit.findMany({ where: { status: "ACTIVE" }, select: { code: true, name: true }, orderBy: { code: "asc" } }), db.vendor.findMany({ where: { deleted_at: null }, select: { name: true }, orderBy: { name: "asc" } }),
      ]);
      const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet(SHEET); sheet.addRow(HEADERS); sheet.getRow(1).font = { bold: true }; sheet.views = [{ state: "frozen", ySplit: 1 }];
      for (const sku of skus) {
        const common = [sku.id, sku.code ?? "", sku.name ?? "", sku.brand?.name ?? "", sku.categories[0]?.category.name ?? "", sku.base_unit.code, sku.purchase_unit?.code ?? "", sku.dimension_length?.toString() ?? "", sku.dimension_width?.toString() ?? "", sku.dimension_thickness?.toString() ?? "", sku.dimension_unit?.code ?? "", sku.notes ?? ""];
        const prices = sku.material_prices.length ? sku.material_prices : [null]; for (const price of prices) sheet.addRow([...common, price?.id ?? "", price?.supplier_vendor.name ?? "", price?.amount.toString() ?? "", price?.currency ?? "", price?.notes ?? ""]);
      }
      const ref = book.addWorksheet("Reference"); ref.addRow(["Brands", "Categories", "Units", "Suppliers"]); const total = Math.max(brands.length, categories.length, units.length, vendors.length); for (let i = 0; i < total; i += 1) ref.addRow([brands[i]?.name ?? "", categories[i]?.name ?? "", units[i] ? `${units[i].code} — ${units[i].name}` : "", vendors[i]?.name ?? ""]); await ref.protect("", { selectLockedCells: true });
      return Buffer.from(await book.xlsx.writeBuffer());
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
        const check = await validate(parsed.rows, tx as PrismaClient); if (check.errors.length) throw new AppError("VALIDATION", "SKU_PRICE_IMPORT_ERRORS", "Fix the workbook errors before applying.", { details: { errors: check.errors } });
        const service = createScopedService(tx); let created = 0; let updated = 0;
        for (const row of check.valid) {
          const skuInput = { grants: input.grants, actor: input.actor, name: row.Name || null, code: row.Code || null, notes: row.Notes || null, brandId: row.brandId, baseUnitId: row.baseUnitId, purchaseUnitId: row.purchaseUnitId, dimensionLength: row.Length || null, dimensionWidth: row.Width || null, dimensionThickness: row.Thickness || null, dimensionUnitId: row.dimensionUnitId, categoryId: row.categoryId };
          let skuId = row.sku?.id;
          if (!skuId) { const result = await service.createSku({ ...skuInput, suppressAudit: true, priceMaterials: [{ supplierVendorId: row.supplierId!, amount: row.Amount, currency: row.Currency, notes: row["Price notes"] || undefined }] }); skuId = result.skuId; created += 1; continue; }
          const before = check.rows.find((x) => x.row === row.row)!; if (before.outcome === "update") { await service.updateSku({ ...skuInput, skuId, suppressAudit: true }); updated += 1; }
          if (row.Supplier && !row.price) { await service.createPriceMaterial({ grants: input.grants, actor: input.actor, skuId, supplierVendorId: row.supplierId!, amount: row.Amount, currency: row.Currency, notes: row["Price notes"] || undefined, suppressAudit: true }); if (before.outcome !== "update") updated += 1; }
          else if (row.price && (row.price.amount.toString() !== requiredAmount(row.Amount) || row.price.currency !== requiredCurrency(row.Currency) || !same(row.price.notes, row["Price notes"] || null))) await service.updatePriceMaterial({ grants: input.grants, actor: input.actor, priceMaterialId: row.price.id, amount: row.Amount, currency: row.Currency, notes: row["Price notes"] || null, suppressAudit: true });
        }
        await ports.auditWriter.write(prepareAuditEvent({ appId: "masterdata", action: "sku-price-workbook.applied", entityType: "sku_price_workbook", entityId: actual, actor: input.actor, metadata: { created, updated, unchanged: check.rows.filter((x) => x.outcome === "unchanged").length } }), tx as any);
        return { totals: { create: created, update: updated, unchanged: check.rows.filter((x) => x.outcome === "unchanged").length, error: 0 } };
      });
    },
  };
}
