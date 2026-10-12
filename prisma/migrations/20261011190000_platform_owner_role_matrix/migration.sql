-- Platform Owner is now the only platform administrator. Refuse to clean up
-- legacy custom-admin grants when an existing installation has no active owner;
-- a failed deployment is safer than silently locking the office out.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "platform"."User" WHERE "status" = 'ACTIVE'
  ) AND NOT EXISTS (
    SELECT 1
    FROM "platform"."UserRole" ur
    JOIN "platform"."User" u ON u."id" = ur."user_id"
    JOIN "platform"."Role" r ON r."id" = ur."role_id"
    WHERE u."status" = 'ACTIVE'
      AND r."archived_at" IS NULL
      AND r."is_system" = TRUE
      AND r."code" = 'platform-owner'
  ) THEN
    RAISE EXCEPTION 'RBAC owner cleanup refused: assign an active Platform Owner first';
  END IF;
END $$;

-- Platform settings, users, roles, audit and integrations are owner-only.
DELETE FROM "platform"."RolePermission" rp
USING "platform"."Role" r
WHERE rp."role_id" = r."id"
  AND r."is_system" = FALSE
  AND rp."permission_id" LIKE 'platform.%';

-- The 2026-09-30 compatibility migration granted project.override to every role that once held
-- phase.override. Remove only that deterministic migration-created row from
-- custom roles. A permission later removed and deliberately re-added has a
-- normal generated id and is preserved as an explicit manager decision.
DELETE FROM "platform"."RolePermission" rp
USING "platform"."Role" r
WHERE rp."role_id" = r."id"
  AND r."is_system" = FALSE
  AND rp."permission_id" = 'studioflow.project.override'
  AND rp."id" = md5(rp."role_id" || ':studioflow.project.override')::uuid;
