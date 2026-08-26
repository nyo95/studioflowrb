import { diffAuditChanges, prepareAuditEvent } from "@platform/core/audit";
import type { TransactionClient } from "@platform/core/db";
import { AppError } from "@platform/core/errors";
import { requirePermission } from "@platform/core/rbac";
import { normalizeText } from "@platform/utilities/normalization";
import { toSlug } from "@platform/utilities/slug";
import { assertBrandCanBeDeleted, assertBrandCategories, assertBrandSuppliers } from "../domain/brand-rules";
import type { MasterDataExecutionContext, MasterDataUseCasePorts } from "./execution-context";
import { MASTERDATA_BRAND_MANAGE, MASTERDATA_BRAND_READ } from "./masterdata-permissions";
import { PARTY_LINK_KINDS, type PartyLinkKind } from "./party-repository";
import type { BrandGraphInput, BrandRecord, BrandRepository } from "./brand-repository";

export type BrandWriteInput = {
  name: string; ownerPartyId?: string | null; notes?: string | null;
  categories: readonly { id?: string; categoryId: string; sortOrder?: number }[];
  suppliers?: readonly { id?: string; partyId: string; isAuthorized?: boolean; notes?: string | null }[];
  links?: readonly { id?: string; kind: PartyLinkKind; url: string; archiveUrl?: string | null; label?: string | null; sortOrder?: number }[];
};
export type BrandUpdateInput = Partial<BrandWriteInput> & { id: string };
const optionalText = (value: string | null | undefined) => value == null ? null : normalizeText(value) || null;
function normalizedUrl(value: string): string { try { const url = new URL(normalizeText(value)); if (!['http:', 'https:'].includes(url.protocol)) throw new Error(); return url.toString(); } catch { throw new AppError("VALIDATION", "BRAND_LINK_URL_INVALID", "Brand links must use a valid HTTP or HTTPS URL."); } }
function auditShape(row: BrandRecord): Record<string, unknown> { return { name: row.name, slug: row.slug, ownerPartyId: row.ownerPartyId, notes: row.notes, categoryIds: row.categories.map(x => x.categoryId), supplierPartyIds: row.suppliers.map(x => x.partyId), linkIds: row.links.map(x => x.id) }; }

export class BrandService {
  constructor(private readonly ports: MasterDataUseCasePorts & { brands: BrandRepository }) {}
  list(context: MasterDataExecutionContext, filter: Parameters<BrandRepository["list"]>[1] = {}) { requirePermission(context.grants, MASTERDATA_BRAND_READ); return this.ports.runTransaction(tx => this.ports.brands.list(tx, filter)); }
  create(context: MasterDataExecutionContext, input: BrandWriteInput) { requirePermission(context.grants, MASTERDATA_BRAND_MANAGE); return this.ports.runTransaction(tx => this.write(context, tx, null, input)); }
  update(context: MasterDataExecutionContext, input: BrandUpdateInput) {
    requirePermission(context.grants, MASTERDATA_BRAND_MANAGE);
    return this.ports.runTransaction(async tx => {
      const current = await this.ports.brands.findById(tx, input.id);
      if (!current || current.deletedAt) throw new AppError("NOT_FOUND", "BRAND_NOT_FOUND", "This Brand no longer exists.");
      return this.write(context, tx, current, {
        name: input.name ?? current.name, ownerPartyId: input.ownerPartyId === undefined ? current.ownerPartyId : input.ownerPartyId,
        notes: input.notes === undefined ? current.notes : input.notes,
        categories: input.categories ?? current.categories, suppliers: input.suppliers ?? current.suppliers, links: input.links ?? current.links,
      });
    });
  }
  private async write(context: MasterDataExecutionContext, tx: TransactionClient, current: BrandRecord | null, input: BrandWriteInput): Promise<BrandRecord> {
    const name = normalizeText(input.name); if (!name) throw new AppError("VALIDATION", "BRAND_NAME_REQUIRED", "Brand name is required.");
    const slug = toSlug(name); if (!slug) throw new AppError("VALIDATION", "BRAND_NAME_NOT_SLUGGABLE", "Brand name must contain letters or digits.");
    const conflict = await this.ports.brands.findLiveIdentityConflict(tx, name, slug); if (conflict && conflict.id !== current?.id) throw new AppError("CONFLICT", "BRAND_IDENTITY_TAKEN", "A live Brand already uses this name or slug.");
    const categoryIds = [...new Set(input.categories.map(x => normalizeText(x.categoryId)).filter(Boolean))];
    const candidates = await this.ports.brands.loadCategoryCandidates(tx, categoryIds); if (candidates.length !== categoryIds.length) throw new AppError("VALIDATION", "BRAND_CATEGORY_INVALID", "Every Brand Category must exist."); assertBrandCategories(candidates);
    const supplierIds = [...new Set((input.suppliers ?? []).map(x => normalizeText(x.partyId)).filter(Boolean))];
    const suppliers = await this.ports.brands.loadSupplierCandidates(tx, supplierIds); if (suppliers.length !== supplierIds.length) throw new AppError("VALIDATION", "BRAND_SUPPLIER_INVALID", "Every Brand supplier must exist."); assertBrandSuppliers(suppliers);
    const ownerPartyId = input.ownerPartyId ?? null; if (ownerPartyId && !(await this.ports.brands.isLiveOwnerCandidate(tx, ownerPartyId))) throw new AppError("VALIDATION", "BRAND_OWNER_INVALID", "Brand owner must be a live Party.");
    const seenUrls = new Set<string>();
    const graph: BrandGraphInput = {
      id: current?.id ?? this.ports.generateId(), name, slug, ownerPartyId, notes: optionalText(input.notes),
      categories: input.categories.filter((x, i, all) => all.findIndex(y => y.categoryId === x.categoryId) === i).map((x, i) => ({ id: x.id ?? this.ports.generateId(), categoryId: x.categoryId, sortOrder: x.sortOrder ?? i })),
      suppliers: (input.suppliers ?? []).filter((x, i, all) => all.findIndex(y => y.partyId === x.partyId) === i).map(x => ({ id: x.id ?? this.ports.generateId(), partyId: x.partyId, isAuthorized: x.isAuthorized ?? false, notes: optionalText(x.notes) })),
      links: (input.links ?? []).map((x, i) => { if (!PARTY_LINK_KINDS.includes(x.kind)) throw new AppError("VALIDATION", "BRAND_LINK_KIND_INVALID", "Brand link kind is invalid."); const url = normalizedUrl(x.url); if (seenUrls.has(url)) throw new AppError("CONFLICT", "BRAND_LINK_DUPLICATE", "Brand links must use unique URLs."); seenUrls.add(url); return { id: x.id ?? this.ports.generateId(), kind: x.kind, url, archiveUrl: x.archiveUrl ? normalizedUrl(x.archiveUrl) : null, label: optionalText(x.label), sortOrder: x.sortOrder ?? i }; }),
    };
    const next = auditShape({ ...graph, createdAt: current?.createdAt ?? this.ports.now(), updatedAt: this.ports.now(), deletedAt: null }); const changes = diffAuditChanges(current ? auditShape(current) : {}, next); if (current && !Object.keys(changes).length) return current;
    const saved = current ? await this.ports.brands.update(tx, current.id, graph) : await this.ports.brands.create(tx, graph);
    await this.ports.auditWriter.write(prepareAuditEvent({ appId: "masterdata", action: current ? "brand.updated" : "brand.created", entityType: "brand", entityId: saved.id, actor: context.actor, occurredAt: this.ports.now(), changes }), tx); return saved;
  }
  softDelete(context: MasterDataExecutionContext, id: string) { requirePermission(context.grants, MASTERDATA_BRAND_MANAGE); return this.ports.runTransaction(async tx => { const current = await this.ports.brands.findById(tx, id); if (!current || current.deletedAt) throw new AppError("NOT_FOUND", "BRAND_NOT_FOUND", "This Brand no longer exists."); assertBrandCanBeDeleted(await this.ports.brands.countDeleteReferences(tx, id)); const at = this.ports.now(); const saved = await this.ports.brands.setDeletedAt(tx, id, at); await this.ports.auditWriter.write(prepareAuditEvent({ appId: "masterdata", action: "brand.deleted", entityType: "brand", entityId: id, actor: context.actor, occurredAt: at, changes: { deletedAt: { from: null, to: at } } }), tx); return saved; }); }
  restore(context: MasterDataExecutionContext, id: string) { requirePermission(context.grants, MASTERDATA_BRAND_MANAGE); return this.ports.runTransaction(async tx => { const current = await this.ports.brands.findById(tx, id); if (!current) throw new AppError("NOT_FOUND", "BRAND_NOT_FOUND", "This Brand no longer exists."); if (!current.deletedAt) throw new AppError("CONFLICT", "BRAND_NOT_DELETED", "Only a deleted Brand can be restored."); const conflict = await this.ports.brands.findLiveIdentityConflict(tx, current.name, current.slug); if (conflict && conflict.id !== id) throw new AppError("CONFLICT", "BRAND_IDENTITY_TAKEN", "The Brand identity is already used."); assertBrandCategories(await this.ports.brands.loadCategoryCandidates(tx, current.categories.map(x => x.categoryId))); assertBrandSuppliers(await this.ports.brands.loadSupplierCandidates(tx, current.suppliers.map(x => x.partyId))); if (current.ownerPartyId && !(await this.ports.brands.isLiveOwnerCandidate(tx, current.ownerPartyId))) throw new AppError("CONFLICT", "BRAND_OWNER_INVALID", "The Brand owner is no longer live."); const saved = await this.ports.brands.setDeletedAt(tx, id, null); await this.ports.auditWriter.write(prepareAuditEvent({ appId: "masterdata", action: "brand.restored", entityType: "brand", entityId: id, actor: context.actor, occurredAt: this.ports.now(), changes: { deletedAt: { from: current.deletedAt, to: null } } }), tx); return saved; }); }
}
