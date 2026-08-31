-- Curated VendorType vocabulary from vendor-contract.md §2.5.
INSERT INTO "master_data"."VendorType"
  ("id", "code", "name", "can_supply_material", "can_supply_labor", "created_at", "updated_at")
VALUES
  (gen_random_uuid(), 'SUPPLIER', 'Supplier', true, false, now(), now()),
  (gen_random_uuid(), 'DISTRIBUTOR', 'Distributor', true, false, now(), now()),
  (gen_random_uuid(), 'STORE', 'Store', true, false, now(), now()),
  (gen_random_uuid(), 'FACTORY', 'Factory', true, false, now(), now()),
  (gen_random_uuid(), 'SUBCON', 'Subcon', true, true, now(), now()),
  (gen_random_uuid(), 'SERVICE', 'Service', false, true, now(), now())
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "can_supply_material" = EXCLUDED."can_supply_material",
  "can_supply_labor" = EXCLUDED."can_supply_labor",
  "deleted_at" = NULL;

-- Operational dictionary seed required by material and work pricing.
INSERT INTO "master_data"."Unit" ("id", "code", "name", "created_at", "updated_at")
VALUES
  (gen_random_uuid(), 'PCS', 'Piece', now(), now()),
  (gen_random_uuid(), 'SET', 'Set', now(), now()),
  (gen_random_uuid(), 'M', 'Meter', now(), now()),
  (gen_random_uuid(), 'M2', 'Square meter', now(), now()),
  (gen_random_uuid(), 'M3', 'Cubic meter', now(), now()),
  (gen_random_uuid(), 'KG', 'Kilogram', now(), now()),
  (gen_random_uuid(), 'POINT', 'Point', now(), now()),
  (gen_random_uuid(), 'DAY', 'Day', now(), now())
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "status" = 'ACTIVE',
  "archived_at" = NULL;
