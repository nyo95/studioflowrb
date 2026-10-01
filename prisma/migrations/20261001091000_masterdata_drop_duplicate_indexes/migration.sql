-- R8.266 — exact duplicate index cleanup; the curated-schema indexes remain.
DO $$
DECLARE duplicate_indexes bigint;
BEGIN
  SELECT count(*) INTO duplicate_indexes FROM pg_index x JOIN pg_class i ON i.oid = x.indexrelid JOIN pg_namespace n ON n.oid = i.relnamespace
  WHERE n.nspname = 'master_data' AND i.relname IN (
    'Brand_live_name_uniq', 'Brand_name_live_unique', 'Vendor_live_name_uniq', 'Vendor_name_live_unique',
    'Sku_live_brandless_slug_uniq', 'sku_unbranded_live_slug_unique', 'PriceMaterial_live_pair_uniq', 'PriceMaterial_sku_vendor_live_unique',
    'PriceMaterialLabor_live_vendor_name_uniq', 'PriceMaterialLabor_vendor_name_live_unique', 'PriceLabor_live_vendor_name_uniq', 'PriceLabor_vendor_name_live_unique'
  );
  IF duplicate_indexes <> 12 THEN RAISE EXCEPTION 'master_data duplicate-index pre-check expected 12 named indexes, found %', duplicate_indexes; END IF;
END $$;

DROP INDEX "master_data"."Brand_name_live_unique";
DROP INDEX "master_data"."Vendor_name_live_unique";
DROP INDEX "master_data"."sku_unbranded_live_slug_unique";
DROP INDEX "master_data"."PriceMaterial_sku_vendor_live_unique";
DROP INDEX "master_data"."PriceMaterialLabor_vendor_name_live_unique";
DROP INDEX "master_data"."PriceLabor_vendor_name_live_unique";
