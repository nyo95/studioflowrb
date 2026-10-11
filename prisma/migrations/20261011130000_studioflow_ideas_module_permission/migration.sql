-- Ideas used to inherit studioflow.access. Give every existing StudioFlow
-- role the explicit module grant so enabling this permission boundary does
-- not change current user behaviour.
INSERT INTO "platform"."RolePermission" ("id", "role_id", "permission_id", "granted_at")
SELECT
  md5(rp."role_id" || ':studioflow.ideas.manage')::uuid,
  rp."role_id",
  'studioflow.ideas.manage',
  CURRENT_TIMESTAMP
FROM "platform"."RolePermission" AS rp
WHERE rp."permission_id" = 'studioflow.access'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
