import { type Prisma, type PrismaClient } from "@/generated/prisma/client";
import { AppError } from "@platform/core/errors";
import { requirePermission, type PermissionGrants } from "@platform/core/rbac";

import { MASTERDATA_PERMISSIONS, type MasterDataServicePorts } from "./services/shared";
import { createUnitService } from "./services/unit.service";
import { createCategoryService } from "./services/category.service";
import { createVendorTypeService } from "./services/vendor-type.service";
import { createSupplierCategoryService } from "./services/supplier-category.service";
import { createBrandService } from "./services/brand.service";
import { createVendorService } from "./services/vendor.service";
import { createSkuService } from "./services/sku.service";
import { createPricingService } from "./services/pricing.service";
import { createDeletionService } from "./services/deletion.service";

type PromotionMaterial = Prisma.PriceMaterialGetPayload<{ include: { sku: true; supplier_vendor: true; unit: true } }>;
type PromotionLabor = Prisma.PriceLaborGetPayload<{ include: { vendor: true; unit: true } }>;
type PromotionCombined = Prisma.PriceMaterialLaborGetPayload<{ include: { vendor: true; unit: true } }>;

export function createMasterDataService(db: PrismaClient, ports: MasterDataServicePorts) {
  const p = ports;

  const unitService = createUnitService(db, p);
  const categoryService = createCategoryService(db, p);
  const vendorTypeService = createVendorTypeService(db, p);
  const supplierCategoryService = createSupplierCategoryService(db, p);
  const brandService = createBrandService(db, p);
  const vendorService = createVendorService(db, p);
  const skuService = createSkuService(db, p);
  const pricingService = createPricingService(db, p);
  const deletionService = createDeletionService(db, p);

  return {
    async summary(input: { grants: PermissionGrants }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.access);
      const [brands, vendors, skus, materialPrices, workPrices, units, categories, deletionRequests] = await Promise.all([
        db.brand.count({ where: { deleted_at: null } }),
        db.vendor.count({ where: { deleted_at: null } }),
        db.sku.count({ where: { deleted_at: null } }),
        db.priceMaterial.count({ where: { deleted_at: null } }),
        db.priceMaterialLabor.count({ where: { deleted_at: null } }).then((n) => db.priceLabor.count({ where: { deleted_at: null } }).then((m) => n + m)),
        db.unit.count({ where: { status: "ACTIVE" } }),
        db.category.count({ where: { status: "ACTIVE" } }),
        db.deletionRequest.count({ where: { status: "PENDING" } }),
      ]);
      return { brands, vendors, skus, materialPrices, workPrices, units, categories, deletionRequests };
    },

    ...unitService,
    ...categoryService,
    ...vendorTypeService,
    ...supplierCategoryService,
    ...brandService,
    ...vendorService,
    ...skuService,
    ...pricingService,
    ...deletionService,

    async listPromotionReferences(input: { grants: PermissionGrants }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.promotionApprove);
      const [materials, labor, combined] = await Promise.all([
        db.priceMaterial.findMany({ where: { deleted_at: null }, include: { sku: true, supplier_vendor: true, unit: true }, orderBy: { created_at: "desc" } }),
        db.priceLabor.findMany({ where: { deleted_at: null }, include: { vendor: true, unit: true }, orderBy: { name: "asc" } }),
        db.priceMaterialLabor.findMany({ where: { deleted_at: null }, include: { vendor: true, unit: true }, orderBy: { name: "asc" } }),
      ]);
      return [
        ...materials.map((p: PromotionMaterial) => ({ id: p.id, type: "material" as const, label: `${p.sku.name ?? p.sku.code ?? "SKU"} · ${p.supplier_vendor.name} · ${p.amount} ${p.currency}/${p.unit.code}` })),
        ...labor.map((p: PromotionLabor) => ({ id: p.id, type: "labor" as const, label: `${p.name} · ${p.vendor.name} · ${p.amount} ${p.currency}/${p.unit.code}` })),
        ...combined.map((p: PromotionCombined) => ({ id: p.id, type: "material_labor" as const, label: `${p.name} · ${p.vendor.name} · ${p.amount} ${p.currency}/${p.unit.code}` })),
      ];
    },

    async validatePromotionReference(input: { grants: PermissionGrants; type: "material" | "labor" | "material_labor"; referenceId: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.promotionApprove);
      const referenceId = input.referenceId.trim();
      if (!referenceId) throw new AppError("VALIDATION", "PROMOTION_REFERENCE_REQUIRED", "A Master Data reference is required.");
      const exists = input.type === "material"
        ? await db.priceMaterial.findFirst({ where: { id: referenceId, deleted_at: null }, select: { id: true } })
        : input.type === "labor"
          ? await db.priceLabor.findFirst({ where: { id: referenceId, deleted_at: null }, select: { id: true } })
          : await db.priceMaterialLabor.findFirst({ where: { id: referenceId, deleted_at: null }, select: { id: true } });
      if (!exists) throw new AppError("NOT_FOUND", "PROMOTION_REFERENCE_NOT_FOUND", "The selected Master Data price entry does not exist or is archived.");
      return { referenceId: exists.id };
    },
  };
}

export { MASTERDATA_PERMISSIONS };
