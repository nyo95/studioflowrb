import type { TransactionClient } from "@platform/core/db";
import { AppError } from "@platform/core/errors";

import type { BrandService } from "../application/brand-service";
import type { BusinessTypeService } from "../application/business-type-service";
import type { CategoryService } from "../application/category-service";
import type { MasterDataExecutionContext } from "../application/execution-context";
import type { WorkbookApplier, WorkbookCell, WorkbookData, WorkbookRow } from "../application/import-export";
import type { PartyService } from "../application/party-service";
import type { PricingService } from "../application/pricing-service";
import type { SkuService } from "../application/sku-service";
import type { UnitService } from "../application/unit-service";
import type { PartyRole, PartyType } from "../domain/party-rules";
import type { SkuKind, SkuMediaKind } from "../domain/sku-rules";
import type { WorkPriceKind } from "../domain/pricing-rules";
import type { PartyLinkKind } from "../application/party-repository";

type Services = {
  units: UnitService;
  businessTypes: BusinessTypeService;
  categories: CategoryService;
  parties: PartyService;
  brands: BrandService;
  skus: SkuService;
  pricing: PricingService;
};

const text = (row: WorkbookRow, key: string): string => {
  const value = row[key];
  return value === null || value === undefined ? "" : String(value);
};
const optional = (row: WorkbookRow, key: string): string | null => text(row, key).trim() || null;
const numberValue = (row: WorkbookRow, key: string, fallback = 0): number => {
  const value = row[key];
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new AppError("VALIDATION", "WORKBOOK_NUMBER_INVALID", `${key} must be a finite number.`);
  return parsed;
};
const booleanValue = (row: WorkbookRow, key: string, fallback = false): boolean => {
  const value = row[key];
  if (value === null || value === undefined || value === "") return fallback;
  if (value === true || value === false) return value;
  if (value === "true" || value === "TRUE" || value === 1) return true;
  if (value === "false" || value === "FALSE" || value === 0) return false;
  throw new AppError("VALIDATION", "WORKBOOK_BOOLEAN_INVALID", `${key} must be true or false.`);
};
const json = <T>(row: WorkbookRow, key: string, fallback: T): T => {
  const value = row[key];
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value !== "string") throw new AppError("VALIDATION", "WORKBOOK_JSON_INVALID", `${key} must contain JSON text.`);
  try { return JSON.parse(value) as T; }
  catch { throw new AppError("VALIDATION", "WORKBOOK_JSON_INVALID", `${key} must contain valid JSON.`); }
};
const requiredId = (row: WorkbookRow, sheet: string): string => {
  const id = optional(row, "id");
  if (!id) throw new AppError("VALIDATION", "WORKBOOK_GRAPH_ID_REQUIRED", `${sheet} needs a stable ID when another sheet refers to it.`);
  return id;
};
const rowsBy = (rows: readonly WorkbookRow[], key: string) => {
  const grouped = new Map<string, WorkbookRow[]>();
  for (const row of rows) {
    const id = text(row, key);
    const bucket = grouped.get(id) ?? [];
    bucket.push(row);
    grouped.set(id, bucket);
  }
  return grouped;
};
const mergeById = <T extends { id: string }>(stored: readonly T[], supplied: readonly T[]): T[] => {
  const merged = new Map(stored.map((row) => [row.id, row]));
  for (const row of supplied) merged.set(row.id, row);
  return [...merged.values()];
};
const exists = async (tx: TransactionClient, model: "unit" | "businessType" | "category" | "party" | "brand" | "sku" | "workPrice", id: string) => {
  if (!id) return false;
  switch (model) {
    case "unit": return Boolean(await tx.unit.findUnique({ where: { id }, select: { id: true } }));
    case "businessType": return Boolean(await tx.businessType.findUnique({ where: { id }, select: { id: true } }));
    case "category": return Boolean(await tx.category.findUnique({ where: { id }, select: { id: true } }));
    case "party": return Boolean(await tx.party.findUnique({ where: { id }, select: { id: true } }));
    case "brand": return Boolean(await tx.brand.findUnique({ where: { id }, select: { id: true } }));
    case "sku": return Boolean(await tx.sku.findUnique({ where: { id }, select: { id: true } }));
    case "workPrice": return Boolean(await tx.workPrice.findUnique({ where: { id }, select: { id: true } }));
  }
};

export function createWorkbookApplier(services: Services): WorkbookApplier {
  return {
    async apply(tx: TransactionClient, context: MasterDataExecutionContext, data: WorkbookData): Promise<number> {
      let changed = 0;
      const ctx = { ...context, transaction: tx };

      for (const row of data.sheets.Unit) {
        const id = optional(row, "id");
        const input = { code: text(row, "code"), label: text(row, "label"), symbol: optional(row, "symbol"), aliases: json<string[]>(row, "aliases", []), usages: json<never[]>(row, "usages", []), sortOrder: numberValue(row, "sort_order") };
        if (id && await exists(tx, "unit", id)) await services.units.update(ctx, { id, ...input });
        else await services.units.create(ctx, { requestedId: id ?? undefined, ...input });
        changed++;
      }
      for (const row of data.sheets.BusinessType) {
        const id = optional(row, "id");
        const input = { code: text(row, "code"), label: text(row, "label"), description: optional(row, "description"), sortOrder: numberValue(row, "sort_order") };
        if (id && await exists(tx, "businessType", id)) await services.businessTypes.update(ctx, { id, ...input });
        else await services.businessTypes.create(ctx, { requestedId: id ?? undefined, ...input });
        changed++;
      }

      const partyRoles = rowsBy(data.sheets.PartyRole, "party_id");
      const partyTypes = rowsBy(data.sheets.PartyBusinessType, "party_id");
      const partyContacts = rowsBy(data.sheets.PartyContact, "party_id");
      const partyLinks = rowsBy(data.sheets.PartyLink, "party_id");
      const partyInput = async (row: WorkbookRow, includeBrandContacts: boolean) => {
        const id = requiredId(row, "Party");
        const stored = await tx.party.findUnique({ where: { id }, include: { roles: true, business_types: true, contacts: true, links: true } });
        const suppliedRoles = (partyRoles.get(id) ?? []).map((x) => ({ id: requiredId(x, "PartyRole"), role: text(x, "role") as PartyRole }));
        const suppliedTypes = (partyTypes.get(id) ?? []).map((x) => ({ id: requiredId(x, "PartyBusinessType"), businessTypeId: text(x, "business_type_id") }));
        const suppliedContacts = (partyContacts.get(id) ?? []).filter((x) => includeBrandContacts || !optional(x, "brand_id")).map((x) => ({ id: requiredId(x, "PartyContact"), personName: text(x, "person_name"), jobTitle: optional(x, "job_title"), phone: optional(x, "phone"), email: optional(x, "email"), isPrimary: booleanValue(x, "is_primary"), notes: optional(x, "notes"), brandId: optional(x, "brand_id") }));
        const suppliedLinks = (partyLinks.get(id) ?? []).map((x) => ({ id: requiredId(x, "PartyLink"), kind: text(x, "kind") as PartyLinkKind, url: text(x, "url"), archiveUrl: optional(x, "archive_url"), label: optional(x, "label"), sortOrder: numberValue(x, "sort_order") }));
        const roleAssignments = mergeById(stored?.roles.map((x) => ({ id: x.id, role: x.role as PartyRole })) ?? [], suppliedRoles);
        const businessTypeAssignments = mergeById(stored?.business_types.map((x) => ({ id: x.id, businessTypeId: x.business_type_id })) ?? [], suppliedTypes);
        const contacts = mergeById(stored?.contacts.map((x) => ({ id: x.id, personName: x.person_name, jobTitle: x.job_title, phone: x.phone, email: x.email, isPrimary: x.is_primary, notes: x.notes, brandId: x.brand_id })) ?? [], suppliedContacts);
        const links = mergeById(stored?.links.map((x) => ({ id: x.id, kind: x.kind as PartyLinkKind, url: x.url, archiveUrl: x.archive_url, label: x.label, sortOrder: x.sort_order })) ?? [], suppliedLinks);
        return {
          requestedId: id, name: text(row, "name"), type: text(row, "type") as PartyType,
          legalName: optional(row, "legal_name"), address: optional(row, "address"), notes: optional(row, "notes"),
          roles: roleAssignments.map((x) => x.role), roleAssignments,
          businessTypeIds: businessTypeAssignments.map((x) => x.businessTypeId), businessTypeAssignments,
          contacts, links,
        };
      };
      for (const row of data.sheets.Party) {
        const id = requiredId(row, "Party");
        const input = await partyInput(row, false);
        if (await exists(tx, "party", id)) await services.parties.update(ctx, { id, ...input }); else await services.parties.create(ctx, input);
        changed++;
      }

      const pendingCategories = [...data.sheets.Category];
      const orderedCategories: WorkbookRow[] = [];
      const availableCategoryIds = new Set((await tx.category.findMany({ select: { id: true } })).map((x) => x.id));
      while (pendingCategories.length) {
        const index = pendingCategories.findIndex((row) => !optional(row, "parent_id") || availableCategoryIds.has(text(row, "parent_id")));
        if (index < 0) throw new AppError("VALIDATION", "WORKBOOK_CATEGORY_DEPENDENCY_INVALID", "Category parents must exist in the database or workbook, without cycles.");
        const [row] = pendingCategories.splice(index, 1);
        orderedCategories.push(row);
        const id = optional(row, "id"); if (id) availableCategoryIds.add(id);
      }
      for (const row of orderedCategories) {
        const id = optional(row, "id");
        const input = { kind: text(row, "kind") as "PRODUCT" | "WORK", name: text(row, "name"), parentId: optional(row, "parent_id"), searchSynonyms: json<string[]>(row, "search_synonyms", []), sortOrder: numberValue(row, "sort_order"), description: optional(row, "description") };
        if (id && await exists(tx, "category", id)) await services.categories.update(ctx, { id, ...input });
        else await services.categories.create(ctx, { requestedId: id ?? undefined, ...input });
        changed++;
      }

      const brandCategories = rowsBy(data.sheets.BrandCategory, "brand_id");
      const brandSuppliers = rowsBy(data.sheets.BrandSupplier, "brand_id");
      const brandLinks = rowsBy(data.sheets.BrandLink, "brand_id");
      for (const row of data.sheets.Brand) {
        const id = requiredId(row, "Brand");
        const stored = await tx.brand.findUnique({ where: { id }, include: { categories: true, suppliers: true, links: true } });
        const categories = mergeById(stored?.categories.map((x) => ({ id: x.id, categoryId: x.category_id, sortOrder: x.sort_order })) ?? [], (brandCategories.get(id) ?? []).map((x) => ({ id: requiredId(x, "BrandCategory"), categoryId: text(x, "category_id"), sortOrder: numberValue(x, "sort_order") })));
        const suppliers = mergeById(stored?.suppliers.map((x) => ({ id: x.id, partyId: x.party_id, isAuthorized: x.is_authorized, notes: x.notes })) ?? [], (brandSuppliers.get(id) ?? []).map((x) => ({ id: requiredId(x, "BrandSupplier"), partyId: text(x, "party_id"), isAuthorized: booleanValue(x, "is_authorized"), notes: optional(x, "notes") })));
        const links = mergeById(stored?.links.map((x) => ({ id: x.id, kind: x.kind as PartyLinkKind, url: x.url, archiveUrl: x.archive_url, label: x.label, sortOrder: x.sort_order })) ?? [], (brandLinks.get(id) ?? []).map((x) => ({ id: requiredId(x, "BrandLink"), kind: text(x, "kind") as PartyLinkKind, url: text(x, "url"), archiveUrl: optional(x, "archive_url"), label: optional(x, "label"), sortOrder: numberValue(x, "sort_order") })));
        const input = {
          requestedId: id, name: text(row, "name"), ownerPartyId: optional(row, "owner_party_id"), notes: optional(row, "notes"),
          categories, suppliers, links,
        };
        if (await exists(tx, "brand", id)) await services.brands.update(ctx, { id, ...input }); else await services.brands.create(ctx, input);
        changed++;
      }
      // Brand-scoped contacts are validated only after Brands exist; this resolves
      // the intentional Party-owner/Brand-contact dependency cycle atomically.
      for (const row of data.sheets.Party) {
        const id = requiredId(row, "Party");
        if ((partyContacts.get(id) ?? []).some((x) => optional(x, "brand_id"))) await services.parties.update(ctx, { id, ...await partyInput(row, true) });
      }

      const skuMedia = rowsBy(data.sheets.SkuMedia, "sku_id");
      const skuPricesBySku = new Map<string, WorkbookRow[]>();
      for (const row of data.sheets.SkuPrice) {
        const skuId = text(row, "sku_id");
        const bucket = skuPricesBySku.get(skuId) ?? [];
        bucket.push(row);
        skuPricesBySku.set(skuId, bucket);
      }
      const appliedPricePairKeys = new Set<string>();
      const pricePairKey = (skuId: string, supplierPartyId: string | null) => `${skuId}\u0000${supplierPartyId ?? ""}`;
      const applySkuPrice = async (row: WorkbookRow, coordinatedSku?: { canonicalUnitId: string; brandId: string | null }) => {
        const skuId = text(row, "sku_id");
        const supplierPartyId = optional(row, "supplier_party_id");
        const existing = await tx.skuPrice.findFirst({ where: { sku_id: skuId, supplier_party_id: supplierPartyId }, select: { id: true } });
        const requestedId = optional(row, "id");
        if (existing && requestedId && existing.id !== requestedId) throw new AppError("CONFLICT", "WORKBOOK_SKU_PRICE_ID_MISMATCH", "SkuPrice ID does not match the current row for this SKU and supplier pair.");
        await services.pricing.setSkuPrice(ctx, { requestedId: requestedId ?? undefined, skuId, supplierPartyId, amount: text(row, "amount"), currency: text(row, "currency"), unitId: text(row, "unit_id"), sourceLinkId: optional(row, "source_link_id"), notes: optional(row, "notes"), coordinatedSku });
        appliedPricePairKeys.add(pricePairKey(skuId, supplierPartyId));
      };
      const desiredStatuses = new Map<string, string>();
      for (const row of data.sheets.Sku) {
        const id = optional(row, "id");
        const storedMedia = id ? await tx.skuMedia.findMany({ where: { sku_id: id } }) : [];
        const media = mergeById(storedMedia.map((x) => ({ id: x.id, kind: x.kind as SkuMediaKind, url: x.url, label: x.label, sortOrder: x.sort_order })), (id ? skuMedia.get(id) ?? [] : []).map((x) => ({ id: requiredId(x, "SkuMedia"), kind: text(x, "kind") as SkuMediaKind, url: text(x, "url"), label: optional(x, "label"), sortOrder: numberValue(x, "sort_order") })));
        const input = {
          requestedId: id ?? undefined, code: optional(row, "code"), name: text(row, "name"), brandId: optional(row, "brand_id"), categoryId: optional(row, "category_id"), kind: text(row, "kind") as SkuKind,
          spec: json<unknown>(row, "spec", null), dimensionLength: optional(row, "dim_length"), dimensionWidth: optional(row, "dim_width"), dimensionHeight: optional(row, "dim_height"), dimensionUnitId: optional(row, "dim_unit_id"), dimensionDisplay: optional(row, "dim_display"),
          baseUnitId: text(row, "base_unit_id"), purchaseUnitId: optional(row, "purchase_unit_id"), conversion: optional(row, "conversion"), defaultWastePct: optional(row, "default_waste_pct"), minimumOrder: optional(row, "minimum_order"), roundingIncrement: optional(row, "rounding_increment"), notes: optional(row, "notes"),
          media,
        };
        if (id) {
          const current = await tx.sku.findUnique({ where: { id }, select: { base_unit_id: true, purchase_unit_id: true } });
          const intendedUnit = input.purchaseUnitId ?? input.baseUnitId;
          if (current && (current.purchase_unit_id ?? current.base_unit_id) !== intendedUnit) {
            for (const priceRow of skuPricesBySku.get(id) ?? []) await applySkuPrice(priceRow, { canonicalUnitId: intendedUnit, brandId: input.brandId });
          }
        }
        const saved = id && await exists(tx, "sku", id) ? await services.skus.update(ctx, { id, ...input }) : await services.skus.create(ctx, input);
        desiredStatuses.set(saved.id, text(row, "status"));
        changed++;
      }
      for (const row of data.sheets.SkuPrice) {
        if (!appliedPricePairKeys.has(pricePairKey(text(row, "sku_id"), optional(row, "supplier_party_id")))) await applySkuPrice(row);
        changed++;
      }
      for (const row of data.sheets.WorkPrice) {
        const id = optional(row, "id");
        const input = { code: text(row, "code"), name: text(row, "name"), categoryId: text(row, "category_id"), vendorPartyId: optional(row, "vendor_party_id"), spec: json<unknown>(row, "spec", null), dimensionDisplay: optional(row, "dim_display"), unitId: text(row, "unit_id"), amount: text(row, "amount"), kind: text(row, "kind") as WorkPriceKind, currency: text(row, "currency"), scopeNote: optional(row, "scope_note"), notes: optional(row, "notes") };
        if (id && await exists(tx, "workPrice", id)) await services.pricing.updateWorkPrice(ctx, { id, ...input }); else await services.pricing.createWorkPrice(ctx, { requestedId: id ?? undefined, ...input });
        changed++;
      }
      for (const [id, status] of desiredStatuses) {
        const current = await tx.sku.findUnique({ where: { id }, select: { status: true } });
        if (!current || current.status === status) continue;
        if (status === "ACTIVE") await services.skus.activate(ctx, id);
        else if (status === "DISCONTINUED") await services.skus.discontinue(ctx, id);
        else throw new AppError("VALIDATION", "WORKBOOK_SKU_STATUS_INVALID", "Workbook import cannot reverse a SKU lifecycle transition.");
      }
      return Object.values(data.sheets).reduce((count, rows) => count + rows.length, 0);
    },
  };
}
