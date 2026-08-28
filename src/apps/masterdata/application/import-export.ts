import type { TransactionClient } from "@platform/core/db";
import { prepareAuditEvent, type AuditWriter } from "@platform/core/audit";
import { AppError } from "@platform/core/errors";
import { requirePermission } from "@platform/core/rbac";
import type { MasterDataExecutionContext, TransactionRunner } from "./execution-context";
import {
  MASTERDATA_BRAND_MANAGE, MASTERDATA_BRAND_READ, MASTERDATA_CATEGORY_MANAGE,
  MASTERDATA_CATEGORY_READ, MASTERDATA_DICTIONARY_MANAGE, MASTERDATA_DICTIONARY_READ,
  MASTERDATA_EXPORT_READ, MASTERDATA_IMPORT_EXECUTE, MASTERDATA_PARTY_MANAGE,
  MASTERDATA_PARTY_READ, MASTERDATA_PRICE_MANAGE, MASTERDATA_PRICE_READ,
  MASTERDATA_SKU_MANAGE, MASTERDATA_SKU_READ,
} from "./masterdata-permissions";

export const MASTERDATA_WORKBOOK_VERSION = "1";
export const MASTERDATA_WORKBOOK_SHEETS = [
  "Unit", "BusinessType", "Party", "PartyRole", "PartyBusinessType", "PartyContact", "PartyLink",
  "Brand", "BrandLink", "BrandSupplier", "Category", "BrandCategory", "Sku", "SkuMedia", "SkuPrice", "WorkPrice",
] as const;
export type MasterDataWorkbookSheet = typeof MASTERDATA_WORKBOOK_SHEETS[number];
export type WorkbookCell = string | number | boolean | null;
export type WorkbookRow = Readonly<Record<string, WorkbookCell>>;
export type WorkbookData = Readonly<{
  manifest: Readonly<{ formatVersion: string; exportedAt: string; scope: string }>;
  sheets: Readonly<Record<MasterDataWorkbookSheet, readonly WorkbookRow[]>>;
}>;
export type WorkbookIssue = Readonly<{ sheet: string; row?: number; field?: string; code: string; message: string }>;
export type WorkbookPreview = Readonly<{ data: WorkbookData | null; issues: readonly WorkbookIssue[]; changedRows: number }>;

export const WORKBOOK_COLUMNS: Readonly<Record<MasterDataWorkbookSheet, readonly string[]>> = {
  Unit: ["id", "code", "label", "symbol", "aliases", "usages", "sort_order", "updated_at"],
  BusinessType: ["id", "code", "label", "description", "sort_order", "updated_at"],
  Party: ["id", "name", "slug", "type", "legal_name", "address", "notes", "updated_at"],
  PartyRole: ["id", "party_id", "role", "updated_at"],
  PartyBusinessType: ["id", "party_id", "business_type_id", "updated_at"],
  PartyContact: ["id", "party_id", "person_name", "job_title", "phone", "email", "is_primary", "notes", "brand_id", "updated_at"],
  PartyLink: ["id", "party_id", "kind", "url", "archive_url", "label", "sort_order", "updated_at"],
  Brand: ["id", "name", "slug", "owner_party_id", "notes", "updated_at"],
  BrandLink: ["id", "brand_id", "kind", "url", "archive_url", "label", "sort_order", "updated_at"],
  BrandSupplier: ["id", "brand_id", "party_id", "is_authorized", "notes", "updated_at"],
  Category: ["id", "kind", "name", "slug", "parent_id", "path", "search_synonyms", "sort_order", "description", "updated_at"],
  BrandCategory: ["id", "brand_id", "category_id", "sort_order", "updated_at"],
  Sku: ["id", "code", "name", "slug", "brand_id", "category_id", "kind", "status", "spec", "dim_length", "dim_width", "dim_height", "dim_unit_id", "dim_display", "base_unit_id", "purchase_unit_id", "conversion", "default_waste_pct", "minimum_order", "rounding_increment", "notes", "updated_at"],
  SkuMedia: ["id", "sku_id", "kind", "url", "label", "sort_order", "updated_at"],
  SkuPrice: ["id", "sku_id", "supplier_party_id", "amount", "currency", "unit_id", "source_link_id", "notes", "updated_by_user_id", "updated_by_label", "updated_at"],
  WorkPrice: ["id", "code", "name", "category_id", "vendor_party_id", "spec", "dim_display", "unit_id", "amount", "kind", "currency", "scope_note", "notes", "updated_by_user_id", "updated_by_label", "updated_at"],
};

const managePermissions: Readonly<Record<MasterDataWorkbookSheet, string>> = {
  Unit: MASTERDATA_DICTIONARY_MANAGE, BusinessType: MASTERDATA_DICTIONARY_MANAGE,
  Party: MASTERDATA_PARTY_MANAGE, PartyRole: MASTERDATA_PARTY_MANAGE, PartyBusinessType: MASTERDATA_PARTY_MANAGE,
  PartyContact: MASTERDATA_PARTY_MANAGE, PartyLink: MASTERDATA_PARTY_MANAGE,
  Brand: MASTERDATA_BRAND_MANAGE, BrandLink: MASTERDATA_BRAND_MANAGE, BrandSupplier: MASTERDATA_BRAND_MANAGE,
  Category: MASTERDATA_CATEGORY_MANAGE, BrandCategory: MASTERDATA_BRAND_MANAGE,
  Sku: MASTERDATA_SKU_MANAGE, SkuMedia: MASTERDATA_SKU_MANAGE,
  SkuPrice: MASTERDATA_PRICE_MANAGE, WorkPrice: MASTERDATA_PRICE_MANAGE,
};
const readPermissions = [MASTERDATA_DICTIONARY_READ, MASTERDATA_PARTY_READ, MASTERDATA_BRAND_READ, MASTERDATA_CATEGORY_READ, MASTERDATA_SKU_READ, MASTERDATA_PRICE_READ];
function requireEvery(grants: MasterDataExecutionContext["grants"], permissions: readonly string[]): void {
  for (const permission of permissions) requirePermission(grants, permission);
}

export interface WorkbookCodec { encode(data: WorkbookData): Promise<Uint8Array>; decode(bytes: Uint8Array): Promise<WorkbookData>; }
export interface WorkbookStore {
  exportAll(tx: TransactionClient, exportedAt: Date): Promise<WorkbookData>;
  currentVersions(tx: TransactionClient, data: WorkbookData): Promise<Readonly<Record<string, string | null>>>;
}
export interface WorkbookApplier {
  /** Must call approved application services with the supplied transaction. */
  apply(tx: TransactionClient, context: MasterDataExecutionContext, data: WorkbookData): Promise<number>;
}

export function validateWorkbookStructure(data: WorkbookData, versions: Readonly<Record<string, string | null>> = {}): WorkbookIssue[] {
  const issues: WorkbookIssue[] = [];
  if (data.manifest.formatVersion !== MASTERDATA_WORKBOOK_VERSION) issues.push({ sheet: "Manifest", field: "format_version", code: "UNKNOWN_VERSION", message: "Unsupported workbook format version." });
  const seenPricePairs = new Set<string>();
  for (const sheet of MASTERDATA_WORKBOOK_SHEETS) {
    const allowed = new Set(WORKBOOK_COLUMNS[sheet]);
    data.sheets[sheet].forEach((row, index) => {
      for (const field of Object.keys(row)) if (!allowed.has(field)) issues.push({ sheet, row: index + 2, field, code: "UNKNOWN_COLUMN", message: "Unknown workbook column." });
      const id = typeof row.id === "string" ? row.id : null;
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (id && !uuid.test(id)) issues.push({ sheet, row: index + 2, field: "id", code: "INVALID_ID", message: "IDs must be valid UUIDs." });
      for (const [field, value] of Object.entries(row)) if (field.endsWith("_id") && field !== "updated_by_user_id" && typeof value === "string" && value && !uuid.test(value)) issues.push({ sheet, row: index + 2, field: "id", code: "INVALID_REFERENCE_ID", message: "Reference IDs must be valid UUIDs." });
      const updatedAt = typeof row.updated_at === "string" ? row.updated_at : null;
      if (id && Object.hasOwn(versions, `${sheet}:${id}`) && versions[`${sheet}:${id}`] !== updatedAt) issues.push({ sheet, row: index + 2, field: "updated_at", code: "STALE_ROW", message: "The database row changed after this workbook was exported." });
      if (id && updatedAt && !Object.hasOwn(versions, `${sheet}:${id}`)) issues.push({ sheet, row: index + 2, field: "updated_at", code: "STALE_ROW", message: "The referenced database row no longer exists." });
      if (sheet === "SkuPrice") {
        const skuId = typeof row.sku_id === "string" ? row.sku_id : "";
        if (!skuId) issues.push({ sheet, row: index + 2, field: "sku_id", code: "REQUIRED", message: "SKU ID is required." });
        else {
          const supplierId = typeof row.supplier_party_id === "string" ? row.supplier_party_id : "";
          const pairKey = `${skuId}\u0000${supplierId}`;
          if (seenPricePairs.has(pairKey)) issues.push({ sheet, row: index + 2, field: "sku_id", code: "DUPLICATE_SKU_PRICE", message: "Only one current price row is allowed per SKU and supplier pair." });
          else seenPricePairs.add(pairKey);
        }
      }
    });
  }
  return issues;
}

export class ImportExportService {
  constructor(private readonly ports: { runTransaction: TransactionRunner; codec: WorkbookCodec; store: WorkbookStore; applier: WorkbookApplier; auditWriter?: AuditWriter; now: () => Date; generateId?: () => string }) {}

  async export(context: MasterDataExecutionContext): Promise<Uint8Array> {
    requirePermission(context.grants, MASTERDATA_EXPORT_READ); requireEvery(context.grants, readPermissions);
    const data = await this.ports.runTransaction(async (tx) => {
      const exportedAt = this.ports.now();
      const value = await this.ports.store.exportAll(tx, exportedAt);
      if (this.ports.auditWriter) {
        const counts = Object.fromEntries(MASTERDATA_WORKBOOK_SHEETS.map((sheet) => [sheet, value.sheets[sheet].length]));
        await this.ports.auditWriter.write(prepareAuditEvent({ appId: "masterdata", action: "masterdata.exported", entityType: "workbook", entityId: this.ports.generateId?.() ?? "export", actor: context.actor, requestId: context.requestId, occurredAt: exportedAt, metadata: { scope: value.manifest.scope, counts } }), tx);
      }
      return value;
    });
    return this.ports.codec.encode(data);
  }

  async preview(context: MasterDataExecutionContext, bytes: Uint8Array): Promise<WorkbookPreview> {
    requirePermission(context.grants, MASTERDATA_IMPORT_EXECUTE);
    let data: WorkbookData;
    try { data = await this.ports.codec.decode(bytes); }
    catch { return { data: null, issues: [{ sheet: "Manifest", code: "INVALID_WORKBOOK", message: "The workbook could not be read safely." }], changedRows: 0 }; }
    const populated = MASTERDATA_WORKBOOK_SHEETS.filter((sheet) => data.sheets[sheet].length > 0);
    requireEvery(context.grants, [...new Set(populated.map((sheet) => managePermissions[sheet]))]);
    const versions = await this.ports.runTransaction((tx) => this.ports.store.currentVersions(tx, data));
    const issues = validateWorkbookStructure(data, versions);
    return { data: issues.length ? null : data, issues, changedRows: populated.reduce((count, sheet) => count + data.sheets[sheet].length, 0) };
  }

  async apply(context: MasterDataExecutionContext, preview: WorkbookPreview): Promise<number> {
    requirePermission(context.grants, MASTERDATA_IMPORT_EXECUTE);
    if (!preview.data || preview.issues.length) throw new AppError("VALIDATION", "WORKBOOK_NOT_APPLICABLE", "Resolve every workbook issue before applying it.");
    const populated = MASTERDATA_WORKBOOK_SHEETS.filter((sheet) => preview.data!.sheets[sheet].length > 0);
    requireEvery(context.grants, [...new Set(populated.map((sheet) => managePermissions[sheet]))]);
    return this.ports.runTransaction(async (tx) => {
      const versions = await this.ports.store.currentVersions(tx, preview.data!);
      const issues = validateWorkbookStructure(preview.data!, versions);
      if (issues.length) throw new AppError("CONFLICT", "WORKBOOK_STALE", "The workbook changed or is stale; preview it again.", { details: { issues } });
      return this.ports.applier.apply(tx, { ...context, requestId: context.requestId ?? this.ports.generateId?.(), transaction: tx }, preview.data!);
    });
  }
}
