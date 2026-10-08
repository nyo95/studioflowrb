import { randomUUID } from "node:crypto";

import { type PrismaClient } from "@/generated/prisma/client";
import { type AuditActor } from "@platform/core/audit";
import { AppError } from "@platform/core/errors";
import { requirePermission, type PermissionGrants } from "@platform/core/rbac";

import { MASTERDATA_PERMISSIONS, type MasterDataServicePorts, type TxClient, actorIsUsable, requireAnyPermission, mapWriteError, requiredName, requiredTitleName, requiredSlug, normalizeHashtags, assertVendorMaterialCapable, assertLiveProductCategories, latestAuditActorLabels, createDeletionRequest, writeAudit, archiveBrandCascade, removeDirectCause, removeParentCausesAndFindRestored, assertSkuRestorable, assertPriceMaterialRestorable } from "./shared";

import { type ContactInput, contactColumns, sameContactColumns } from "./vendor-contact";

/** A Brand-scoped contact belongs to one of the Brand's suppliers (or its owner). */
export type BrandContactInput = ContactInput & { vendorId: string };

export function createBrandService(db: PrismaClient, ports: MasterDataServicePorts) {
  const { runTransaction } = ports;

  /**
   * Makes the Brand's own scoped contacts exactly `contacts` (create / update / delete). Each contact must belong to the
   * Brand's owner or one of its suppliers. Returns a count delta when anything changed, otherwise null.
   */
  async function syncBrandContacts(tx: TxClient, brandId: string, contacts: BrandContactInput[], related: { ownerVendorId: string | null; supplierIds: string[] }) {
    const allowed = new Set([...(related.ownerVendorId ? [related.ownerVendorId] : []), ...related.supplierIds]);
    const existing = await tx.vendorContact.findMany({ where: { brand_id: brandId } });
    const existingById = new Map(existing.map((c) => [c.id, c] as const));
    const kept = new Set(contacts.map((c) => c.id).filter((id): id is string => Boolean(id && existingById.has(id))));
    let changed = false;
    const removed = existing.filter((c) => !kept.has(c.id));
    if (removed.length > 0) { await tx.vendorContact.deleteMany({ where: { id: { in: removed.map((c) => c.id) } } }); changed = true; }
    for (const c of contacts) {
      if (!allowed.has(c.vendorId)) throw new AppError("VALIDATION", "CONTACT_VENDOR_NOT_BRAND_SUPPLIER", "Choose one of this Brand's suppliers for each contact.");
      const vendor = await tx.vendor.findUniqueOrThrow({ where: { id: c.vendorId }, select: { deleted_at: true } });
      if (vendor.deleted_at !== null) throw new AppError("VALIDATION", "CONTACT_VENDOR_ARCHIVED", "That supplier is archived.");
      const columns = { ...contactColumns({ ...c, brandId }), };
      const current = c.id ? existingById.get(c.id) : undefined;
      if (current) {
        if (current.vendor_id !== c.vendorId || !sameContactColumns(current, columns)) { await tx.vendorContact.update({ where: { id: current.id }, data: { vendor_id: c.vendorId, ...columns } }); changed = true; }
      } else { await tx.vendorContact.create({ data: { id: randomUUID(), vendor_id: c.vendorId, ...columns } }); changed = true; }
    }
    return changed ? { from: existing.length, to: contacts.length } : null;
  }

  return {
    async listBrands(input: { grants: PermissionGrants; search?: string; categoryId?: string; hashtag?: string; ownerVendorId?: string; supplierVendorId?: string; includeArchived?: boolean }) {
      requireAnyPermission(input.grants, [MASTERDATA_PERMISSIONS.brandRead, MASTERDATA_PERMISSIONS.brandManage], "You do not have permission to view brands.");
      const search = input.search?.trim();
      const hashtag = input.hashtag?.trim().toLowerCase().replace(/^#+/, "");
      const rows = await db.brand.findMany({
        where: {
          ...(input.includeArchived ? {} : { deleted_at: null }),
          ...(input.ownerVendorId ? { owner_vendor_id: input.ownerVendorId } : {}),
          ...(input.supplierVendorId ? { suppliers: { some: { vendor_id: input.supplierVendorId } } } : {}),
          ...(input.categoryId ? { categories: { some: { category_id: input.categoryId } } } : {}),
          ...(hashtag ? { hashtags: { some: { normalized: hashtag } } } : {}),
          ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { slug: { contains: search, mode: "insensitive" } }, { hashtags: { some: { label: { contains: search, mode: "insensitive" } } } }, { categories: { some: { category: { name: { contains: search, mode: "insensitive" } } } } }] } : {}),
        },
        orderBy: { name: "asc" },
        select: {
          id: true, name: true, slug: true, notes: true, updated_at: true, deleted_at: true,
          owner_vendor: { select: { id: true, name: true } },
          categories: { select: { category: { select: { id: true, name: true, slug: true } }, origins: { select: { kind: true } } } },
          hashtags: { select: { id: true, label: true, normalized: true } },
          links: { select: { id: true, kind: true, url: true, label: true } },
          suppliers: { select: { id: true, vendor: { select: { id: true, name: true } } } },
          contacts: { select: { id: true, vendor_id: true, person_name: true, job_title: true, email: true, phone: true, extra_phones: true, is_primary: true, notes: true }, orderBy: [{ is_primary: "desc" }, { person_name: "asc" }] },
          _count: { select: { skus: true, suppliers: true, links: true, categories: true } },
        },
      });
      const actorLabels = await latestAuditActorLabels(db, "brand", rows.map((row) => row.id));
      return rows.map((row) => ({ ...row, updated_by_label: actorLabels.get(row.id) ?? null }));
    },

    async listBrandsForVendorAssignment(input: { grants: PermissionGrants }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.vendorManage);
      return db.brand.findMany({ where: { deleted_at: null }, orderBy: { name: "asc" }, select: { id: true, name: true } });
    },

    async listBrandDirectoryRefs(input: { grants: PermissionGrants }) {
      requireAnyPermission(input.grants, [MASTERDATA_PERMISSIONS.brandRead, MASTERDATA_PERMISSIONS.brandManage], "You do not have permission to view brand references.");
      const [productCategories, ownerVendors, materialVendors, vendorTypes] = await Promise.all([
        db.category.findMany({ where: { status: "ACTIVE", kind: "PRODUCT" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
        db.vendor.findMany({ where: { deleted_at: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
        db.vendor.findMany({ where: { deleted_at: null, types: { some: { vendor_type: { can_supply_material: true, deleted_at: null } } } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
        db.vendorType.findMany({ where: { deleted_at: null, can_supply_material: true }, orderBy: { sort_order: "asc" }, select: { id: true, name: true } }),
      ]);
      return { productCategories, ownerVendors, materialVendors, vendorTypes };
    },

    async getBrand(input: { grants: PermissionGrants; brandId: string }) {
      requireAnyPermission(input.grants, [MASTERDATA_PERMISSIONS.brandRead, MASTERDATA_PERMISSIONS.brandManage], "You do not have permission to view brands.");
      return db.brand.findUniqueOrThrow({
        where: { id: input.brandId },
        include: {
          owner_vendor: { select: { id: true, name: true, slug: true } },
          categories: { include: { category: { select: { id: true, name: true, slug: true, kind: true, status: true } }, origins: true } },
          hashtags: true, links: true,
          suppliers: { include: { vendor: { select: { id: true, name: true, slug: true, deleted_at: true, types: { select: { vendor_type: { select: { code: true, name: true } } } } } } } },
          contacts: { include: { vendor: { select: { id: true, name: true } } } },
          _count: { select: { skus: true } },
        },
      });
    },

    async createBrand(input: { grants: PermissionGrants; actor: AuditActor; name: string; ownerVendorId?: string; notes?: string; categoryIds?: string[]; hashtags?: string[]; links?: Array<{ kind: string; url: string; label?: string }>; suppliers?: Array<{ vendorId: string; isAuthorized?: boolean; notes?: string | null }>; contacts?: BrandContactInput[] }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.brandManage);
      actorIsUsable(input.actor);
      const name = requiredTitleName(input.name, "BRAND_NAME_REQUIRED");
      const slug = requiredSlug(name);
      const categoryIds = [...new Set(input.categoryIds ?? [])];
      const hashtags = normalizeHashtags(input.hashtags ?? []);
      const links = [...new Map((input.links ?? []).map((link) => ({ ...link, url: link.url.trim() })).filter((link) => link.url.length > 0).map((link) => [link.url, link] as const)).values()];
      const suppliers = [...new Map((input.suppliers ?? []).map((supplier) => [supplier.vendorId, supplier] as const)).values()];
      return runTransaction(async (tx) => {
        if (input.ownerVendorId) { const owner = await tx.vendor.findUniqueOrThrow({ where: { id: input.ownerVendorId } }); if (owner.deleted_at !== null) throw new AppError("VALIDATION", "BRAND_OWNER_ARCHIVED", "Owner Supplier is archived."); }
        let brand;
        try { brand = await tx.brand.create({ data: { id: randomUUID(), name, slug, owner_vendor_id: input.ownerVendorId || null, notes: input.notes?.trim() || null } }); } catch (error) { mapWriteError(error); }
        const brandId = brand!.id;
        if (categoryIds.length > 0) {
          await assertLiveProductCategories(tx, categoryIds);
          for (const categoryId of categoryIds) {
            const bc = await tx.brandCategory.create({ data: { id: randomUUID(), brand_id: brandId, category_id: categoryId } });
            await tx.brandCategoryOrigin.create({ data: { id: randomUUID(), brand_category_id: bc.id, kind: "MANUAL", actor_user_id: input.actor.userId, actor_label: input.actor.label } });
          }
        }
        if (hashtags.length > 0) await tx.brandHashtag.createMany({ data: hashtags.map((tag) => ({ id: randomUUID(), brand_id: brandId, label: tag.label, normalized: tag.normalized })) });
        if (links.length > 0) await tx.brandLink.createMany({ data: links.map((link) => ({ id: randomUUID(), brand_id: brandId, kind: link.kind, url: link.url, label: link.label?.trim() || null })) });
        if (suppliers.length > 0) {
          for (const supplier of suppliers) { await assertVendorMaterialCapable(tx, supplier.vendorId); await tx.brandSupplier.create({ data: { id: randomUUID(), brand_id: brandId, vendor_id: supplier.vendorId, is_authorized: supplier.isAuthorized ?? false, notes: supplier.notes?.trim() || null } }); }
        }
        if (input.contacts && input.contacts.length > 0) await syncBrandContacts(tx, brandId, input.contacts, { ownerVendorId: input.ownerVendorId ?? null, supplierIds: suppliers.map((supplier) => supplier.vendorId) });
        await writeAudit(ports, tx, { action: "brand.created", entityType: "brand", entityId: brandId, actor: input.actor, metadata: { slug, owner_vendor_id: input.ownerVendorId ?? null, contacts: input.contacts?.length ?? 0 } });
        return { brandId };
      });
    },

    async updateBrand(input: { grants: PermissionGrants; actor: AuditActor; brandId: string; name: string; ownerVendorId?: string | null; notes?: string | null; categoryIds?: string[]; hashtags?: string[]; links?: Array<{ kind: string; url: string; label?: string }>; suppliers?: Array<{ vendorId: string; isAuthorized?: boolean; notes?: string | null }>; infoLinks?: Array<{ kind: string; url: string; label?: string | null }>; linkReviewSnapshot?: unknown[]; contacts?: BrandContactInput[] }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.brandManage);
      actorIsUsable(input.actor);
      const name = requiredTitleName(input.name, "BRAND_NAME_REQUIRED");
      const slug = requiredSlug(name);
      return runTransaction(async (tx) => {
        const existing = await tx.brand.findUniqueOrThrow({ where: { id: input.brandId }, include: { categories: { include: { origins: true } }, hashtags: true, links: true, suppliers: true } });
        if (existing.deleted_at !== null) throw new AppError("CONFLICT", "BRAND_ARCHIVED", "Cannot update an archived brand.");
        const nextOwnerVendorId = input.ownerVendorId === undefined ? existing.owner_vendor_id : input.ownerVendorId || null;
        if (nextOwnerVendorId && nextOwnerVendorId !== existing.owner_vendor_id) { const owner = await tx.vendor.findUniqueOrThrow({ where: { id: nextOwnerVendorId } }); if (owner.deleted_at !== null) throw new AppError("VALIDATION", "BRAND_OWNER_ARCHIVED", "Owner Supplier is archived."); }
        if (existing.owner_vendor_id && nextOwnerVendorId !== existing.owner_vendor_id) {
          // A former owner priced the Brand without needing a supplier link; losing ownership must not strand those prices.
          const formerOwnerId = existing.owner_vendor_id;
          const stillSupplier = input.suppliers !== undefined ? input.suppliers.some((entry) => entry.vendorId === formerOwnerId) : existing.suppliers.some((entry) => entry.vendor_id === formerOwnerId);
          if (!stillSupplier) {
            const priceCount = await tx.priceMaterial.count({ where: { deleted_at: null, supplier_vendor_id: formerOwnerId, sku: { brand_id: input.brandId } } });
            if (priceCount > 0) { const supplier = await tx.vendor.findUniqueOrThrow({ where: { id: formerOwnerId }, select: { id: true, name: true } }); throw new AppError("CONFLICT", "BRAND_OWNER_IN_USE", `The current owner has ${priceCount} live material price(s) for this Brand. Keep it as a supplier of the Brand before changing the owner.`, { details: { brand: { id: input.brandId, name: existing.name }, supplier, livePriceCount: priceCount } }); }
          }
        }
        const changes: Record<string, { from: unknown; to: unknown }> = {};
        if (existing.name !== name) { changes.name = { from: existing.name, to: name }; changes.slug = { from: existing.slug, to: slug }; }
        if ((existing.owner_vendor_id || null) !== nextOwnerVendorId) changes.owner_vendor_id = { from: existing.owner_vendor_id, to: nextOwnerVendorId };
        if ((existing.notes || null) !== (input.notes?.trim() || null)) changes.notes = { from: existing.notes, to: input.notes?.trim() || null };
        if (Object.keys(changes).length > 0) { try { await tx.brand.update({ where: { id: input.brandId }, data: { name, slug, owner_vendor_id: nextOwnerVendorId, notes: input.notes?.trim() || null } }); } catch (error) { mapWriteError(error); } }
        if (input.categoryIds !== undefined) {
          await assertLiveProductCategories(tx, input.categoryIds);
          const requestedCategorySet = new Set(input.categoryIds);
          for (const categoryId of input.categoryIds) {
            const existingBc = existing.categories.find((bc) => bc.category_id === categoryId);
            if (!existingBc) { const createdBc = await tx.brandCategory.create({ data: { id: randomUUID(), brand_id: input.brandId, category_id: categoryId } }); await tx.brandCategoryOrigin.create({ data: { id: randomUUID(), brand_category_id: createdBc.id, kind: "MANUAL", actor_user_id: input.actor.userId, actor_label: input.actor.label } }); }
            else if (!existingBc.origins.some((o) => o.kind === "MANUAL")) { await tx.brandCategoryOrigin.create({ data: { id: randomUUID(), brand_category_id: existingBc.id, kind: "MANUAL", actor_user_id: input.actor.userId, actor_label: input.actor.label } }); }
          }
          for (const existingBc of existing.categories) { if (!requestedCategorySet.has(existingBc.category_id)) { await tx.brandCategoryOrigin.deleteMany({ where: { brand_category_id: existingBc.id, kind: "MANUAL" } }); const remainingOrigins = await tx.brandCategoryOrigin.count({ where: { brand_category_id: existingBc.id } }); if (remainingOrigins === 0) await tx.brandCategory.delete({ where: { id: existingBc.id } }); } }
          const before = existing.categories.filter((bc) => bc.origins.some((origin) => origin.kind === "MANUAL")).map((bc) => bc.category_id).sort();
          const after = [...requestedCategorySet].sort();
          if (before.join("\u0000") !== after.join("\u0000")) changes.categories = { from: before, to: after };
        }
        if (input.hashtags !== undefined) {
          const normalizedList = normalizeHashtags(input.hashtags);
          const desiredTags = new Map(normalizedList.map((tag) => [tag.normalized, tag] as const));
          const removedTags = existing.hashtags.filter((tag) => !desiredTags.has(tag.normalized));
          if (removedTags.length > 0) await tx.brandHashtag.deleteMany({ where: { id: { in: removedTags.map((tag) => tag.id) } } });
          for (const existingTag of existing.hashtags) { const wanted = desiredTags.get(existingTag.normalized); if (!wanted) continue; desiredTags.delete(existingTag.normalized); if (existingTag.label !== wanted.label) await tx.brandHashtag.update({ where: { id: existingTag.id }, data: { label: wanted.label } }); }
          if (desiredTags.size > 0) await tx.brandHashtag.createMany({ data: [...desiredTags.values()].map((tag) => ({ id: randomUUID(), brand_id: input.brandId, label: tag.label, normalized: tag.normalized })) });
          const before = existing.hashtags.map((tag) => tag.normalized).sort();
          const after = normalizedList.map((tag) => tag.normalized).sort();
          if (before.join("\u0000") !== after.join("\u0000")) changes.hashtags = { from: before, to: after };
        }
        if (input.links !== undefined) {
          const desired = new Map(input.links.map((link) => ({ ...link, url: link.url.trim() })).filter((link) => link.url.length > 0).map((link) => [link.url, link] as const));
          for (const existingLink of existing.links) { const wanted = desired.get(existingLink.url); if (!wanted) { await tx.brandLink.delete({ where: { id: existingLink.id } }); continue; } desired.delete(existingLink.url); const nextLabel = wanted.label?.trim() || null; if (existingLink.kind !== wanted.kind || existingLink.label !== nextLabel) await tx.brandLink.update({ where: { id: existingLink.id }, data: { kind: wanted.kind, label: nextLabel } }); }
          if (desired.size > 0) await tx.brandLink.createMany({ data: [...desired.values()].map((link) => ({ id: randomUUID(), brand_id: input.brandId, kind: link.kind, url: link.url, label: link.label?.trim() || null })) });
          const before = existing.links.map((link) => link.url).sort();
          const after = input.links.map((link) => link.url.trim()).filter(Boolean).sort();
          if (before.join("\u0000") !== after.join("\u0000")) changes.links = { from: before, to: after };
        }
        if (input.suppliers !== undefined) {
          const desiredSuppliers = new Map(input.suppliers.map((s) => [s.vendorId, s] as const));
          const removedSuppliers = existing.suppliers.filter((s) => !desiredSuppliers.has(s.vendor_id));
          for (const removed of removedSuppliers) {
            if (existing.owner_vendor_id === removed.vendor_id) continue;
            const priceCount = await tx.priceMaterial.count({ where: { deleted_at: null, supplier_vendor_id: removed.vendor_id, sku: { brand_id: input.brandId } } });
            if (priceCount > 0) { const supplier = await tx.vendor.findUniqueOrThrow({ where: { id: removed.vendor_id }, select: { id: true, name: true } }); throw new AppError("CONFLICT", "BRAND_SUPPLIER_IN_USE", `Supplier link cannot be removed while ${priceCount} live material price(s) use this Brand.`, { details: { brand: { id: input.brandId, name: existing.name }, supplier, livePriceCount: priceCount } }); }
          }
          if (removedSuppliers.length > 0) await tx.brandSupplier.deleteMany({ where: { id: { in: removedSuppliers.map((s) => s.id) } } });
          for (const existingSupplier of existing.suppliers) { const wanted = desiredSuppliers.get(existingSupplier.vendor_id); if (!wanted) continue; desiredSuppliers.delete(existingSupplier.vendor_id); const isAuthorized = wanted.isAuthorized ?? false; const supplierNotes = wanted.notes?.trim() || null; if (existingSupplier.is_authorized !== isAuthorized || existingSupplier.notes !== supplierNotes) await tx.brandSupplier.update({ where: { id: existingSupplier.id }, data: { is_authorized: isAuthorized, notes: supplierNotes } }); }
          for (const s of desiredSuppliers.values()) { await assertVendorMaterialCapable(tx, s.vendorId); await tx.brandSupplier.create({ data: { id: randomUUID(), brand_id: input.brandId, vendor_id: s.vendorId, is_authorized: s.isAuthorized ?? false, notes: s.notes?.trim() || null } }); }
          const before = existing.suppliers.map((s) => s.vendor_id).sort();
          const after = input.suppliers.map((s) => s.vendorId).sort();
          if (before.join("\u0000") !== after.join("\u0000")) changes.suppliers = { from: before, to: after };
        }
        if (input.contacts !== undefined) {
          const relatedNow = await tx.brand.findUniqueOrThrow({ where: { id: input.brandId }, select: { owner_vendor_id: true, suppliers: { select: { vendor_id: true } } } });
          const contactChange = await syncBrandContacts(tx, input.brandId, input.contacts, { ownerVendorId: relatedNow.owner_vendor_id, supplierIds: relatedNow.suppliers.map((s) => s.vendor_id) });
          if (contactChange) changes.contacts = contactChange;
        }
        if (Object.keys(changes).length > 0) await writeAudit(ports, tx, { action: "brand.updated", entityType: "brand", entityId: input.brandId, actor: input.actor, changes });
        return { brandId: input.brandId };
      });
    },

    async linkBrandToSupplier(input: { grants: PermissionGrants; actor: AuditActor; brandId: string; vendorId: string }) {
      requireAnyPermission(input.grants, [MASTERDATA_PERMISSIONS.brandManage, MASTERDATA_PERMISSIONS.vendorManage], "You do not have permission to link a Brand to a Supplier.");
      actorIsUsable(input.actor);
      return runTransaction(async (tx) => {
        const brand = await tx.brand.findUniqueOrThrow({ where: { id: input.brandId } });
        if (brand.deleted_at) throw new AppError("CONFLICT", "BRAND_ARCHIVED", "Cannot link an archived Brand.");
        await assertVendorMaterialCapable(tx, input.vendorId);
        const existing = await tx.brandSupplier.findFirst({ where: { brand_id: input.brandId, vendor_id: input.vendorId } });
        if (!existing) {
          await tx.brandSupplier.create({ data: { id: randomUUID(), brand_id: input.brandId, vendor_id: input.vendorId, is_authorized: false, notes: null } });
          await writeAudit(ports, tx, { action: "brand.supplier-linked", entityType: "brand", entityId: input.brandId, actor: input.actor, metadata: { vendor_id: input.vendorId } });
        }
        return { brandId: input.brandId, vendorId: input.vendorId };
      });
    },

    async archiveBrand(input: { grants: PermissionGrants; actor: AuditActor; brandId: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.brandManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx) => {
        const brand = await tx.brand.findUniqueOrThrow({ where: { id: input.brandId } });
        if (brand.deleted_at !== null) throw new AppError("CONFLICT", "BRAND_ALREADY_ARCHIVED", "Brand is already archived.");
        const now = new Date();
        const cascade = await archiveBrandCascade(tx, { brandId: input.brandId, now, cause: { kind: "DIRECT" } });
        await writeAudit(ports, tx, { action: "brand.archived", entityType: "brand", entityId: input.brandId, actor: input.actor, metadata: { skus_archived: cascade.skuIds.length } });
        return { brandId: input.brandId };
      });
    },

    async restoreBrand(input: { grants: PermissionGrants; actor: AuditActor; brandId: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.brandManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx) => {
        const brand = await tx.brand.findUniqueOrThrow({ where: { id: input.brandId } });
        if (brand.deleted_at === null) throw new AppError("CONFLICT", "BRAND_NOT_ARCHIVED", "Brand is not archived.");
        const [identityConflict, ownerVendor, supplierRelations, categoryRelations] = await Promise.all([
          tx.brand.findFirst({ where: { id: { not: input.brandId }, deleted_at: null, OR: [{ slug: brand.slug }, { name: { equals: brand.name, mode: "insensitive" } }] }, select: { id: true } }),
          brand.owner_vendor_id ? tx.vendor.findUniqueOrThrow({ where: { id: brand.owner_vendor_id } }) : null,
          tx.brandSupplier.findMany({ where: { brand_id: input.brandId }, select: { vendor_id: true } }),
          tx.brandCategory.findMany({ where: { brand_id: input.brandId }, include: { category: true } }),
        ]);
        if (identityConflict) throw new AppError("CONFLICT", "BRAND_IDENTITY_CONFLICT", "A live Brand already uses this identity.");
        if (ownerVendor?.deleted_at) throw new AppError("CONFLICT", "BRAND_OWNER_ARCHIVED", "Brand owner Supplier is archived.");
        if (categoryRelations.some((row) => row.category.status !== "ACTIVE" || row.category.kind !== "PRODUCT")) throw new AppError("CONFLICT", "BRAND_CATEGORY_INACTIVE", "Brand has an invalid or inactive Category relation.");
        for (const relation of supplierRelations) await assertVendorMaterialCapable(tx, relation.vendor_id);
        await removeDirectCause(tx, "brand", input.brandId);
        await tx.brand.update({ where: { id: input.brandId }, data: { deleted_at: null } });
        const restoredSkuIds = await removeParentCausesAndFindRestored(tx, "sku", "brand", input.brandId);
        let priceCount = 0;
        if (restoredSkuIds.length > 0) {
          for (const skuId of restoredSkuIds) await assertSkuRestorable(tx, skuId);
          await tx.sku.updateMany({ where: { id: { in: restoredSkuIds } }, data: { deleted_at: null } });
        }
        for (const skuId of restoredSkuIds) {
          const restoredPriceIds = await removeParentCausesAndFindRestored(tx, "price_material", "sku", skuId);
          if (restoredPriceIds.length > 0) { for (const priceId of restoredPriceIds) await assertPriceMaterialRestorable(tx, priceId); await tx.priceMaterial.updateMany({ where: { id: { in: restoredPriceIds } }, data: { deleted_at: null } }); priceCount += restoredPriceIds.length; }
        }
        await writeAudit(ports, tx, { action: "brand.restored", entityType: "brand", entityId: input.brandId, actor: input.actor, metadata: { skus_restored: restoredSkuIds.length, prices_restored: priceCount } });
        return { brandId: input.brandId };
      });
    },

    async requestBrandDeletion(input: { grants: PermissionGrants; actor: AuditActor; brandId: string; reason?: string; notes?: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.brandManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx) => {
        const brand = await tx.brand.findUniqueOrThrow({ where: { id: input.brandId } });
        if (brand.deleted_at === null) throw new AppError("VALIDATION", "BRAND_NOT_ARCHIVED", "Only archived brands may be submitted for deletion.");
        const requestId = await createDeletionRequest(tx, { targetType: "brand", targetId: input.brandId, actor: input.actor, reason: input.reason, notes: input.notes });
        await writeAudit(ports, tx, { action: "brand.deletion-requested", entityType: "brand", entityId: input.brandId, actor: input.actor });
        return { requestId };
      });
    },
  };
}
