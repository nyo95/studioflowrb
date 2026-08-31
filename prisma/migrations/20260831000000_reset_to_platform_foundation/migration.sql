-- R1.06 permanently retires every pre-contract application persistence surface.
-- The owner explicitly authorized discarding all Master Data, StudioFlow, and BQ
-- data and rebuilding those applications from approved contracts. Historical
-- migration files remain immutable so a fresh database can replay the published
-- sequence before this intentional reset.

DELETE FROM "platform"."RolePermission"
WHERE "permission_id" LIKE 'masterdata.%'
   OR "permission_id" LIKE 'studioflow.%'
   OR "permission_id" LIKE 'bq.%';

DROP SCHEMA IF EXISTS "master_data" CASCADE;
DROP SCHEMA IF EXISTS "studioflow" CASCADE;
DROP SCHEMA IF EXISTS "bq" CASCADE;
