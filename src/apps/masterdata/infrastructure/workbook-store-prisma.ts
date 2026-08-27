import type { TransactionClient } from "@platform/core/db";
import { MASTERDATA_WORKBOOK_VERSION, MASTERDATA_WORKBOOK_SHEETS, type WorkbookData, type WorkbookRow, type WorkbookStore } from "../application/import-export";

const iso = (value: Date) => value.toISOString();
const json = (value: unknown) => value === null || value === undefined ? null : JSON.stringify(value);
const decimal = (value: { toFixed(): string } | null) => value?.toFixed() ?? null;

export const prismaWorkbookStore: WorkbookStore = {
  async exportAll(tx: TransactionClient, exportedAt: Date): Promise<WorkbookData> {
    const [units, businessTypes, parties, brands, categories, skus, skuPrices, workPrices] = await Promise.all([
      tx.unit.findMany({ where: { deleted_at: null }, orderBy: [{ sort_order: "asc" }, { id: "asc" }] }),
      tx.businessType.findMany({ where: { deleted_at: null }, orderBy: [{ sort_order: "asc" }, { id: "asc" }] }),
      tx.party.findMany({ where: { deleted_at: null }, include: { roles: true, business_types: true, contacts: true, links: true }, orderBy: { id: "asc" } }),
      tx.brand.findMany({ where: { deleted_at: null }, include: { links: true, suppliers: true, categories: true }, orderBy: { id: "asc" } }),
      tx.category.findMany({ where: { deleted_at: null }, orderBy: [{ kind: "asc" }, { sort_order: "asc" }, { id: "asc" }] }),
      tx.sku.findMany({ where: { deleted_at: null }, include: { media: true }, orderBy: { id: "asc" } }),
      tx.skuPrice.findMany({ orderBy: { id: "asc" } }),
      tx.workPrice.findMany({ where: { deleted_at: null }, orderBy: { id: "asc" } }),
    ]);
    const sheets = Object.fromEntries(MASTERDATA_WORKBOOK_SHEETS.map((sheet) => [sheet, [] as WorkbookRow[]])) as Record<typeof MASTERDATA_WORKBOOK_SHEETS[number], WorkbookRow[]>;
    sheets.Unit = units.map((x) => ({ id: x.id, code: x.code, label: x.label, symbol: x.symbol, aliases: json(x.aliases), usages: json(x.usages), sort_order: x.sort_order, updated_at: iso(x.updated_at) }));
    sheets.BusinessType = businessTypes.map((x) => ({ id: x.id, code: x.code, label: x.label, description: x.description, sort_order: x.sort_order, updated_at: iso(x.updated_at) }));
    sheets.Party = parties.map((x) => ({ id: x.id, name: x.name, slug: x.slug, type: x.type, legal_name: x.legal_name, address: x.address, notes: x.notes, updated_at: iso(x.updated_at) }));
    sheets.PartyRole = parties.flatMap((p) => p.roles.map((x) => ({ party_id: p.id, role: x.role, updated_at: iso(p.updated_at) })));
    sheets.PartyBusinessType = parties.flatMap((p) => p.business_types.map((x) => ({ party_id: p.id, business_type_id: x.business_type_id, updated_at: iso(p.updated_at) })));
    sheets.PartyContact = parties.flatMap((p) => p.contacts.map((x) => ({ id: x.id, party_id: p.id, person_name: x.person_name, job_title: x.job_title, phone: x.phone, email: x.email, is_primary: x.is_primary, notes: x.notes, brand_id: x.brand_id, updated_at: iso(p.updated_at) })));
    sheets.PartyLink = parties.flatMap((p) => p.links.map((x) => ({ id: x.id, party_id: p.id, kind: x.kind, url: x.url, archive_url: x.archive_url, label: x.label, sort_order: x.sort_order, updated_at: iso(p.updated_at) })));
    sheets.Brand = brands.map((x) => ({ id: x.id, name: x.name, slug: x.slug, owner_party_id: x.owner_party_id, notes: x.notes, updated_at: iso(x.updated_at) }));
    sheets.BrandLink = brands.flatMap((b) => b.links.map((x) => ({ id: x.id, brand_id: b.id, kind: x.kind, url: x.url, archive_url: x.archive_url, label: x.label, sort_order: x.sort_order, updated_at: iso(b.updated_at) })));
    sheets.BrandSupplier = brands.flatMap((b) => b.suppliers.map((x) => ({ id: x.id, brand_id: b.id, party_id: x.party_id, is_authorized: x.is_authorized, notes: x.notes, updated_at: iso(b.updated_at) })));
    sheets.Category = categories.map((x) => ({ id: x.id, kind: x.kind, name: x.name, slug: x.slug, parent_id: x.parent_id, path: x.path, search_synonyms: json(x.search_synonyms), sort_order: x.sort_order, description: x.description, updated_at: iso(x.updated_at) }));
    sheets.BrandCategory = brands.flatMap((b) => b.categories.map((x) => ({ id: x.id, brand_id: b.id, category_id: x.category_id, sort_order: x.sort_order, updated_at: iso(b.updated_at) })));
    sheets.Sku = skus.map((x) => ({ id: x.id, code: x.code, name: x.name, slug: x.slug, brand_id: x.brand_id, category_id: x.category_id, kind: x.kind, status: x.status, spec: json(x.spec), dim_length: decimal(x.dim_length), dim_width: decimal(x.dim_width), dim_height: decimal(x.dim_height), dim_unit_id: x.dim_unit_id, dim_display: x.dim_display, base_unit_id: x.base_unit_id, purchase_unit_id: x.purchase_unit_id, conversion: decimal(x.conversion), default_waste_pct: decimal(x.default_waste_pct), minimum_order: decimal(x.minimum_order), rounding_increment: decimal(x.rounding_increment), notes: x.notes, updated_at: iso(x.updated_at) }));
    sheets.SkuMedia = skus.flatMap((s) => s.media.map((x) => ({ id: x.id, sku_id: s.id, kind: x.kind, url: x.url, label: x.label, sort_order: x.sort_order, updated_at: iso(s.updated_at) })));
    sheets.SkuPrice = skuPrices.map((x) => ({ id: x.id, sku_id: x.sku_id, supplier_party_id: x.supplier_party_id, amount: decimal(x.amount), currency: x.currency, unit_id: x.unit_id, source_link_id: x.source_link_id, notes: x.notes, updated_by_user_id: x.updated_by_user_id, updated_by_label: x.updated_by_label, updated_at: iso(x.updated_at) }));
    sheets.WorkPrice = workPrices.map((x) => ({ id: x.id, code: x.code, name: x.name, category_id: x.category_id, vendor_party_id: x.vendor_party_id, spec: json(x.spec), dim_display: x.dim_display, unit_id: x.unit_id, amount: decimal(x.amount), kind: x.kind, currency: x.currency, scope_note: x.scope_note, notes: x.notes, updated_by_user_id: x.updated_by_user_id, updated_by_label: x.updated_by_label, updated_at: iso(x.updated_at) }));
    return { manifest: { formatVersion: MASTERDATA_WORKBOOK_VERSION, exportedAt: iso(exportedAt), scope: "all-live-master-data" }, sheets };
  },

  async currentVersions(tx: TransactionClient, data: WorkbookData) {
    const wanted = (sheet: keyof WorkbookData["sheets"]) => data.sheets[sheet].map((row) => row.id).filter((id): id is string => typeof id === "string" && id.length > 0);
    const [units, businessTypes, parties, brands, categories, skus, prices, workPrices] = await Promise.all([
      tx.unit.findMany({ where: { id: { in: wanted("Unit") } }, select: { id: true, updated_at: true } }),
      tx.businessType.findMany({ where: { id: { in: wanted("BusinessType") } }, select: { id: true, updated_at: true } }),
      tx.party.findMany({ where: { id: { in: wanted("Party") } }, select: { id: true, updated_at: true } }),
      tx.brand.findMany({ where: { id: { in: wanted("Brand") } }, select: { id: true, updated_at: true } }),
      tx.category.findMany({ where: { id: { in: wanted("Category") } }, select: { id: true, updated_at: true } }),
      tx.sku.findMany({ where: { id: { in: wanted("Sku") } }, select: { id: true, updated_at: true } }),
      tx.skuPrice.findMany({ where: { id: { in: wanted("SkuPrice") } }, select: { id: true, updated_at: true } }),
      tx.workPrice.findMany({ where: { id: { in: wanted("WorkPrice") } }, select: { id: true, updated_at: true } }),
    ]);
    const out: Record<string, string | null> = {};
    for (const [sheet, rows] of [["Unit", units], ["BusinessType", businessTypes], ["Party", parties], ["Brand", brands], ["Category", categories], ["Sku", skus], ["SkuPrice", prices], ["WorkPrice", workPrices]] as const) for (const row of rows) out[`${sheet}:${row.id}`] = iso(row.updated_at);
    return out;
  },
};
