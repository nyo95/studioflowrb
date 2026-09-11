import { randomUUID } from "node:crypto";

import { type PrismaClient } from "@/generated/prisma/client";
import { type AuditActor } from "@platform/core/audit";
import { AppError } from "@platform/core/errors";
import { requirePermission, type PermissionGrants } from "@platform/core/rbac";

import { MASTERDATA_PERMISSIONS, type MasterDataServicePorts, type TxClient, actorIsUsable, requireAnyPermission, mapWriteError, requiredName, requiredSlug, assertVendorTypeRemovalSafe, assertVendorMaterialCapable, latestAuditActorLabels, createDeletionRequest, writeAudit, addDirectCause, addParentCauses, removeDirectCause, removeParentCausesAndFindRestored, assertPriceMaterialRestorable, assertWorkPriceRestorable } from "./shared";

export function createVendorService(db: PrismaClient, ports: MasterDataServicePorts) {
  const { runTransaction } = ports;
  return {
    async listVendors(input: { grants: PermissionGrants; search?: string; vendorTypeId?: string; supplierCategoryId?: string; canSupplyMaterial?: boolean; canSupplyLabor?: boolean; brandId?: string; includeArchived?: boolean }) {
      requireAnyPermission(input.grants, [MASTERDATA_PERMISSIONS.vendorRead, MASTERDATA_PERMISSIONS.vendorManage], "You do not have permission to view Suppliers.");
      const search = input.search?.trim();
      const rows = await db.vendor.findMany({
        where: {
          ...(input.includeArchived ? {} : { deleted_at: null }),
          ...(input.brandId ? { brand_suppliers: { some: { brand_id: input.brandId } } } : {}),
          ...(input.vendorTypeId ? { types: { some: { vendor_type_id: input.vendorTypeId } } } : {}),
          ...(input.supplierCategoryId ? { supplier_categories: { some: { supplier_category_id: input.supplierCategoryId } } } : {}),
          ...(input.canSupplyMaterial !== undefined ? { types: { some: { vendor_type: { can_supply_material: input.canSupplyMaterial, deleted_at: null } } } } : {}),
          ...(input.canSupplyLabor !== undefined ? { types: { some: { vendor_type: { can_supply_labor: input.canSupplyLabor, deleted_at: null } } } } : {}),
          ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { legal_name: { contains: search, mode: "insensitive" } }, { slug: { contains: search, mode: "insensitive" } }, { contacts: { some: { person_name: { contains: search, mode: "insensitive" } } } }] } : {}),
        },
        orderBy: { name: "asc" },
        select: {
          id: true, name: true, slug: true, legal_name: true, address: true, notes: true, info_links: true, link_review_snapshot: true, updated_at: true, deleted_at: true,
          types: { select: { vendor_type: { select: { id: true, code: true, name: true, can_supply_material: true, can_supply_labor: true } } } },
          supplier_categories: { select: { supplier_category: { select: { id: true, code: true, name: true } } }, orderBy: { supplier_category: { name: "asc" } } },
          contacts: { select: { id: true, person_name: true, job_title: true, email: true, phone: true, is_primary: true, brand_id: true, notes: true } },
          brand_suppliers: { select: { id: true, is_authorized: true, notes: true, brand: { select: { id: true, name: true } } }, orderBy: { brand: { name: "asc" } } },
          _count: { select: { owned_brands: true, brand_suppliers: true, material_prices: true, material_labor_prices: true, labor_prices: true } },
        },
      });
      const actorLabels = await latestAuditActorLabels(db, "vendor", rows.map((row) => row.id));
      return rows.map((row) => ({ ...row, updated_by_label: actorLabels.get(row.id) ?? null }));
    },

    async listSkuDirectoryRefs(input: { grants: PermissionGrants }) {
      requireAnyPermission(input.grants, [MASTERDATA_PERMISSIONS.skuRead, MASTERDATA_PERMISSIONS.skuManage], "You do not have permission to view SKU references.");
      const [brands, units, productCategories, materialVendors] = await Promise.all([
        db.brand.findMany({ where: { deleted_at: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
        db.unit.findMany({ where: { status: "ACTIVE" }, orderBy: [{ name: "asc" }, { code: "asc" }], select: { id: true, code: true, name: true } }),
        db.category.findMany({ where: { status: "ACTIVE", kind: "PRODUCT" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
        db.vendor.findMany({ where: { deleted_at: null, types: { some: { vendor_type: { can_supply_material: true, deleted_at: null } } } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
      ]);
      return { brands, units, productCategories, materialVendors };
    },

    async listPricingMaterialRefs(input: { grants: PermissionGrants }) {
      requireAnyPermission(input.grants, [MASTERDATA_PERMISSIONS.priceMaterialRead, MASTERDATA_PERMISSIONS.priceMaterialManage], "You do not have permission to view material price references.");
      const [skus, brands, units, productCategories, vendors] = await Promise.all([
        db.sku.findMany({ where: { deleted_at: null }, orderBy: { name: "asc" }, select: { id: true, name: true, code: true, brand: { select: { id: true, name: true } }, base_unit: { select: { id: true, code: true, name: true } }, purchase_unit: { select: { id: true, code: true, name: true } }, dimension_length: true, dimension_width: true, dimension_thickness: true, dimension_unit: { select: { id: true, code: true, name: true } }, purchase_to_base_factor: true } }),
        db.brand.findMany({ where: { deleted_at: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
        db.unit.findMany({ where: { status: "ACTIVE" }, orderBy: [{ name: "asc" }, { code: "asc" }], select: { id: true, code: true, name: true } }),
        db.category.findMany({ where: { status: "ACTIVE", kind: "PRODUCT" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
        db.vendor.findMany({ where: { deleted_at: null, types: { some: { vendor_type: { can_supply_material: true, deleted_at: null } } } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
      ]);
      return { skus, brands, units, productCategories, vendors };
    },

    async listPricingWorkRefs(input: { grants: PermissionGrants }) {
      requireAnyPermission(input.grants, [MASTERDATA_PERMISSIONS.priceWorkRead, MASTERDATA_PERMISSIONS.priceWorkManage], "You do not have permission to view work price references.");
      const [workCategories, vendors, units] = await Promise.all([
        db.category.findMany({ where: { status: "ACTIVE", kind: "WORK" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
        db.vendor.findMany({ where: { deleted_at: null, types: { some: { vendor_type: { can_supply_labor: true, deleted_at: null } } } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
        db.unit.findMany({ where: { status: "ACTIVE" }, orderBy: [{ name: "asc" }, { code: "asc" }], select: { id: true, code: true, name: true } }),
      ]);
      return { workCategories, vendors, units };
    },

    async getVendor(input: { grants: PermissionGrants; vendorId: string }) {
      requireAnyPermission(input.grants, [MASTERDATA_PERMISSIONS.vendorRead, MASTERDATA_PERMISSIONS.vendorManage], "You do not have permission to view Suppliers.");
      return db.vendor.findUniqueOrThrow({
        where: { id: input.vendorId },
        include: { types: { include: { vendor_type: true } }, supplier_categories: { include: { supplier_category: { select: { id: true, code: true, name: true } } } }, contacts: { include: { brand: { select: { id: true, name: true, slug: true } } } }, owned_brands: { select: { id: true, name: true, slug: true } }, brand_suppliers: { include: { brand: { select: { id: true, name: true, slug: true, deleted_at: true } } } }, _count: { select: { material_prices: true, material_labor_prices: true, labor_prices: true } } },
      });
    },

    async createVendor(input: { grants: PermissionGrants; actor: AuditActor; name: string; legalName?: string; address?: string; notes?: string; vendorTypeIds?: string[]; supplierCategoryIds?: string[]; contacts?: Array<{ personName: string; jobTitle?: string; email?: string; phone?: string; isPrimary?: boolean; notes?: string; brandId?: string }> }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.vendorManage);
      actorIsUsable(input.actor);
      const name = requiredName(input.name, "VENDOR_NAME_REQUIRED");
      const slug = requiredSlug(name);
      return runTransaction(async (tx) => {
        let vendor;
        try { vendor = await tx.vendor.create({ data: { id: randomUUID(), name, slug, legal_name: input.legalName?.trim() || null, address: input.address?.trim() || null, notes: input.notes?.trim() || null } }); } catch (error) { mapWriteError(error); }
        const vendorId = vendor!.id;
        if (input.vendorTypeIds && input.vendorTypeIds.length > 0) {
          const vendorTypes = await tx.vendorType.findMany({ where: { id: { in: input.vendorTypeIds }, deleted_at: null }, select: { id: true } });
          if (vendorTypes.length !== new Set(input.vendorTypeIds).size) throw new AppError("VALIDATION", "VENDOR_TYPE_INVALID", "Every selected Supplier Type must be active.");
          await tx.vendorVendorType.createMany({ data: input.vendorTypeIds.map((vendorTypeId) => ({ id: randomUUID(), vendor_id: vendorId, vendor_type_id: vendorTypeId })) });
        }
        if (input.supplierCategoryIds && input.supplierCategoryIds.length > 0) {
          const supplierCategories = await tx.supplierCategory.findMany({ where: { id: { in: input.supplierCategoryIds }, deleted_at: null }, select: { id: true } });
          if (supplierCategories.length !== new Set(input.supplierCategoryIds).size) throw new AppError("VALIDATION", "SUPPLIER_CATEGORY_INVALID", "Every selected Supplier Category must be active.");
          await tx.vendorSupplierCategory.createMany({ data: input.supplierCategoryIds.map((supplierCategoryId) => ({ id: randomUUID(), vendor_id: vendorId, supplier_category_id: supplierCategoryId })) });
        }
        if (input.contacts && input.contacts.length > 0) {
          for (const c of input.contacts) {
            if (c.brandId) {
              const brand = await tx.brand.findUniqueOrThrow({ where: { id: c.brandId } });
              if (brand.deleted_at !== null) throw new AppError("VALIDATION", "CONTACT_BRAND_ARCHIVED", "Brand is archived.");
              const ownsViaBrand = brand.owner_vendor_id === vendorId;
              if (!ownsViaBrand) { const existingSupplier = await tx.brandSupplier.findFirst({ where: { brand_id: c.brandId, vendor_id: vendorId } }); if (!existingSupplier) throw new AppError("VALIDATION", "CONTACT_BRAND_NOT_RELATED", "Supplier must own or supply this Brand to assign a Brand-scoped contact."); }
            }
            await tx.vendorContact.create({ data: { id: randomUUID(), vendor_id: vendorId, person_name: requiredName(c.personName, "CONTACT_NAME_REQUIRED"), job_title: c.jobTitle?.trim() || null, email: c.email?.trim() || null, phone: c.phone?.trim() || null, is_primary: c.isPrimary ?? false, notes: c.notes?.trim() || null, brand_id: c.brandId || null } });
          }
        }
        await writeAudit(ports, tx, { action: "vendor.created", entityType: "vendor", entityId: vendorId, actor: input.actor, metadata: { slug } });
        return { vendorId };
      });
    },

    async createPricingVendorQuick(input: { grants: PermissionGrants; actor: AuditActor; name: string; vendorTypeId: string; capability: "MATERIAL" | "LABOR" }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.vendorManage);
      actorIsUsable(input.actor);
      const name = requiredName(input.name, "VENDOR_NAME_REQUIRED");
      const slug = requiredSlug(name);
      return runTransaction(async (tx) => {
        const vendorType = await tx.vendorType.findUnique({ where: { id: input.vendorTypeId } });
        if (!vendorType || vendorType.deleted_at !== null) throw new AppError("VALIDATION", "VENDOR_TYPE_INVALID", "Choose an active Supplier Type.");
        const capable = input.capability === "MATERIAL" ? vendorType.can_supply_material : vendorType.can_supply_labor;
        if (!capable) throw new AppError("VALIDATION", "VENDOR_TYPE_CAPABILITY_REQUIRED", input.capability === "MATERIAL" ? "Choose a Supplier Type that can supply material." : "Choose a Supplier Type that can provide labor.");
        let vendor;
        try { vendor = await tx.vendor.create({ data: { id: randomUUID(), name, slug, legal_name: null, address: null, notes: null } }); await tx.vendorVendorType.create({ data: { id: randomUUID(), vendor_id: vendor.id, vendor_type_id: vendorType.id } }); } catch (error) { mapWriteError(error); }
        await writeAudit(ports, tx, { action: "vendor.created", entityType: "vendor", entityId: vendor!.id, actor: input.actor, metadata: { slug, quick_entry: "pricing", vendor_type_id: vendorType.id, capability: input.capability } });
        return { vendorId: vendor!.id };
      });
    },

    async updateVendor(input: { grants: PermissionGrants; actor: AuditActor; vendorId: string; name: string; legalName?: string | null; address?: string | null; notes?: string | null; vendorTypeIds?: string[]; supplierCategoryIds?: string[]; contacts?: Array<{ id?: string; personName: string; jobTitle?: string; email?: string; phone?: string; isPrimary?: boolean; notes?: string; brandId?: string }>; infoLinks?: Array<{ kind: string; url: string; label?: string | null }>; linkReviewSnapshot?: unknown[] }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.vendorManage);
      actorIsUsable(input.actor);
      const name = requiredName(input.name, "VENDOR_NAME_REQUIRED");
      const slug = requiredSlug(name);
      return runTransaction(async (tx) => {
        const existing = await tx.vendor.findUniqueOrThrow({ where: { id: input.vendorId }, include: { types: true, contacts: true, supplier_categories: true } });
        const changes: Record<string, { from: unknown; to: unknown }> = {};
        if (existing.name !== name) { changes.name = { from: existing.name, to: name }; changes.slug = { from: existing.slug, to: slug }; }
        if ((existing.legal_name || null) !== (input.legalName?.trim() || null)) changes.legal_name = { from: existing.legal_name, to: input.legalName?.trim() || null };
        if ((existing.address || null) !== (input.address?.trim() || null)) changes.address = { from: existing.address, to: input.address?.trim() || null };
        if ((existing.notes || null) !== (input.notes?.trim() || null)) changes.notes = { from: existing.notes, to: input.notes?.trim() || null };
        if (Object.keys(changes).length > 0) { try { await tx.vendor.update({ where: { id: input.vendorId }, data: { name, slug, legal_name: input.legalName?.trim() || null, address: input.address?.trim() || null, notes: input.notes?.trim() || null } }); } catch (error) { mapWriteError(error); } }
        if (input.vendorTypeIds !== undefined) {
          const requestedTypeIds = [...new Set(input.vendorTypeIds)];
          if (requestedTypeIds.length > 0) { const liveTypes = await tx.vendorType.findMany({ where: { id: { in: requestedTypeIds }, deleted_at: null }, select: { id: true } }); if (liveTypes.length !== requestedTypeIds.length) throw new AppError("VALIDATION", "VENDOR_TYPE_INVALID", "Every selected Supplier Type must be active."); }
          await assertVendorTypeRemovalSafe(tx, input.vendorId, requestedTypeIds);
          const existingTypeIds = new Set(existing.types.map((t) => t.vendor_type_id));
          const removedTypes = existing.types.filter((t) => !requestedTypeIds.includes(t.vendor_type_id));
          if (removedTypes.length > 0) await tx.vendorVendorType.deleteMany({ where: { id: { in: removedTypes.map((t) => t.id) } } });
          const addedTypeIds = requestedTypeIds.filter((id) => !existingTypeIds.has(id));
          if (addedTypeIds.length > 0) await tx.vendorVendorType.createMany({ data: addedTypeIds.map((vendorTypeId) => ({ id: randomUUID(), vendor_id: input.vendorId, vendor_type_id: vendorTypeId })) });
          if (removedTypes.length > 0 || addedTypeIds.length > 0) changes.vendor_types = { from: [...existingTypeIds].sort(), to: [...requestedTypeIds].sort() };
        }
        if (input.supplierCategoryIds !== undefined) {
          const requestedCategoryIds = [...new Set(input.supplierCategoryIds)];
          if (requestedCategoryIds.length > 0) { const liveCategories = await tx.supplierCategory.findMany({ where: { id: { in: requestedCategoryIds }, deleted_at: null }, select: { id: true } }); if (liveCategories.length !== requestedCategoryIds.length) throw new AppError("VALIDATION", "SUPPLIER_CATEGORY_INVALID", "Every selected Supplier Category must be active."); }
          const existingCategoryIds = new Set(existing.supplier_categories.map((c) => c.supplier_category_id));
          const removedCategories = existing.supplier_categories.filter((c) => !requestedCategoryIds.includes(c.supplier_category_id));
          if (removedCategories.length > 0) await tx.vendorSupplierCategory.deleteMany({ where: { id: { in: removedCategories.map((c) => c.id) } } });
          const addedCategoryIds = requestedCategoryIds.filter((id) => !existingCategoryIds.has(id));
          if (addedCategoryIds.length > 0) await tx.vendorSupplierCategory.createMany({ data: addedCategoryIds.map((supplierCategoryId) => ({ id: randomUUID(), vendor_id: input.vendorId, supplier_category_id: supplierCategoryId })) });
          if (removedCategories.length > 0 || addedCategoryIds.length > 0) changes.supplier_categories = { from: [...existingCategoryIds].sort(), to: [...requestedCategoryIds].sort() };
        }
        if (input.contacts !== undefined) {
          const keptContactIds = new Set(input.contacts.map((c) => c.id).filter((id): id is string => Boolean(id)));
          const removedContacts = existing.contacts.filter((c) => !keptContactIds.has(c.id));
          if (removedContacts.length > 0) await tx.vendorContact.deleteMany({ where: { id: { in: removedContacts.map((c) => c.id) } } });
          const existingContactById = new Map(existing.contacts.map((c) => [c.id, c] as const));
          let contactFieldChanged = false;
          for (const c of input.contacts) {
            if (c.brandId) { const brand = await tx.brand.findUniqueOrThrow({ where: { id: c.brandId } }); if (brand.deleted_at !== null) throw new AppError("VALIDATION", "CONTACT_BRAND_ARCHIVED", "Brand is archived."); const ownsViaBrand = brand.owner_vendor_id === input.vendorId; if (!ownsViaBrand) { const existingSupplier = await tx.brandSupplier.findFirst({ where: { brand_id: c.brandId, vendor_id: input.vendorId } }); if (!existingSupplier) throw new AppError("VALIDATION", "CONTACT_BRAND_NOT_RELATED", "Supplier must own or supply this Brand to assign a Brand-scoped contact."); } }
            const contactData = { person_name: requiredName(c.personName, "CONTACT_NAME_REQUIRED"), job_title: c.jobTitle?.trim() || null, email: c.email?.trim() || null, phone: c.phone?.trim() || null, is_primary: c.isPrimary ?? false, notes: c.notes?.trim() || null, brand_id: c.brandId || null };
            if (c.id && existingContactById.has(c.id)) { const ex = existingContactById.get(c.id)!; const contactChanged = ex.person_name !== contactData.person_name || (ex.job_title || null) !== contactData.job_title || (ex.email || null) !== contactData.email || (ex.phone || null) !== contactData.phone || ex.is_primary !== contactData.is_primary || (ex.notes || null) !== contactData.notes || (ex.brand_id || null) !== contactData.brand_id; if (contactChanged) { await tx.vendorContact.update({ where: { id: c.id }, data: contactData }); contactFieldChanged = true; } }
            else { await tx.vendorContact.create({ data: { id: c.id || randomUUID(), vendor_id: input.vendorId, ...contactData } }); }
          }
          const beforeContactIds = existing.contacts.map((c) => c.id).sort();
          const afterContactIds = input.contacts.map((c, index) => c.id ?? `new:${index}`).sort();
          const contactIdsChanged = beforeContactIds.join("\u0000") !== afterContactIds.join("\u0000");
          if (contactIdsChanged || contactFieldChanged) changes.contacts = { from: existing.contacts.length, to: input.contacts.length };
        }
        if (input.infoLinks !== undefined) {
          const ALLOWED_INFO_LINK_KINDS = new Set(["WEBSITE", "INSTAGRAM", "FACEBOOK", "TIKTOK", "YOUTUBE", "LINKEDIN", "WHATSAPP"]);
          const INFO_LINKS_MAX_COUNT = 20;
          const INFO_LINK_URL_MAX_LEN = 2048;
          const INFO_LINK_LABEL_MAX_LEN = 200;
          if (input.infoLinks.length > INFO_LINKS_MAX_COUNT) throw new AppError("VALIDATION", "INFO_LINKS_TOO_MANY", `Maximum ${INFO_LINKS_MAX_COUNT} links allowed.`);
          const normalizedLinks: Array<{ kind: string; url: string; label: string | null }> = [];
          const seenUrls = new Set<string>();
          for (const l of input.infoLinks) {
            const kind = l.kind.trim().toUpperCase(); const url = l.url.trim(); const label = l.label?.trim() || null;
            if (!ALLOWED_INFO_LINK_KINDS.has(kind)) throw new AppError("VALIDATION", "INFO_LINK_KIND_INVALID", `Link kind "${kind}" is not allowed.`);
            if (!/^https?:\/\//i.test(url)) throw new AppError("VALIDATION", "INFO_LINK_URL_NOT_HTTP", "Links must use HTTP or HTTPS.");
            try { new URL(url); } catch { throw new AppError("VALIDATION", "INFO_LINK_URL_INVALID", "Each link must have a valid URL."); }
            if (url.length > INFO_LINK_URL_MAX_LEN) throw new AppError("VALIDATION", "INFO_LINK_URL_TOO_LONG", `URL exceeds ${INFO_LINK_URL_MAX_LEN} characters.`);
            if (label && label.length > INFO_LINK_LABEL_MAX_LEN) throw new AppError("VALIDATION", "INFO_LINK_LABEL_TOO_LONG", `Label exceeds ${INFO_LINK_LABEL_MAX_LEN} characters.`);
            if (seenUrls.has(url)) continue; seenUrls.add(url); normalizedLinks.push({ kind, url, label });
          }
          const existingLinks = Array.isArray(existing.info_links) ? (existing.info_links as Array<Record<string, unknown>>).map((l) => ({ kind: String(l["kind"] ?? ""), url: String(l["url"] ?? ""), label: l["label"] != null ? String(l["label"]) : null })) : [];
          const linksChanged = JSON.stringify(existingLinks) !== JSON.stringify(normalizedLinks);
          let snapshotChanged = false;
          if (input.linkReviewSnapshot !== undefined) { const existingSnapshot = Array.isArray(existing.link_review_snapshot) ? existing.link_review_snapshot : []; snapshotChanged = JSON.stringify(existingSnapshot) !== JSON.stringify(input.linkReviewSnapshot); }
          if (linksChanged || snapshotChanged) {
            await tx.vendor.update({ where: { id: input.vendorId }, data: { ...(linksChanged ? { info_links: normalizedLinks as any } : {}), ...(snapshotChanged ? { link_review_snapshot: input.linkReviewSnapshot as any } : {}) } });
            if (linksChanged) changes.info_links = { from: `${existingLinks.length} links`, to: `${normalizedLinks.length} links` };
            if (snapshotChanged) { const prevLen = Array.isArray(existing.link_review_snapshot) ? (existing.link_review_snapshot as unknown[]).length : 0; const nextLen = (input.linkReviewSnapshot as unknown[]).length; changes.link_review_snapshot = { from: prevLen > 0 ? `${prevLen} pending` : "none", to: nextLen === 0 ? "cleared" : `${nextLen} pending` }; }
          }
        }
        if (Object.keys(changes).length > 0) await writeAudit(ports, tx, { action: "vendor.updated", entityType: "vendor", entityId: input.vendorId, actor: input.actor, changes });
        return { vendorId: input.vendorId };
      });
    },

    async archiveVendor(input: { grants: PermissionGrants; actor: AuditActor; vendorId: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.vendorManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx) => {
        const vendor = await tx.vendor.findUniqueOrThrow({ where: { id: input.vendorId } });
        if (vendor.deleted_at !== null) throw new AppError("CONFLICT", "VENDOR_ALREADY_ARCHIVED", "Supplier is already archived.");
        const now = new Date();
        await addDirectCause(tx, "vendor", input.vendorId);
        await tx.vendor.update({ where: { id: input.vendorId }, data: { deleted_at: now } });
        const materialPrices = await tx.priceMaterial.findMany({ where: { supplier_vendor_id: input.vendorId }, select: { id: true, deleted_at: true } });
        const materialIds = materialPrices.map((price) => price.id);
        if (materialIds.length > 0) { await addParentCauses(tx, "price_material", "vendor", input.vendorId, materialIds); await tx.priceMaterial.updateMany({ where: { id: { in: materialIds }, deleted_at: null }, data: { deleted_at: now } }); }
        const mlPrices = await tx.priceMaterialLabor.findMany({ where: { vendor_id: input.vendorId }, select: { id: true, deleted_at: true } });
        const mlIds = mlPrices.map((price) => price.id);
        if (mlIds.length > 0) { await addParentCauses(tx, "price_material_labor", "vendor", input.vendorId, mlIds); await tx.priceMaterialLabor.updateMany({ where: { id: { in: mlIds }, deleted_at: null }, data: { deleted_at: now } }); }
        const laborPrices = await tx.priceLabor.findMany({ where: { vendor_id: input.vendorId }, select: { id: true, deleted_at: true } });
        const laborIds = laborPrices.map((price) => price.id);
        if (laborIds.length > 0) { await addParentCauses(tx, "price_labor", "vendor", input.vendorId, laborIds); await tx.priceLabor.updateMany({ where: { id: { in: laborIds }, deleted_at: null }, data: { deleted_at: now } }); }
        await writeAudit(ports, tx, { action: "vendor.archived", entityType: "vendor", entityId: input.vendorId, actor: input.actor, metadata: { material_prices_archived: materialPrices.filter((price) => price.deleted_at === null).length, ml_prices_archived: mlPrices.filter((price) => price.deleted_at === null).length, labor_prices_archived: laborPrices.filter((price) => price.deleted_at === null).length } });
        return { vendorId: input.vendorId };
      });
    },

    async restoreVendor(input: { grants: PermissionGrants; actor: AuditActor; vendorId: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.vendorManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx) => {
        const vendor = await tx.vendor.findUniqueOrThrow({ where: { id: input.vendorId } });
        if (vendor.deleted_at === null) throw new AppError("CONFLICT", "VENDOR_NOT_ARCHIVED", "Supplier is not archived.");
        const [identityConflict, typeRelations, supplierRelationCount] = await Promise.all([
          tx.vendor.findFirst({ where: { id: { not: input.vendorId }, deleted_at: null, OR: [{ slug: vendor.slug }, { name: { equals: vendor.name, mode: "insensitive" } }] }, select: { id: true } }),
          tx.vendorVendorType.findMany({ where: { vendor_id: input.vendorId }, include: { vendor_type: true } }),
          tx.brandSupplier.count({ where: { vendor_id: input.vendorId } }),
        ]);
        if (identityConflict) throw new AppError("CONFLICT", "VENDOR_IDENTITY_CONFLICT", "A live Supplier already uses this identity.");
        if (typeRelations.some((row) => row.vendor_type.deleted_at !== null)) throw new AppError("CONFLICT", "VENDOR_TYPE_ARCHIVED", "Supplier has an archived Supplier Type assignment.");
        await removeDirectCause(tx, "vendor", input.vendorId);
        await tx.vendor.update({ where: { id: input.vendorId }, data: { deleted_at: null } });
        if (supplierRelationCount > 0) await assertVendorMaterialCapable(tx, input.vendorId);
        const restoredMaterialIds = await removeParentCausesAndFindRestored(tx, "price_material", "vendor", input.vendorId);
        if (restoredMaterialIds.length > 0) { for (const priceId of restoredMaterialIds) await assertPriceMaterialRestorable(tx, priceId); await tx.priceMaterial.updateMany({ where: { id: { in: restoredMaterialIds } }, data: { deleted_at: null } }); }
        const restoredMlIds = await removeParentCausesAndFindRestored(tx, "price_material_labor", "vendor", input.vendorId);
        if (restoredMlIds.length > 0) { for (const priceId of restoredMlIds) await assertWorkPriceRestorable(tx, "material-labor", priceId); await tx.priceMaterialLabor.updateMany({ where: { id: { in: restoredMlIds } }, data: { deleted_at: null } }); }
        const restoredLaborIds = await removeParentCausesAndFindRestored(tx, "price_labor", "vendor", input.vendorId);
        if (restoredLaborIds.length > 0) { for (const priceId of restoredLaborIds) await assertWorkPriceRestorable(tx, "labor", priceId); await tx.priceLabor.updateMany({ where: { id: { in: restoredLaborIds } }, data: { deleted_at: null } }); }
        await writeAudit(ports, tx, { action: "vendor.restored", entityType: "vendor", entityId: input.vendorId, actor: input.actor, metadata: { material_prices_restored: restoredMaterialIds.length, ml_prices_restored: restoredMlIds.length, labor_prices_restored: restoredLaborIds.length } });
        return { vendorId: input.vendorId };
      });
    },

    async requestVendorDeletion(input: { grants: PermissionGrants; actor: AuditActor; vendorId: string; reason?: string; notes?: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.vendorManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx) => {
        const vendor = await tx.vendor.findUniqueOrThrow({ where: { id: input.vendorId } });
        if (vendor.deleted_at === null) throw new AppError("VALIDATION", "VENDOR_NOT_ARCHIVED", "Only archived Suppliers may be submitted for deletion.");
        const requestId = await createDeletionRequest(tx, { targetType: "vendor", targetId: input.vendorId, actor: input.actor, reason: input.reason, notes: input.notes });
        await writeAudit(ports, tx, { action: "vendor.deletion-requested", entityType: "vendor", entityId: input.vendorId, actor: input.actor });
        return { requestId };
      });
    },
  };
}
