import { randomUUID } from "node:crypto";

import { type PrismaClient } from "@/generated/prisma/client";
import { type AuditActor } from "@platform/core/audit";
import { AppError } from "@platform/core/errors";
import { requirePermission, type PermissionGrants } from "@platform/core/rbac";

import { MASTERDATA_PERMISSIONS, type MasterDataServicePorts, actorIsUsable, requireAnyPermission, mapWriteError, requiredName, requiredSlug, normalizeHashtags, assertVendorMaterialCapable, assertLiveProductCategories, latestAuditActorLabels, createDeletionRequest, writeAudit, addDirectCause, addParentCauses, removeDirectCause, removeParentCausesAndFindRestored, assertSkuRestorable, assertPriceMaterialRestorable } from "./shared";

export function createBrandService(db: PrismaClient, ports: MasterDataServicePorts) {
  const { runTransaction } = ports;

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

    async createBrand(input: { grants: PermissionGrants; actor: AuditActor; name: string; ownerVendorId?: string; notes?: string; categoryIds?: string[]; hashtags?: string[]; links?: Array<{ kind: string; url: string; label?: string }>; suppliers?: Array<{ vendorId: string; isAuthorized?: boolean; notes?: string | null }> }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.brandManage);
      actorIsUsable(input.actor);
      const name = requiredName(input.name, "BRAND_NAME_REQUIRED");
      const slug = requiredSlug(name);
      return runTransaction(async (tx) => {
        if (input.ownerVendorId) { const owner = await tx.vendor.findUniqueOrThrow({ where: { id: input.ownerVendorId } }); if (owner.deleted_at !== null) throw new AppError("VALIDATION", "BRAND_OWNER_ARCHIVED", "Owner Supplier is archived."); }
        let brand;
        try { brand = await tx.brand.create({ data: { id: randomUUID(), name, slug, owner_vendor_id: input.ownerVendorId || null, notes: input.notes?.trim() || null } }); } catch (error) { mapWriteError(error); }
        const brandId = brand!.id;
        if (input.categoryIds && input.categoryIds.length > 0) {
          await assertLiveProductCategories(tx, input.categoryIds);
          for (const categoryId of input.categoryIds) {
            const bc = await tx.brandCategory.create({ data: { id: randomUUID(), brand_id: brandId, category_id: categoryId } });
            await tx.brandCategoryOrigin.create({ data: { id: randomUUID(), brand_category_id: bc.id, kind: "MANUAL", actor_user_id: input.actor.userId, actor_label: input.actor.label } });
          }
        }
        if (input.hashtags && input.hashtags.length > 0) { const normalizedTags = normalizeHashtags(input.hashtags); await tx.brandHashtag.createMany({ data: normalizedTags.map((tag) => ({ id: randomUUID(), brand_id: brandId, label: tag.label, normalized: tag.normalized })) }); }
        if (input.links && input.links.length > 0) { await tx.brandLink.createMany({ data: input.links.map((link) => ({ id: randomUUID(), brand_id: brandId, kind: link.kind, url: link.url.trim(), label: link.label?.trim() || null })) }); }
        if (input.suppliers && input.suppliers.length > 0) {
          for (const s of input.suppliers) { await assertVendorMaterialCapable(tx, s.vendorId); await tx.brandSupplier.create({ data: { id: randomUUID(), brand_id: brandId, vendor_id: s.vendorId, is_authorized: s.isAuthorized ?? false, notes: s.notes?.trim() || null } }); }
        }
        await writeAudit(ports, tx, { action: "brand.created", entityType: "brand", entityId: brandId, actor: input.actor, metadata: { slug, owner_vendor_id: input.ownerVendorId ?? null } });
        return { brandId };
      });
    },

    async updateBrand(input: { grants: PermissionGrants; actor: AuditActor; brandId: string; name: string; ownerVendorId?: string | null; notes?: string | null; categoryIds?: string[]; hashtags?: string[]; links?: Array<{ kind: string; url: string; label?: string }>; suppliers?: Array<{ vendorId: string; isAuthorized?: boolean; notes?: string | null }>; infoLinks?: Array<{ kind: string; url: string; label?: string | null }>; linkReviewSnapshot?: unknown[] }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.brandManage);
      actorIsUsable(input.actor);
      const name = requiredName(input.name, "BRAND_NAME_REQUIRED");
      const slug = requiredSlug(name);
      return runTransaction(async (tx) => {
        const existing = await tx.brand.findUniqueOrThrow({ where: { id: input.brandId }, include: { categories: { include: { origins: true } }, hashtags: true, links: true, suppliers: true } });
        if (input.ownerVendorId) { const owner = await tx.vendor.findUniqueOrThrow({ where: { id: input.ownerVendorId } }); if (owner.deleted_at !== null) throw new AppError("VALIDATION", "BRAND_OWNER_ARCHIVED", "Owner Supplier is archived."); }
        const changes: Record<string, { from: unknown; to: unknown }> = {};
        if (existing.name !== name) { changes.name = { from: existing.name, to: name }; changes.slug = { from: existing.slug, to: slug }; }
        if ((existing.owner_vendor_id || null) !== (input.ownerVendorId || null)) changes.owner_vendor_id = { from: existing.owner_vendor_id, to: input.ownerVendorId || null };
        if ((existing.notes || null) !== (input.notes?.trim() || null)) changes.notes = { from: existing.notes, to: input.notes?.trim() || null };
        if (Object.keys(changes).length > 0) { try { await tx.brand.update({ where: { id: input.brandId }, data: { name, slug, owner_vendor_id: input.ownerVendorId || null, notes: input.notes?.trim() || null } }); } catch (error) { mapWriteError(error); } }
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
          if (removedSuppliers.length > 0) await tx.brandSupplier.deleteMany({ where: { id: { in: removedSuppliers.map((s) => s.id) } } });
          for (const existingSupplier of existing.suppliers) { const wanted = desiredSuppliers.get(existingSupplier.vendor_id); if (!wanted) continue; desiredSuppliers.delete(existingSupplier.vendor_id); const isAuthorized = wanted.isAuthorized ?? false; const supplierNotes = wanted.notes?.trim() || null; if (existingSupplier.is_authorized !== isAuthorized || existingSupplier.notes !== supplierNotes) await tx.brandSupplier.update({ where: { id: existingSupplier.id }, data: { is_authorized: isAuthorized, notes: supplierNotes } }); }
          for (const s of desiredSuppliers.values()) { await assertVendorMaterialCapable(tx, s.vendorId); await tx.brandSupplier.create({ data: { id: randomUUID(), brand_id: input.brandId, vendor_id: s.vendorId, is_authorized: s.isAuthorized ?? false, notes: s.notes?.trim() || null } }); }
          const before = existing.suppliers.map((s) => s.vendor_id).sort();
          const after = input.suppliers.map((s) => s.vendorId).sort();
          if (before.join("\u0000") !== after.join("\u0000")) changes.suppliers = { from: before, to: after };
        }
        if (Object.keys(changes).length > 0) await writeAudit(ports, tx, { action: "brand.updated", entityType: "brand", entityId: input.brandId, actor: input.actor, changes });
        return { brandId: input.brandId };
      });
    },

    async archiveBrand(input: { grants: PermissionGrants; actor: AuditActor; brandId: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.brandManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx) => {
        const brand = await tx.brand.findUniqueOrThrow({ where: { id: input.brandId } });
        if (brand.deleted_at !== null) throw new AppError("CONFLICT", "BRAND_ALREADY_ARCHIVED", "Brand is already archived.");
        const now = new Date();
        await addDirectCause(tx, "brand", input.brandId);
        await tx.brand.update({ where: { id: input.brandId }, data: { deleted_at: now } });
        const skuIds = await tx.sku.findMany({ where: { brand_id: input.brandId }, select: { id: true } }).then((rows) => rows.map((row) => row.id));
        await addParentCauses(tx, "sku", "brand", input.brandId, skuIds);
        if (skuIds.length > 0) {
          await tx.sku.updateMany({ where: { id: { in: skuIds } }, data: { deleted_at: now } });
          const prices = await tx.priceMaterial.findMany({ where: { sku_id: { in: skuIds } }, select: { id: true, sku_id: true } });
          for (const skuId of skuIds) await addParentCauses(tx, "price_material", "sku", skuId, prices.filter((price) => price.sku_id === skuId).map((price) => price.id));
          if (prices.length > 0) await tx.priceMaterial.updateMany({ where: { id: { in: prices.map((price) => price.id) } }, data: { deleted_at: now } });
        }
        await writeAudit(ports, tx, { action: "brand.archived", entityType: "brand", entityId: input.brandId, actor: input.actor, metadata: { skus_archived: skuIds.length } });
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

