-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "master_data";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "platform";

-- CreateEnum
CREATE TYPE "master_data"."CategoryKind" AS ENUM ('PRODUCT', 'WORK');

-- CreateEnum
CREATE TYPE "master_data"."PartyType" AS ENUM ('ORGANIZATION', 'INDIVIDUAL');

-- CreateEnum
CREATE TYPE "master_data"."PartyRoleKind" AS ENUM ('MATERIAL_SUPPLIER', 'WORK_VENDOR');

-- CreateEnum
CREATE TYPE "master_data"."LinkKind" AS ENUM ('WEBSITE', 'INSTAGRAM', 'FACEBOOK', 'TIKTOK', 'YOUTUBE', 'LINKEDIN', 'WHATSAPP', 'MARKETPLACE', 'DRIVE', 'CATALOG', 'PRICE_LIST', 'OTHER');

-- CreateEnum
CREATE TYPE "master_data"."UnitUsage" AS ENUM ('DIMENSION', 'QUANTITY', 'USAGE', 'PURCHASE', 'RATE');

-- CreateEnum
CREATE TYPE "master_data"."SkuKind" AS ENUM ('MATERIAL', 'FURNITURE', 'FIXTURE');

-- CreateEnum
CREATE TYPE "master_data"."SkuStatus" AS ENUM ('DRAFT', 'ACTIVE', 'DISCONTINUED');

-- CreateEnum
CREATE TYPE "master_data"."MediaKind" AS ENUM ('IMAGE', 'THUMBNAIL', 'ORIGINAL', 'REFERENCE', 'FOLDER');

-- CreateEnum
CREATE TYPE "master_data"."WorkPriceKind" AS ENUM ('MATERIAL_LABOR', 'LABOR_ONLY');

-- CreateTable
CREATE TABLE "master_data"."Unit" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "symbol" TEXT,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "usages" "master_data"."UnitUsage"[] DEFAULT ARRAY[]::"master_data"."UnitUsage"[],
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_data"."BusinessType" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "BusinessType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_data"."Party" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" "master_data"."PartyType" NOT NULL,
    "legal_name" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "Party_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_data"."PartyRole" (
    "id" TEXT NOT NULL,
    "party_id" TEXT NOT NULL,
    "role" "master_data"."PartyRoleKind" NOT NULL,

    CONSTRAINT "PartyRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_data"."PartyBusinessType" (
    "id" TEXT NOT NULL,
    "party_id" TEXT NOT NULL,
    "business_type_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartyBusinessType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_data"."PartyContact" (
    "id" TEXT NOT NULL,
    "party_id" TEXT NOT NULL,
    "person_name" TEXT NOT NULL,
    "job_title" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "brand_id" TEXT,

    CONSTRAINT "PartyContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_data"."PartyLink" (
    "id" TEXT NOT NULL,
    "party_id" TEXT NOT NULL,
    "kind" "master_data"."LinkKind" NOT NULL,
    "url" TEXT NOT NULL,
    "archive_url" TEXT,
    "label" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PartyLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_data"."Brand" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "owner_party_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_data"."BrandLink" (
    "id" TEXT NOT NULL,
    "brand_id" TEXT NOT NULL,
    "kind" "master_data"."LinkKind" NOT NULL,
    "url" TEXT NOT NULL,
    "archive_url" TEXT,
    "label" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BrandLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_data"."BrandSupplier" (
    "id" TEXT NOT NULL,
    "brand_id" TEXT NOT NULL,
    "party_id" TEXT NOT NULL,
    "is_authorized" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,

    CONSTRAINT "BrandSupplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_data"."Category" (
    "id" TEXT NOT NULL,
    "kind" "master_data"."CategoryKind" NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "parent_id" TEXT,
    "path" TEXT,
    "search_synonyms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_data"."BrandCategory" (
    "id" TEXT NOT NULL,
    "brand_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_data"."Sku" (
    "id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "brand_id" TEXT,
    "category_id" TEXT,
    "kind" "master_data"."SkuKind" NOT NULL,
    "status" "master_data"."SkuStatus" NOT NULL DEFAULT 'DRAFT',
    "spec" JSONB,
    "dim_length" DECIMAL(12,3),
    "dim_width" DECIMAL(12,3),
    "dim_height" DECIMAL(12,3),
    "dim_unit_id" TEXT,
    "dim_display" TEXT,
    "base_unit_id" TEXT NOT NULL,
    "purchase_unit_id" TEXT,
    "conversion" DECIMAL(18,6),
    "default_waste_pct" DECIMAL(9,6),
    "minimum_order" DECIMAL(18,6),
    "rounding_increment" DECIMAL(18,6),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "Sku_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_data"."SkuMedia" (
    "id" TEXT NOT NULL,
    "sku_id" TEXT NOT NULL,
    "kind" "master_data"."MediaKind" NOT NULL,
    "url" TEXT NOT NULL,
    "label" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkuMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_data"."SkuPrice" (
    "id" TEXT NOT NULL,
    "sku_id" TEXT NOT NULL,
    "supplier_party_id" TEXT,
    "amount" DECIMAL(16,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "source_link_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "updated_by_label" TEXT NOT NULL,

    CONSTRAINT "SkuPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_data"."WorkPrice" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "vendor_party_id" TEXT,
    "spec" JSONB,
    "dim_display" TEXT,
    "unit_id" TEXT NOT NULL,
    "amount" DECIMAL(16,2) NOT NULL,
    "kind" "master_data"."WorkPriceKind" NOT NULL,
    "currency" TEXT NOT NULL,
    "scope_note" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "updated_by_user_id" TEXT,
    "updated_by_label" TEXT NOT NULL,

    CONSTRAINT "WorkPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."AuditEvent" (
    "id" TEXT NOT NULL,
    "app_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "actor_kind" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "actor_label" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "request_id" TEXT,
    "changes" JSONB,
    "metadata" JSONB,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Unit_code_key" ON "master_data"."Unit"("code");

-- CreateIndex
CREATE INDEX "Unit_deleted_at_idx" ON "master_data"."Unit"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessType_code_key" ON "master_data"."BusinessType"("code");

-- CreateIndex
CREATE INDEX "BusinessType_deleted_at_idx" ON "master_data"."BusinessType"("deleted_at");

-- CreateIndex
CREATE INDEX "Party_slug_idx" ON "master_data"."Party"("slug");

-- CreateIndex
CREATE INDEX "Party_type_idx" ON "master_data"."Party"("type");

-- CreateIndex
CREATE INDEX "Party_deleted_at_idx" ON "master_data"."Party"("deleted_at");

-- CreateIndex
CREATE INDEX "PartyRole_role_idx" ON "master_data"."PartyRole"("role");

-- CreateIndex
CREATE UNIQUE INDEX "PartyRole_party_id_role_key" ON "master_data"."PartyRole"("party_id", "role");

-- CreateIndex
CREATE INDEX "PartyBusinessType_business_type_id_idx" ON "master_data"."PartyBusinessType"("business_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "PartyBusinessType_party_id_business_type_id_key" ON "master_data"."PartyBusinessType"("party_id", "business_type_id");

-- CreateIndex
CREATE INDEX "PartyContact_party_id_idx" ON "master_data"."PartyContact"("party_id");

-- CreateIndex
CREATE INDEX "PartyContact_brand_id_idx" ON "master_data"."PartyContact"("brand_id");

-- CreateIndex
CREATE INDEX "PartyLink_party_id_kind_idx" ON "master_data"."PartyLink"("party_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "PartyLink_party_id_url_key" ON "master_data"."PartyLink"("party_id", "url");

-- CreateIndex
CREATE INDEX "Brand_slug_idx" ON "master_data"."Brand"("slug");

-- CreateIndex
CREATE INDEX "Brand_owner_party_id_idx" ON "master_data"."Brand"("owner_party_id");

-- CreateIndex
CREATE INDEX "Brand_deleted_at_idx" ON "master_data"."Brand"("deleted_at");

-- CreateIndex
CREATE INDEX "BrandLink_brand_id_kind_idx" ON "master_data"."BrandLink"("brand_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "BrandLink_brand_id_url_key" ON "master_data"."BrandLink"("brand_id", "url");

-- CreateIndex
CREATE INDEX "BrandSupplier_party_id_idx" ON "master_data"."BrandSupplier"("party_id");

-- CreateIndex
CREATE UNIQUE INDEX "BrandSupplier_brand_id_party_id_key" ON "master_data"."BrandSupplier"("brand_id", "party_id");

-- CreateIndex
CREATE INDEX "Category_kind_slug_idx" ON "master_data"."Category"("kind", "slug");

-- CreateIndex
CREATE INDEX "Category_kind_parent_id_sort_order_idx" ON "master_data"."Category"("kind", "parent_id", "sort_order");

-- CreateIndex
CREATE INDEX "Category_path_idx" ON "master_data"."Category"("path");

-- CreateIndex
CREATE INDEX "Category_deleted_at_idx" ON "master_data"."Category"("deleted_at");

-- CreateIndex
CREATE INDEX "BrandCategory_category_id_idx" ON "master_data"."BrandCategory"("category_id");

-- CreateIndex
CREATE INDEX "BrandCategory_brand_id_sort_order_idx" ON "master_data"."BrandCategory"("brand_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "BrandCategory_brand_id_category_id_key" ON "master_data"."BrandCategory"("brand_id", "category_id");

-- CreateIndex
CREATE INDEX "Sku_brand_id_idx" ON "master_data"."Sku"("brand_id");

-- CreateIndex
CREATE INDEX "Sku_category_id_idx" ON "master_data"."Sku"("category_id");

-- CreateIndex
CREATE INDEX "Sku_base_unit_id_idx" ON "master_data"."Sku"("base_unit_id");

-- CreateIndex
CREATE INDEX "Sku_kind_status_idx" ON "master_data"."Sku"("kind", "status");

-- CreateIndex
CREATE INDEX "Sku_deleted_at_idx" ON "master_data"."Sku"("deleted_at");

-- CreateIndex
CREATE INDEX "SkuMedia_sku_id_kind_sort_order_idx" ON "master_data"."SkuMedia"("sku_id", "kind", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "SkuMedia_sku_id_url_key" ON "master_data"."SkuMedia"("sku_id", "url");

-- CreateIndex
CREATE UNIQUE INDEX "SkuPrice_sku_id_key" ON "master_data"."SkuPrice"("sku_id");

-- CreateIndex
CREATE INDEX "SkuPrice_supplier_party_id_idx" ON "master_data"."SkuPrice"("supplier_party_id");

-- CreateIndex
CREATE INDEX "WorkPrice_category_id_idx" ON "master_data"."WorkPrice"("category_id");

-- CreateIndex
CREATE INDEX "WorkPrice_vendor_party_id_idx" ON "master_data"."WorkPrice"("vendor_party_id");

-- CreateIndex
CREATE INDEX "WorkPrice_kind_idx" ON "master_data"."WorkPrice"("kind");

-- CreateIndex
CREATE INDEX "WorkPrice_deleted_at_idx" ON "master_data"."WorkPrice"("deleted_at");

-- CreateIndex
CREATE INDEX "AuditEvent_app_id_entity_type_entity_id_occurred_at_idx" ON "platform"."AuditEvent"("app_id", "entity_type", "entity_id", "occurred_at");

-- CreateIndex
CREATE INDEX "AuditEvent_actor_user_id_occurred_at_idx" ON "platform"."AuditEvent"("actor_user_id", "occurred_at");

-- CreateIndex
CREATE INDEX "AuditEvent_occurred_at_idx" ON "platform"."AuditEvent"("occurred_at");

-- AddForeignKey
ALTER TABLE "master_data"."PartyRole" ADD CONSTRAINT "PartyRole_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "master_data"."Party"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_data"."PartyBusinessType" ADD CONSTRAINT "PartyBusinessType_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "master_data"."Party"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_data"."PartyBusinessType" ADD CONSTRAINT "PartyBusinessType_business_type_id_fkey" FOREIGN KEY ("business_type_id") REFERENCES "master_data"."BusinessType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_data"."PartyContact" ADD CONSTRAINT "PartyContact_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "master_data"."Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_data"."PartyContact" ADD CONSTRAINT "PartyContact_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "master_data"."Party"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_data"."PartyLink" ADD CONSTRAINT "PartyLink_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "master_data"."Party"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_data"."Brand" ADD CONSTRAINT "Brand_owner_party_id_fkey" FOREIGN KEY ("owner_party_id") REFERENCES "master_data"."Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_data"."BrandLink" ADD CONSTRAINT "BrandLink_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "master_data"."Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_data"."BrandSupplier" ADD CONSTRAINT "BrandSupplier_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "master_data"."Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_data"."BrandSupplier" ADD CONSTRAINT "BrandSupplier_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "master_data"."Party"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_data"."Category" ADD CONSTRAINT "Category_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "master_data"."Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_data"."BrandCategory" ADD CONSTRAINT "BrandCategory_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "master_data"."Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_data"."BrandCategory" ADD CONSTRAINT "BrandCategory_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "master_data"."Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_data"."Sku" ADD CONSTRAINT "Sku_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "master_data"."Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_data"."Sku" ADD CONSTRAINT "Sku_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "master_data"."Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_data"."Sku" ADD CONSTRAINT "Sku_dim_unit_id_fkey" FOREIGN KEY ("dim_unit_id") REFERENCES "master_data"."Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_data"."Sku" ADD CONSTRAINT "Sku_base_unit_id_fkey" FOREIGN KEY ("base_unit_id") REFERENCES "master_data"."Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_data"."Sku" ADD CONSTRAINT "Sku_purchase_unit_id_fkey" FOREIGN KEY ("purchase_unit_id") REFERENCES "master_data"."Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_data"."SkuMedia" ADD CONSTRAINT "SkuMedia_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "master_data"."Sku"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_data"."SkuPrice" ADD CONSTRAINT "SkuPrice_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "master_data"."Sku"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_data"."SkuPrice" ADD CONSTRAINT "SkuPrice_supplier_party_id_fkey" FOREIGN KEY ("supplier_party_id") REFERENCES "master_data"."Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_data"."SkuPrice" ADD CONSTRAINT "SkuPrice_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "master_data"."Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_data"."SkuPrice" ADD CONSTRAINT "SkuPrice_source_link_id_fkey" FOREIGN KEY ("source_link_id") REFERENCES "master_data"."BrandLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_data"."WorkPrice" ADD CONSTRAINT "WorkPrice_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "master_data"."Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_data"."WorkPrice" ADD CONSTRAINT "WorkPrice_vendor_party_id_fkey" FOREIGN KEY ("vendor_party_id") REFERENCES "master_data"."Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_data"."WorkPrice" ADD CONSTRAINT "WorkPrice_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "master_data"."Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- Live-identity partial/expression unique indexes (MASTER_DATA.md Â§3).
-- Prisma cannot express partial or expression unique indexes; these are the
-- race-safe database authority for live uniqueness while allowing soft-deleted
-- rows to release their identity for reuse.
-- ============================================================================

-- Live Party: unique lower(name) and unique slug where deleted_at IS NULL.
CREATE UNIQUE INDEX "Party_live_name_uniq" ON "master_data"."Party"(lower("name")) WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "Party_live_slug_uniq" ON "master_data"."Party"("slug") WHERE "deleted_at" IS NULL;

-- Live Brand: unique lower(name) and unique slug where deleted_at IS NULL.
CREATE UNIQUE INDEX "Brand_live_name_uniq" ON "master_data"."Brand"(lower("name")) WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "Brand_live_slug_uniq" ON "master_data"."Brand"("slug") WHERE "deleted_at" IS NULL;

-- Category: partial unique (kind, slug) where deleted_at IS NULL (docs/06 Â§Category).
CREATE UNIQUE INDEX "Category_kind_slug_live_uniq" ON "master_data"."Category"("kind", "slug") WHERE "deleted_at" IS NULL;

-- Live branded SKU: unique (brand_id, lower(slug)); live unbranded SKU: unique lower(slug).
CREATE UNIQUE INDEX "Sku_brand_slug_live_uniq" ON "master_data"."Sku"("brand_id", lower("slug")) WHERE "deleted_at" IS NULL AND "brand_id" IS NOT NULL;
CREATE UNIQUE INDEX "Sku_slug_nobrand_live_uniq" ON "master_data"."Sku"(lower("slug")) WHERE "deleted_at" IS NULL AND "brand_id" IS NULL;

-- Non-null live SKU code: unique case-insensitively within its Brand, with the
-- equivalent unbranded partial index.
CREATE UNIQUE INDEX "Sku_brand_code_live_uniq" ON "master_data"."Sku"("brand_id", lower("code")) WHERE "deleted_at" IS NULL AND "code" IS NOT NULL AND "brand_id" IS NOT NULL;
CREATE UNIQUE INDEX "Sku_code_nobrand_live_uniq" ON "master_data"."Sku"(lower("code")) WHERE "deleted_at" IS NULL AND "code" IS NOT NULL AND "brand_id" IS NULL;

-- Live WorkPrice: unique case-insensitive code where deleted_at IS NULL.
CREATE UNIQUE INDEX "WorkPrice_live_code_uniq" ON "master_data"."WorkPrice"(lower("code")) WHERE "deleted_at" IS NULL;
