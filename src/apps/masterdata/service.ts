import { randomUUID } from "node:crypto";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { prepareAuditEvent, type AuditActor } from "@platform/core/audit";
import { AppError, mapPrismaKnownError } from "@platform/core/errors";
import { requirePermission, type PermissionGrants } from "@platform/core/rbac";
import { normalizeText } from "@platform/utilities/normalization";
import { toSlug } from "@platform/utilities/slug";

import { auditWriter, prisma, runTransaction } from "@platform/runtime";

export const MASTERDATA_PERMISSIONS = {
  access: "masterdata.access",
  brandRead: "masterdata.brand.read",
  brandManage: "masterdata.brand.manage",
  vendorRead: "masterdata.vendor.read",
  vendorManage: "masterdata.vendor.manage",
  dictionaryRead: "masterdata.dictionary.read",
  dictionaryManage: "masterdata.dictionary.manage",
} as const;

type DbClient = PrismaClient | Prisma.TransactionClient;

function actorIsUsable(actor: AuditActor): void {
  if (actor.kind !== "USER" || !actor.userId) {
    throw new AppError("UNAUTHENTICATED", "ACTOR_REQUIRED", "An authenticated staff member is required.");
  }
}

async function writeAudit(tx: Prisma.TransactionClient, input: {
  action: string;
  entityType: string;
  entityId: string;
  actor: AuditActor;
  changes?: Record<string, { from: unknown; to: unknown }>;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await auditWriter.write(prepareAuditEvent({
    appId: "masterdata",
    ...input,
  }), tx);
}

function mapWriteError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) throw mapPrismaKnownError(error);
  throw error;
}

function requiredName(value: string, code: string): string {
  const name = normalizeText(value);
  if (!name) throw new AppError("VALIDATION", code, "A name is required.");
  return name;
}

function requiredSlug(name: string): string {
  const slug = toSlug(name);
  if (!slug) throw new AppError("VALIDATION", "SLUG_INVALID", "The name must contain a usable identifier.");
  return slug;
}

export function createMasterDataService(db: PrismaClient = prisma) {
  return {
    async summary(input: { grants: PermissionGrants }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.access);
      const [brands, vendors, skus, materialPrices, workPrices, units, categories] = await Promise.all([
        db.brand.count({ where: { deleted_at: null } }),
        db.vendor.count({ where: { deleted_at: null } }),
        db.sku.count({ where: { deleted_at: null } }),
        db.priceMaterial.count({ where: { deleted_at: null } }),
        db.priceMaterialLabor.count({ where: { deleted_at: null } })
          .then((count) => db.priceLabor.count({ where: { deleted_at: null } }).then((labor) => count + labor)),
        db.unit.count({ where: { status: "ACTIVE" } }),
        db.category.count({ where: { status: "ACTIVE" } }),
      ]);
      return { brands, vendors, skus, materialPrices, workPrices, units, categories };
    },

    async listUnits(input: { grants: PermissionGrants; includeArchived?: boolean }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.dictionaryRead);
      return db.unit.findMany({
        where: input.includeArchived ? {} : { status: "ACTIVE" },
        orderBy: [{ name: "asc" }, { code: "asc" }],
        select: { id: true, code: true, name: true, status: true, archived_at: true },
      });
    },

    async listCategories(input: { grants: PermissionGrants; kind?: "PRODUCT" | "WORK"; includeDeactivated?: boolean }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.dictionaryRead);
      return db.category.findMany({
        where: {
          ...(input.kind ? { kind: input.kind } : {}),
          ...(input.includeDeactivated ? {} : { status: "ACTIVE" }),
        },
        orderBy: [{ kind: "asc" }, { name: "asc" }],
        select: { id: true, name: true, slug: true, kind: true, status: true, merged_into_id: true },
      });
    },

    async listBrands(input: { grants: PermissionGrants; search?: string; includeArchived?: boolean }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.brandRead);
      const search = input.search?.trim();
      return db.brand.findMany({
        where: {
          ...(input.includeArchived ? {} : { deleted_at: null }),
          ...(search ? { OR: [
            { name: { contains: search, mode: "insensitive" } },
            { slug: { contains: search, mode: "insensitive" } },
          ] } : {}),
        },
        orderBy: { name: "asc" },
        select: {
          id: true, name: true, slug: true, notes: true, deleted_at: true,
          owner_vendor: { select: { id: true, name: true } },
          _count: { select: { skus: true, suppliers: true, links: true, categories: true } },
        },
      });
    },

    async listVendors(input: { grants: PermissionGrants; search?: string; includeArchived?: boolean }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.vendorRead);
      const search = input.search?.trim();
      return db.vendor.findMany({
        where: {
          ...(input.includeArchived ? {} : { deleted_at: null }),
          ...(search ? { OR: [
            { name: { contains: search, mode: "insensitive" } },
            { legal_name: { contains: search, mode: "insensitive" } },
          ] } : {}),
        },
        orderBy: { name: "asc" },
        select: {
          id: true, name: true, slug: true, legal_name: true, deleted_at: true,
          types: { select: { vendor_type: { select: { code: true, name: true, can_supply_material: true, can_supply_labor: true } } } },
          _count: { select: { owned_brands: true, brand_suppliers: true, material_prices: true, material_labor_prices: true, labor_prices: true } },
        },
      });
    },

    async createUnit(input: { grants: PermissionGrants; actor: AuditActor; code: string; name: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.dictionaryManage);
      actorIsUsable(input.actor);
      const code = requiredName(input.code, "UNIT_CODE_REQUIRED").toUpperCase();
      const name = requiredName(input.name, "UNIT_NAME_REQUIRED");
      return runTransaction(async (tx) => {
        let unit;
        try {
          unit = await tx.unit.create({ data: { id: randomUUID(), code, name } });
        } catch (error) { mapWriteError(error); }
        await writeAudit(tx, { action: "unit.created", entityType: "unit", entityId: unit.id, actor: input.actor, metadata: { code } });
        return { unitId: unit.id };
      });
    },

    async createCategory(input: { grants: PermissionGrants; actor: AuditActor; name: string; kind: "PRODUCT" | "WORK" }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.dictionaryManage);
      actorIsUsable(input.actor);
      const name = requiredName(input.name, "CATEGORY_NAME_REQUIRED");
      const slug = requiredSlug(name);
      const { kind } = input;
      return runTransaction(async (tx) => {
        let category;
        try {
          category = await tx.category.create({ data: { id: randomUUID(), name, slug, kind } });
        } catch (error) { mapWriteError(error); }
        await writeAudit(tx, { action: "category.created", entityType: "category", entityId: category.id, actor: input.actor, metadata: { kind, slug } });
        return { categoryId: category.id };
      });
    },

    async createBrand(input: { grants: PermissionGrants; actor: AuditActor; name: string; notes?: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.brandManage);
      actorIsUsable(input.actor);
      const name = requiredName(input.name, "BRAND_NAME_REQUIRED");
      const slug = requiredSlug(name);
      return runTransaction(async (tx) => {
        let brand;
        try {
          brand = await tx.brand.create({ data: { id: randomUUID(), name, slug, notes: input.notes?.trim() || null } });
        } catch (error) { mapWriteError(error); }
        await writeAudit(tx, { action: "brand.created", entityType: "brand", entityId: brand.id, actor: input.actor, metadata: { slug } });
        return { brandId: brand.id };
      });
    },

    async createVendor(input: { grants: PermissionGrants; actor: AuditActor; name: string; legalName?: string; notes?: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.vendorManage);
      actorIsUsable(input.actor);
      const name = requiredName(input.name, "VENDOR_NAME_REQUIRED");
      const slug = requiredSlug(name);
      return runTransaction(async (tx) => {
        let vendor;
        try {
          vendor = await tx.vendor.create({ data: { id: randomUUID(), name, slug, legal_name: input.legalName?.trim() || null, notes: input.notes?.trim() || null } });
        } catch (error) { mapWriteError(error); }
        await writeAudit(tx, { action: "vendor.created", entityType: "vendor", entityId: vendor.id, actor: input.actor, metadata: { slug } });
        return { vendorId: vendor.id };
      });
    },
  };
}

export const masterDataService = createMasterDataService();
