-- Add the exact BQ vocabulary delta to the pre-existing system owner role.
-- This does not overwrite any customized grants or affect non-system roles.
INSERT INTO "platform"."RolePermission" ("id", "role_id", "permission_id", "granted_at")
SELECT
  md5('system-platform-owner:' || permission_delta.permission_id)::uuid,
  role."id",
  permission_delta.permission_id,
  CURRENT_TIMESTAMP
FROM "platform"."Role" AS role
CROSS JOIN (
  VALUES
    ('bq.access'),
    ('bq.project.read'),
    ('bq.project.manage'),
    ('bq.library.read'),
    ('bq.library.manage'),
    ('bq.library.promote'),
    ('bq.library.approve')
) AS permission_delta(permission_id)
WHERE role."code" = 'platform-owner'
  AND role."is_system" = true
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
