-- Owner terminology decision (2026-10-11): the highest RBAC role is displayed
-- as Platform Owner. Preserve any independently customized role name.
UPDATE "platform"."Role"
SET "name" = 'Platform Owner', "updated_at" = CURRENT_TIMESTAMP
WHERE "code" = 'platform-owner'
  AND "name" = 'Company Administrator';
