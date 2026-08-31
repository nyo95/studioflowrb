-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "master_data";

-- CreateEnum
CREATE TYPE "master_data"."UnitStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "master_data"."CategoryKind" AS ENUM ('PRODUCT', 'WORK');

-- CreateEnum
CREATE TYPE "master_data"."CategoryStatus" AS ENUM ('ACTIVE', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "master_data"."ArchiveCauseKind" AS ENUM ('DIRECT', 'PARENT');

-- CreateEnum
CREATE TYPE "master_data"."DeletionRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "master_data"."CategoryOriginKind" AS ENUM ('MANUAL', 'SKU_ENRICHMENT');

CREATE TABLE "master_data"."Unit" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "master_data"."UnitStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_data"."Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "kind" "master_data"."CategoryKind" NOT NULL,
    "status" "master_data"."CategoryStatus" NOT NULL DEFAULT 'ACTIVE',
    "deactivated_at" TIMESTAMP(3),
    "merged_into_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_data"."VendorType" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "can_supply_material" BOOLEAN NOT NULL DEFAULT false,
    "can_supply_labor" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_data"."Vendor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "legal_name" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_data"."VendorVendorType" (
    "id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "vendor_type_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorVendorType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_data"."VendorContact" (
    "id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "brand_id" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "position" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_data"."VendorLink" (
    "id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "label" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_data"."Brand" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "owner_vendor_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_data"."BrandSupplier" (
    "id" TEXT NOT NULL,
    "brand_id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandSupplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_data"."BrandLink" (
    "id" TEXT NOT NULL,
    "brand_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "label" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_data"."BrandHashtag" (
    "id" TEXT NOT NULL,
    "brand_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandHashtag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_data"."BrandCategory" (
    "id" TEXT NOT NULL,
    "brand_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_data"."BrandCategoryOrigin" (
    "id" TEXT NOT NULL,
    "brand_category_id" TEXT NOT NULL,
    "kind" "master_data"."CategoryOriginKind" NOT NULL,
    "source_sku_id" TEXT,
    "actor_user_id" TEXT,
    "actor_label" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandCategoryOrigin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_data"."Sku" (
    "id" TEXT NOT NULL,
    "brand_id" TEXT,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "base_unit_id" TEXT NOT NULL,
    "purchase_unit_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "Sku_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_data"."SkuCategory" (
    "id" TEXT NOT NULL,
    "sku_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkuCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_data"."PriceMaterial" (
    "id" TEXT NOT NULL,
    "sku_id" TEXT NOT NULL,
    "supplier_vendor_id" TEXT NOT NULL,
    "amount" DECIMAL(16,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "source_link_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "updated_by_user_id" TEXT,
    "updated_by_label" TEXT NOT NULL,

    CONSTRAINT "PriceMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_data"."PriceMaterialLabor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "amount" DECIMAL(16,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "scope_note" TEXT,
    "spec" JSONB,
    "dim_display" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "updated_by_user_id" TEXT,
    "updated_by_label" TEXT NOT NULL,

    CONSTRAINT "PriceMaterialLabor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_data"."PriceLabor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "amount" DECIMAL(16,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "spec" JSONB,
    "dim_display" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "updated_by_user_id" TEXT,
    "updated_by_label" TEXT NOT NULL,

    CONSTRAINT "PriceLabor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_data"."ArchiveCause" (
    "id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "kind" "master_data"."ArchiveCauseKind" NOT NULL,
    "parent_type" TEXT,
    "parent_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArchiveCause_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_data"."DeletionRequest" (
    "id" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "status" "master_data"."DeletionRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requester_user_id" TEXT NOT NULL,
    "requester_label" TEXT NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approver_user_id" TEXT,
    "approver_label" TEXT,
    "decided_at" TIMESTAMP(3),
    "reason" TEXT,
    "notes" TEXT,

    CONSTRAINT "DeletionRequest_pkey" PRIMARY KEY ("id")
);


-- CreateIndex
CREATE UNIQUE INDEX "Unit_code_key" ON "master_data"."Unit"("code");

-- CreateIndex
CREATE INDEX "Unit_status_idx" ON "master_data"."Unit"("status");

-- CreateIndex
CREATE INDEX "Category_kind_status_idx" ON "master_data"."Category"("kind", "status");

-- CreateIndex
CREATE INDEX "Category_merged_into_id_idx" ON "master_data"."Category"("merged_into_id");

-- CreateIndex
CREATE UNIQUE INDEX "VendorType_code_key" ON "master_data"."VendorType"("code");

-- CreateIndex
CREATE INDEX "VendorType_deleted_at_idx" ON "master_data"."VendorType"("deleted_at");

-- CreateIndex
CREATE INDEX "Vendor_deleted_at_idx" ON "master_data"."Vendor"("deleted_at");

-- CreateIndex
CREATE INDEX "VendorVendorType_vendor_type_id_idx" ON "master_data"."VendorVendorType"("vendor_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "VendorVendorType_vendor_id_vendor_type_id_key" ON "master_data"."VendorVendorType"("vendor_id", "vendor_type_id");

-- CreateIndex
CREATE INDEX "VendorContact_vendor_id_idx" ON "master_data"."VendorContact"("vendor_id");

-- CreateIndex
CREATE INDEX "VendorContact_brand_id_idx" ON "master_data"."VendorContact"("brand_id");

-- CreateIndex
CREATE UNIQUE INDEX "VendorLink_vendor_id_url_key" ON "master_data"."VendorLink"("vendor_id", "url");

-- CreateIndex
CREATE INDEX "Brand_deleted_at_idx" ON "master_data"."Brand"("deleted_at");

-- CreateIndex
CREATE INDEX "Brand_owner_vendor_id_idx" ON "master_data"."Brand"("owner_vendor_id");

-- CreateIndex
CREATE INDEX "BrandSupplier_vendor_id_idx" ON "master_data"."BrandSupplier"("vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "BrandSupplier_brand_id_vendor_id_key" ON "master_data"."BrandSupplier"("brand_id", "vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "BrandLink_brand_id_url_key" ON "master_data"."BrandLink"("brand_id", "url");

-- CreateIndex
CREATE INDEX "BrandHashtag_normalized_idx" ON "master_data"."BrandHashtag"("normalized");

-- CreateIndex
CREATE UNIQUE INDEX "BrandHashtag_brand_id_normalized_key" ON "master_data"."BrandHashtag"("brand_id", "normalized");

-- CreateIndex
CREATE INDEX "BrandCategory_category_id_idx" ON "master_data"."BrandCategory"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "BrandCategory_brand_id_category_id_key" ON "master_data"."BrandCategory"("brand_id", "category_id");

-- CreateIndex
CREATE INDEX "BrandCategoryOrigin_source_sku_id_idx" ON "master_data"."BrandCategoryOrigin"("source_sku_id");

-- CreateIndex
CREATE INDEX "BrandCategoryOrigin_brand_category_id_kind_idx" ON "master_data"."BrandCategoryOrigin"("brand_category_id", "kind");

-- CreateIndex
CREATE INDEX "Sku_brand_id_idx" ON "master_data"."Sku"("brand_id");

-- CreateIndex
CREATE INDEX "Sku_deleted_at_idx" ON "master_data"."Sku"("deleted_at");

-- CreateIndex
CREATE INDEX "Sku_code_idx" ON "master_data"."Sku"("code");

-- CreateIndex
CREATE INDEX "SkuCategory_category_id_idx" ON "master_data"."SkuCategory"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "SkuCategory_sku_id_category_id_key" ON "master_data"."SkuCategory"("sku_id", "category_id");

-- CreateIndex
CREATE INDEX "PriceMaterial_sku_id_idx" ON "master_data"."PriceMaterial"("sku_id");

-- CreateIndex
CREATE INDEX "PriceMaterial_supplier_vendor_id_idx" ON "master_data"."PriceMaterial"("supplier_vendor_id");

-- CreateIndex
CREATE INDEX "PriceMaterial_deleted_at_idx" ON "master_data"."PriceMaterial"("deleted_at");

-- CreateIndex
CREATE INDEX "PriceMaterialLabor_category_id_idx" ON "master_data"."PriceMaterialLabor"("category_id");

-- CreateIndex
CREATE INDEX "PriceMaterialLabor_vendor_id_idx" ON "master_data"."PriceMaterialLabor"("vendor_id");

-- CreateIndex
CREATE INDEX "PriceMaterialLabor_deleted_at_idx" ON "master_data"."PriceMaterialLabor"("deleted_at");

-- CreateIndex
CREATE INDEX "PriceLabor_category_id_idx" ON "master_data"."PriceLabor"("category_id");

-- CreateIndex
CREATE INDEX "PriceLabor_vendor_id_idx" ON "master_data"."PriceLabor"("vendor_id");

-- CreateIndex
CREATE INDEX "PriceLabor_deleted_at_idx" ON "master_data"."PriceLabor"("deleted_at");

-- CreateIndex
CREATE INDEX "ArchiveCause_entity_type_entity_id_idx" ON "master_data"."ArchiveCause"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "ArchiveCause_parent_type_parent_id_idx" ON "master_data"."ArchiveCause"("parent_type", "parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "ArchiveCause_entity_type_entity_id_kind_parent_type_parent__key" ON "master_data"."ArchiveCause"("entity_type", "entity_id", "kind", "parent_type", "parent_id");

-- CreateIndex
CREATE INDEX "DeletionRequest_target_type_target_id_status_idx" ON "master_data"."DeletionRequest"("target_type", "target_id", "status");

-- CreateIndex
CREATE INDEX "DeletionRequest_status_idx" ON "master_data"."DeletionRequest"("status");


ALTER TABLE "master_data"."Category" ADD CONSTRAINT "Category_merged_into_id_fkey" FOREIGN KEY ("merged_into_id") REFERENCES "master_data"."Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "master_data"."PriceLabor" ADD CONSTRAINT "PriceLabor_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "master_data"."Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Live business identities are partial because archived records remain audit
-- history and must not block a new live identity.
CREATE UNIQUE INDEX "Brand_live_name_uniq" ON "master_data"."Brand" (lower("name")) WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "Brand_live_slug_uniq" ON "master_data"."Brand" ("slug") WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "Vendor_live_name_uniq" ON "master_data"."Vendor" (lower("name")) WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "Vendor_live_slug_uniq" ON "master_data"."Vendor" ("slug") WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "Category_live_name_kind_uniq" ON "master_data"."Category" ("kind", lower("name")) WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "Category_live_slug_kind_uniq" ON "master_data"."Category" ("kind", "slug") WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "Sku_live_brand_slug_uniq" ON "master_data"."Sku" ("brand_id", "slug") WHERE "deleted_at" IS NULL AND "brand_id" IS NOT NULL;
CREATE UNIQUE INDEX "Sku_live_brandless_slug_uniq" ON "master_data"."Sku" ("slug") WHERE "deleted_at" IS NULL AND "brand_id" IS NULL;
CREATE UNIQUE INDEX "PriceMaterial_live_pair_uniq" ON "master_data"."PriceMaterial" ("sku_id", "supplier_vendor_id") WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "PriceMaterialLabor_live_vendor_slug_uniq" ON "master_data"."PriceMaterialLabor" ("vendor_id", "slug") WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "PriceMaterialLabor_live_vendor_name_uniq" ON "master_data"."PriceMaterialLabor" ("vendor_id", lower("name")) WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "PriceLabor_live_vendor_slug_uniq" ON "master_data"."PriceLabor" ("vendor_id", "slug") WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "PriceLabor_live_vendor_name_uniq" ON "master_data"."PriceLabor" ("vendor_id", lower("name")) WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "DeletionRequest_pending_target_uniq" ON "master_data"."DeletionRequest" ("target_type", "target_id") WHERE "status" = 'PENDING';
ALTER TABLE "master_data"."VendorVendorType" ADD CONSTRAINT "VendorVendorType_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "master_data"."Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_data"."VendorVendorType" ADD CONSTRAINT "VendorVendorType_vendor_type_id_fkey" FOREIGN KEY ("vendor_type_id") REFERENCES "master_data"."VendorType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_data"."VendorContact" ADD CONSTRAINT "VendorContact_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "master_data"."Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_data"."VendorContact" ADD CONSTRAINT "VendorContact_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "master_data"."Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_data"."VendorLink" ADD CONSTRAINT "VendorLink_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "master_data"."Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_data"."Brand" ADD CONSTRAINT "Brand_owner_vendor_id_fkey" FOREIGN KEY ("owner_vendor_id") REFERENCES "master_data"."Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_data"."BrandSupplier" ADD CONSTRAINT "BrandSupplier_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "master_data"."Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_data"."BrandSupplier" ADD CONSTRAINT "BrandSupplier_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "master_data"."Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_data"."BrandLink" ADD CONSTRAINT "BrandLink_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "master_data"."Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_data"."BrandHashtag" ADD CONSTRAINT "BrandHashtag_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "master_data"."Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_data"."BrandCategory" ADD CONSTRAINT "BrandCategory_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "master_data"."Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_data"."BrandCategory" ADD CONSTRAINT "BrandCategory_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "master_data"."Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_data"."BrandCategoryOrigin" ADD CONSTRAINT "BrandCategoryOrigin_brand_category_id_fkey" FOREIGN KEY ("brand_category_id") REFERENCES "master_data"."BrandCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_data"."BrandCategoryOrigin" ADD CONSTRAINT "BrandCategoryOrigin_source_sku_id_fkey" FOREIGN KEY ("source_sku_id") REFERENCES "master_data"."Sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_data"."Sku" ADD CONSTRAINT "Sku_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "master_data"."Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_data"."Sku" ADD CONSTRAINT "Sku_base_unit_id_fkey" FOREIGN KEY ("base_unit_id") REFERENCES "master_data"."Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_data"."Sku" ADD CONSTRAINT "Sku_purchase_unit_id_fkey" FOREIGN KEY ("purchase_unit_id") REFERENCES "master_data"."Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_data"."SkuCategory" ADD CONSTRAINT "SkuCategory_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "master_data"."Sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_data"."SkuCategory" ADD CONSTRAINT "SkuCategory_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "master_data"."Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_data"."PriceMaterial" ADD CONSTRAINT "PriceMaterial_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "master_data"."Sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_data"."PriceMaterial" ADD CONSTRAINT "PriceMaterial_supplier_vendor_id_fkey" FOREIGN KEY ("supplier_vendor_id") REFERENCES "master_data"."Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_data"."PriceMaterial" ADD CONSTRAINT "PriceMaterial_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "master_data"."Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_data"."PriceMaterial" ADD CONSTRAINT "PriceMaterial_source_link_id_fkey" FOREIGN KEY ("source_link_id") REFERENCES "master_data"."BrandLink"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_data"."PriceMaterialLabor" ADD CONSTRAINT "PriceMaterialLabor_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "master_data"."Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_data"."PriceMaterialLabor" ADD CONSTRAINT "PriceMaterialLabor_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "master_data"."Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_data"."PriceMaterialLabor" ADD CONSTRAINT "PriceMaterialLabor_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "master_data"."Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_data"."PriceLabor" ADD CONSTRAINT "PriceLabor_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "master_data"."Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_data"."PriceLabor" ADD CONSTRAINT "PriceLabor_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "master_data"."Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
