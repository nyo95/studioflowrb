-- WO-SF-ACCESS-01: grant the new PIC seats to every existing phase worker,
-- and the project bypass to every existing phase override holder.  Role grants
-- are durable rows, so this preserves every current role's effective ability
-- while the owner refines roles later in Platform Access.
INSERT INTO "platform"."RolePermission" ("id", "role_id", "permission_id", "granted_at")
SELECT md5(rp."role_id" || ':studioflow.project.pic-designer')::uuid, rp."role_id", 'studioflow.project.pic-designer', CURRENT_TIMESTAMP
FROM "platform"."RolePermission" rp
WHERE rp."permission_id" = 'studioflow.phase.work'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

INSERT INTO "platform"."RolePermission" ("id", "role_id", "permission_id", "granted_at")
SELECT md5(rp."role_id" || ':studioflow.project.pic-drafter')::uuid, rp."role_id", 'studioflow.project.pic-drafter', CURRENT_TIMESTAMP
FROM "platform"."RolePermission" rp
WHERE rp."permission_id" = 'studioflow.phase.work'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

INSERT INTO "platform"."RolePermission" ("id", "role_id", "permission_id", "granted_at")
SELECT md5(rp."role_id" || ':studioflow.project.override')::uuid, rp."role_id", 'studioflow.project.override', CURRENT_TIMESTAMP
FROM "platform"."RolePermission" rp
WHERE rp."permission_id" = 'studioflow.phase.override'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
