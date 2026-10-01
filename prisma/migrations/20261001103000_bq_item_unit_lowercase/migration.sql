-- Completes 20261001100000_masterdata_lowercase_unit_codes: BqItem.unit is the one BQ unit column that migration
-- missed. Same rule: only a value that equals a current Master Data unit code (ignoring case) is lowercased; free-typed
-- text is left alone. Case-only change, meaning preserved.
UPDATE "bq"."bq_item" r SET "unit" = lower(r."unit")
WHERE EXISTS (SELECT 1 FROM "master_data"."Unit" u WHERE lower(u."code") = lower(r."unit")) AND r."unit" <> lower(r."unit");
