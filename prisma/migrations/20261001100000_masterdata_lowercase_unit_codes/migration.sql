-- Unit codes are canonical lowercase.  Stop before rewriting when two existing
-- rows would collapse onto the same unique code.
DO $$
DECLARE duplicate_count integer;
BEGIN
  SELECT count(*) INTO duplicate_count
  FROM (
    SELECT lower("code")
    FROM "master_data"."Unit"
    GROUP BY lower("code")
    HAVING count(*) > 1
  ) duplicates;
  IF duplicate_count > 0 THEN
    RAISE EXCEPTION 'Cannot lowercase Unit codes: % colliding lowercase code group(s) found.', duplicate_count;
  END IF;
  RAISE NOTICE 'Unit lowercase pre-check passed: no colliding code groups.';
END $$;

UPDATE "master_data"."Unit" SET "code" = lower("code") WHERE "code" <> lower("code");

-- Snapshot/plain text values only change when they denote a current Master Data
-- unit. Free-typed values deliberately remain untouched.
UPDATE "bq"."bq_lib_material" r SET "purchase_unit" = lower(r."purchase_unit")
WHERE EXISTS (SELECT 1 FROM "master_data"."Unit" u WHERE lower(u."code") = lower(r."purchase_unit")) AND r."purchase_unit" <> lower(r."purchase_unit");
UPDATE "bq"."bq_lib_material" r SET "base_unit" = lower(r."base_unit")
WHERE r."base_unit" IS NOT NULL AND EXISTS (SELECT 1 FROM "master_data"."Unit" u WHERE lower(u."code") = lower(r."base_unit")) AND r."base_unit" <> lower(r."base_unit");
UPDATE "bq"."bq_lib_labor" r SET "purchase_unit" = lower(r."purchase_unit")
WHERE EXISTS (SELECT 1 FROM "master_data"."Unit" u WHERE lower(u."code") = lower(r."purchase_unit")) AND r."purchase_unit" <> lower(r."purchase_unit");
UPDATE "bq"."bq_lib_labor" r SET "base_unit" = lower(r."base_unit")
WHERE r."base_unit" IS NOT NULL AND EXISTS (SELECT 1 FROM "master_data"."Unit" u WHERE lower(u."code") = lower(r."base_unit")) AND r."base_unit" <> lower(r."base_unit");
UPDATE "bq"."bq_lib_material_labor" r SET "purchase_unit" = lower(r."purchase_unit")
WHERE EXISTS (SELECT 1 FROM "master_data"."Unit" u WHERE lower(u."code") = lower(r."purchase_unit")) AND r."purchase_unit" <> lower(r."purchase_unit");
UPDATE "bq"."bq_lib_material_labor" r SET "base_unit" = lower(r."base_unit")
WHERE r."base_unit" IS NOT NULL AND EXISTS (SELECT 1 FROM "master_data"."Unit" u WHERE lower(u."code") = lower(r."base_unit")) AND r."base_unit" <> lower(r."base_unit");
UPDATE "bq"."bq_lib_custom_item" r SET "purchase_unit" = lower(r."purchase_unit")
WHERE EXISTS (SELECT 1 FROM "master_data"."Unit" u WHERE lower(u."code") = lower(r."purchase_unit")) AND r."purchase_unit" <> lower(r."purchase_unit");
UPDATE "bq"."bq_assembly_line" r SET "purchase_unit_snapshot" = lower(r."purchase_unit_snapshot")
WHERE EXISTS (SELECT 1 FROM "master_data"."Unit" u WHERE lower(u."code") = lower(r."purchase_unit_snapshot")) AND r."purchase_unit_snapshot" <> lower(r."purchase_unit_snapshot");
UPDATE "bq"."bq_assembly_line" r SET "base_unit_snapshot" = lower(r."base_unit_snapshot")
WHERE r."base_unit_snapshot" IS NOT NULL AND EXISTS (SELECT 1 FROM "master_data"."Unit" u WHERE lower(u."code") = lower(r."base_unit_snapshot")) AND r."base_unit_snapshot" <> lower(r."base_unit_snapshot");
UPDATE "bq"."bq_line_item" r SET "purchase_unit_snapshot" = lower(r."purchase_unit_snapshot")
WHERE EXISTS (SELECT 1 FROM "master_data"."Unit" u WHERE lower(u."code") = lower(r."purchase_unit_snapshot")) AND r."purchase_unit_snapshot" <> lower(r."purchase_unit_snapshot");
UPDATE "bq"."bq_line_item" r SET "base_unit_snapshot" = lower(r."base_unit_snapshot")
WHERE r."base_unit_snapshot" IS NOT NULL AND EXISTS (SELECT 1 FROM "master_data"."Unit" u WHERE lower(u."code") = lower(r."base_unit_snapshot")) AND r."base_unit_snapshot" <> lower(r."base_unit_snapshot");
UPDATE "studioflow"."sf_schedule_template_item" r SET "unit" = lower(r."unit")
WHERE r."unit" IS NOT NULL AND EXISTS (SELECT 1 FROM "master_data"."Unit" u WHERE lower(u."code") = lower(r."unit")) AND r."unit" <> lower(r."unit");
UPDATE "studioflow"."sf_schedule_entry" r SET "unit" = lower(r."unit")
WHERE r."unit" IS NOT NULL AND EXISTS (SELECT 1 FROM "master_data"."Unit" u WHERE lower(u."code") = lower(r."unit")) AND r."unit" <> lower(r."unit");

ALTER TABLE "master_data"."Unit"
  ADD CONSTRAINT "Unit_code_lowercase_check" CHECK ("code" = lower("code"));
