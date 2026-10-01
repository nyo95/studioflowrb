-- R8.266 — Master Data scalar, lifecycle, and FK-index hardening.
-- Every guard is preceded by a count so an unexpected local dataset stops
-- clearly rather than being silently rewritten.
-- Supplier categories ceased to exist in the preceding merge migration.
-- Remove their historical polymorphic rows before closing the registry; the
-- append-only AuditEvent trail retains the recorded business history.
DO $$
DECLARE deletion_requests bigint; archive_causes bigint;
BEGIN
  DELETE FROM "master_data"."DeletionRequest" WHERE "target_type" = 'supplier_category';
  GET DIAGNOSTICS deletion_requests = ROW_COUNT;
  DELETE FROM "master_data"."ArchiveCause" WHERE "entity_type" = 'supplier_category' OR "parent_type" = 'supplier_category';
  GET DIAGNOSTICS archive_causes = ROW_COUNT;
  RAISE NOTICE 'master_data supplier_category cleanup deleted % DeletionRequest row(s) and % ArchiveCause row(s)', deletion_requests, archive_causes;
END $$;

DO $$
DECLARE violations bigint;
BEGIN
  SELECT count(*) INTO violations FROM (
    SELECT 1 FROM "master_data"."PriceMaterial" WHERE "amount" < 0 OR "currency" !~ '^[A-Z]{3}$'
    UNION ALL SELECT 1 FROM "master_data"."PriceMaterialLabor" WHERE "amount" < 0 OR "currency" !~ '^[A-Z]{3}$'
    UNION ALL SELECT 1 FROM "master_data"."PriceLabor" WHERE "amount" < 0 OR "currency" !~ '^[A-Z]{3}$'
  ) invalid_prices;
  IF violations > 0 THEN RAISE EXCEPTION 'master_data price scalar rule has % violating row(s)', violations; END IF;
END $$;

DO $$
DECLARE violations bigint;
BEGIN
  SELECT count(*) INTO violations FROM "master_data"."DeletionRequest"
  WHERE "target_type" NOT IN ('brand', 'vendor', 'sku', 'unit', 'category', 'vendor_type', 'price_material', 'price_material_labor', 'price_labor');
  IF violations > 0 THEN RAISE EXCEPTION 'master_data DeletionRequest target_type rule has % violating row(s)', violations; END IF;
END $$;

DO $$
DECLARE violations bigint;
BEGIN
  SELECT count(*) INTO violations FROM "master_data"."ArchiveCause"
  WHERE "entity_type" NOT IN ('brand', 'vendor', 'sku', 'unit', 'category', 'vendor_type', 'price_material', 'price_material_labor', 'price_labor')
     OR ("parent_type" IS NOT NULL AND "parent_type" NOT IN ('brand', 'vendor', 'sku', 'unit', 'category', 'vendor_type', 'price_material', 'price_material_labor', 'price_labor'))
     OR ("kind" = 'DIRECT' AND ("parent_type" IS NOT NULL OR "parent_id" IS NOT NULL))
     OR ("kind" = 'PARENT' AND ("parent_type" IS NULL OR "parent_id" IS NULL));
  IF violations > 0 THEN RAISE EXCEPTION 'master_data ArchiveCause type/shape rule has % violating row(s)', violations; END IF;
END $$;

DO $$
DECLARE violations bigint;
BEGIN
  SELECT count(*) INTO violations FROM (
    SELECT "entity_type", "entity_id" FROM "master_data"."ArchiveCause" WHERE "kind" = 'DIRECT' GROUP BY 1, 2 HAVING count(*) > 1
  ) duplicate_direct_causes;
  IF violations > 0 THEN RAISE EXCEPTION 'master_data ArchiveCause DIRECT uniqueness rule has % duplicate group(s)', violations; END IF;
END $$;

DO $$
DECLARE existing_indexes bigint;
BEGIN
  SELECT count(*) INTO existing_indexes FROM pg_indexes WHERE schemaname = 'master_data' AND indexname IN (
    'PriceLabor_unit_id_idx', 'PriceMaterial_source_link_id_idx', 'PriceMaterial_unit_id_idx',
    'PriceMaterialLabor_unit_id_idx', 'Sku_base_unit_id_idx', 'Sku_purchase_unit_id_idx'
  );
  IF existing_indexes NOT IN (0, 6) THEN RAISE EXCEPTION 'master_data FK index pre-check found % of 6 expected indexes', existing_indexes; END IF;
END $$;

ALTER TABLE "master_data"."PriceMaterial"
  ADD CONSTRAINT "PriceMaterial_amount_nonnegative_check" CHECK ("amount" >= 0),
  ADD CONSTRAINT "PriceMaterial_currency_format_check" CHECK ("currency" ~ '^[A-Z]{3}$');
ALTER TABLE "master_data"."PriceMaterialLabor"
  ADD CONSTRAINT "PriceMaterialLabor_amount_nonnegative_check" CHECK ("amount" >= 0),
  ADD CONSTRAINT "PriceMaterialLabor_currency_format_check" CHECK ("currency" ~ '^[A-Z]{3}$');
ALTER TABLE "master_data"."PriceLabor"
  ADD CONSTRAINT "PriceLabor_amount_nonnegative_check" CHECK ("amount" >= 0),
  ADD CONSTRAINT "PriceLabor_currency_format_check" CHECK ("currency" ~ '^[A-Z]{3}$');
ALTER TABLE "master_data"."DeletionRequest"
  ADD CONSTRAINT "DeletionRequest_target_type_check" CHECK ("target_type" IN ('brand', 'vendor', 'sku', 'unit', 'category', 'vendor_type', 'price_material', 'price_material_labor', 'price_labor'));
ALTER TABLE "master_data"."ArchiveCause"
  ADD CONSTRAINT "ArchiveCause_entity_type_check" CHECK ("entity_type" IN ('brand', 'vendor', 'sku', 'unit', 'category', 'vendor_type', 'price_material', 'price_material_labor', 'price_labor')),
  ADD CONSTRAINT "ArchiveCause_parent_type_check" CHECK ("parent_type" IS NULL OR "parent_type" IN ('brand', 'vendor', 'sku', 'unit', 'category', 'vendor_type', 'price_material', 'price_material_labor', 'price_labor')),
  ADD CONSTRAINT "ArchiveCause_kind_parent_shape_check" CHECK (("kind" = 'DIRECT' AND "parent_type" IS NULL AND "parent_id" IS NULL) OR ("kind" = 'PARENT' AND "parent_type" IS NOT NULL AND "parent_id" IS NOT NULL));

CREATE UNIQUE INDEX "ArchiveCause_direct_entity_unique" ON "master_data"."ArchiveCause" ("entity_type", "entity_id") WHERE "kind" = 'DIRECT';
CREATE UNIQUE INDEX "ArchiveCause_parent_entity_unique" ON "master_data"."ArchiveCause" ("entity_type", "entity_id", "parent_type", "parent_id") WHERE "kind" = 'PARENT';

CREATE INDEX "PriceLabor_unit_id_idx" ON "master_data"."PriceLabor" ("unit_id");
CREATE INDEX "PriceMaterial_source_link_id_idx" ON "master_data"."PriceMaterial" ("source_link_id");
CREATE INDEX "PriceMaterial_unit_id_idx" ON "master_data"."PriceMaterial" ("unit_id");
CREATE INDEX "PriceMaterialLabor_unit_id_idx" ON "master_data"."PriceMaterialLabor" ("unit_id");
CREATE INDEX "Sku_base_unit_id_idx" ON "master_data"."Sku" ("base_unit_id");
CREATE INDEX "Sku_purchase_unit_id_idx" ON "master_data"."Sku" ("purchase_unit_id");
