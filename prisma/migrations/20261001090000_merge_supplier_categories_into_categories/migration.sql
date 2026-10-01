-- Merge the free-standing SupplierCategory list into the shared Category list.
-- Every existing supplier category and every supplier assignment is carried over; only the old tables are dropped
-- afterwards. A supplier category whose name already exists as a Category (any kind, case-insensitive) is mapped
-- onto that Category instead of creating a duplicate; otherwise a Category is created, as WORK when it is unassigned
-- or any assigned supplier can provide labor, else PRODUCT. Archived supplier categories become DEACTIVATED.

-- CreateTable
CREATE TABLE "master_data"."VendorCategory" (
    "id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VendorCategory_category_id_idx" ON "master_data"."VendorCategory"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "VendorCategory_vendor_id_category_id_key" ON "master_data"."VendorCategory"("vendor_id", "category_id");

-- AddForeignKey
ALTER TABLE "master_data"."VendorCategory" ADD CONSTRAINT "VendorCategory_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "master_data"."Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_data"."VendorCategory" ADD CONSTRAINT "VendorCategory_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "master_data"."Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Carry the data over.
DO $$
DECLARE
  sc RECORD;
  target_id TEXT;
  target_kind "master_data"."CategoryKind";
  base_slug TEXT;
  final_slug TEXT;
BEGIN
  FOR sc IN SELECT * FROM "master_data"."SupplierCategory" ORDER BY "sort_order", "name" LOOP
    SELECT c."id" INTO target_id
    FROM "master_data"."Category" c
    WHERE lower(c."name") = lower(sc."name") AND c."status" = 'ACTIVE'
    ORDER BY (c."kind" = 'WORK') DESC, c."created_at"
    LIMIT 1;

    IF target_id IS NULL THEN
      IF NOT EXISTS (SELECT 1 FROM "master_data"."VendorSupplierCategory" a WHERE a."supplier_category_id" = sc."id")
         OR EXISTS (
           SELECT 1
           FROM "master_data"."VendorSupplierCategory" a
           JOIN "master_data"."VendorVendorType" vt ON vt."vendor_id" = a."vendor_id"
           JOIN "master_data"."VendorType" t ON t."id" = vt."vendor_type_id"
           WHERE a."supplier_category_id" = sc."id" AND t."can_supply_labor"
         ) THEN
        target_kind := 'WORK';
      ELSE
        target_kind := 'PRODUCT';
      END IF;

      base_slug := trim(both '-' from regexp_replace(lower(sc."name"), '[^a-z0-9]+', '-', 'g'));
      IF base_slug = '' THEN base_slug := 'category'; END IF;
      final_slug := base_slug;
      IF EXISTS (SELECT 1 FROM "master_data"."Category" c WHERE c."kind" = target_kind AND c."slug" = final_slug AND c."status" = 'ACTIVE') THEN
        final_slug := base_slug || '-' || substr(sc."id", 1, 6);
      END IF;

      target_id := gen_random_uuid()::text;
      INSERT INTO "master_data"."Category" ("id", "name", "slug", "kind", "status", "deactivated_at", "created_at", "updated_at")
      VALUES (
        target_id, sc."name", final_slug, target_kind,
        CASE WHEN sc."deleted_at" IS NULL THEN 'ACTIVE'::"master_data"."CategoryStatus" ELSE 'DEACTIVATED'::"master_data"."CategoryStatus" END,
        sc."deleted_at", sc."created_at", CURRENT_TIMESTAMP
      );
    END IF;

    INSERT INTO "master_data"."VendorCategory" ("id", "vendor_id", "category_id", "assigned_at")
    SELECT gen_random_uuid()::text, a."vendor_id", target_id, a."assigned_at"
    FROM "master_data"."VendorSupplierCategory" a
    WHERE a."supplier_category_id" = sc."id"
    ON CONFLICT ("vendor_id", "category_id") DO NOTHING;
  END LOOP;
END $$;

-- Pending deletion requests for supplier categories point at rows that no longer exist; close them with a note.
UPDATE "master_data"."DeletionRequest"
SET "status" = 'REJECTED', "decided_at" = CURRENT_TIMESTAMP, "approver_label" = 'System (category merge)',
    "notes" = COALESCE("notes" || E'\n', '') || 'Closed automatically: supplier categories were merged into categories.'
WHERE "target_type" = 'supplier_category' AND "status" = 'PENDING';

DELETE FROM "master_data"."ArchiveCause" WHERE "entity_type" = 'supplier_category';

-- DropTable
DROP TABLE "master_data"."VendorSupplierCategory";

-- DropTable
DROP TABLE "master_data"."SupplierCategory";
