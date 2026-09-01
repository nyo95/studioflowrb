-- R4.01: Contract alignment — schema gaps from brand-contract.md §4.2, vendor-contract.md §4/5/2/6.2, pricing-contract.md §2/3/4
-- Applies to: BrandSupplier, VendorContact, VendorLink, VendorType + partial unique indexes

-- ============================================================================
-- VendorContact: rename name→person_name, position→job_title, add is_primary
-- ============================================================================
ALTER TABLE "master_data"."VendorContact" RENAME COLUMN "name" TO "person_name";
ALTER TABLE "master_data"."VendorContact" RENAME COLUMN "position" TO "job_title";
ALTER TABLE "master_data"."VendorContact" ADD COLUMN "is_primary" BOOLEAN NOT NULL DEFAULT false;

-- VendorContact.vendor_id FK: Restrict → Cascade (children follow soft-deleted parent on hard delete)
ALTER TABLE "master_data"."VendorContact" DROP CONSTRAINT "VendorContact_vendor_id_fkey";
ALTER TABLE "master_data"."VendorContact" ADD CONSTRAINT "VendorContact_vendor_id_fkey"
  FOREIGN KEY ("vendor_id") REFERENCES "master_data"."Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- VendorType: add sort_order
-- ============================================================================
ALTER TABLE "master_data"."VendorType" ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0;

-- Seed sort_order for the 6 canonical VendorType records
UPDATE "master_data"."VendorType" SET "sort_order" = 1 WHERE "code" = 'SUPPLIER';
UPDATE "master_data"."VendorType" SET "sort_order" = 2 WHERE "code" = 'DISTRIBUTOR';
UPDATE "master_data"."VendorType" SET "sort_order" = 3 WHERE "code" = 'STORE';
UPDATE "master_data"."VendorType" SET "sort_order" = 4 WHERE "code" = 'FACTORY';
UPDATE "master_data"."VendorType" SET "sort_order" = 5 WHERE "code" = 'SUBCON';
UPDATE "master_data"."VendorType" SET "sort_order" = 6 WHERE "code" = 'SERVICE';

-- ============================================================================
-- VendorLink: add archive_url, sort_order; FK Restrict → Cascade
-- ============================================================================
ALTER TABLE "master_data"."VendorLink" ADD COLUMN "archive_url" TEXT;
ALTER TABLE "master_data"."VendorLink" ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "master_data"."VendorLink" DROP CONSTRAINT "VendorLink_vendor_id_fkey";
ALTER TABLE "master_data"."VendorLink" ADD CONSTRAINT "VendorLink_vendor_id_fkey"
  FOREIGN KEY ("vendor_id") REFERENCES "master_data"."Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- BrandSupplier: add is_authorized, notes
-- ============================================================================
ALTER TABLE "master_data"."BrandSupplier" ADD COLUMN "is_authorized" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "master_data"."BrandSupplier" ADD COLUMN "notes" TEXT;

-- ============================================================================
-- Partial unique indexes (contract §§ — enforces live-record uniqueness)
-- ============================================================================

-- Brand: case-insensitive unique name and slug among live (non-deleted) records
CREATE UNIQUE INDEX "Brand_name_live_unique"
  ON "master_data"."Brand" (lower("name"))
  WHERE "deleted_at" IS NULL;

CREATE UNIQUE INDEX "Brand_slug_live_unique"
  ON "master_data"."Brand" (lower("slug"))
  WHERE "deleted_at" IS NULL;

-- Vendor: case-insensitive unique name and slug among live records
CREATE UNIQUE INDEX "Vendor_name_live_unique"
  ON "master_data"."Vendor" (lower("name"))
  WHERE "deleted_at" IS NULL;

CREATE UNIQUE INDEX "Vendor_slug_live_unique"
  ON "master_data"."Vendor" (lower("slug"))
  WHERE "deleted_at" IS NULL;

-- PriceMaterial: one live price per (sku, supplier) pair
CREATE UNIQUE INDEX "PriceMaterial_sku_vendor_live_unique"
  ON "master_data"."PriceMaterial" ("sku_id", "supplier_vendor_id")
  WHERE "deleted_at" IS NULL;

-- PriceMaterialLabor: unique live name per vendor (case-insensitive)
CREATE UNIQUE INDEX "PriceMaterialLabor_vendor_name_live_unique"
  ON "master_data"."PriceMaterialLabor" ("vendor_id", lower("name"))
  WHERE "deleted_at" IS NULL;

-- PriceLabor: unique live name per vendor (case-insensitive)
CREATE UNIQUE INDEX "PriceLabor_vendor_name_live_unique"
  ON "master_data"."PriceLabor" ("vendor_id", lower("name"))
  WHERE "deleted_at" IS NULL;
