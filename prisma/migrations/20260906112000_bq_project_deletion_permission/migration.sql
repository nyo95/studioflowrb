-- Permission identifiers follow <owner>.<resource>.<action>; replace the early
-- four-segment spelling before granting the approval capability.
DELETE FROM "platform"."RolePermission"
WHERE "permission_id" = 'bq.project.delete.approve';

INSERT INTO "platform"."RolePermission" ("id", "role_id", "permission_id", "granted_at")
SELECT
  md5('system-platform-owner:bq.project-deletion.approve')::uuid,
  role."id",
  'bq.project-deletion.approve',
  CURRENT_TIMESTAMP
FROM "platform"."Role" AS role
WHERE role."code" = 'platform-owner' AND role."is_system" = true
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
