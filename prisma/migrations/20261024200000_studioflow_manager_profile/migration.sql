-- WO-SF-ROLES-01 (owner, 2026-10-24): the canonical Manager profile (code studio-manager) is the stand-in for an
-- absent PIC plus template and operations authority, and holds no PIC position. Only the StudioFlow grants of that one
-- canonical role are replaced; Designer, Drafter, role assignments and other apps' grants are left alone. A role
-- that does not exist is not created here (the 20261019190000 migration creates it).
UPDATE platform."Role"
SET name = 'Manager',
    description = 'Runs StudioFlow templates and operations and acts for an absent PIC. Not a PIC: holds no Designer or Drafter position.',
    updated_at = CURRENT_TIMESTAMP
WHERE code = 'studio-manager'
  AND is_system = FALSE;

DELETE FROM platform."RolePermission" AS grant_row
USING platform."Role" AS role_row
WHERE grant_row.role_id = role_row.id
  AND role_row.code = 'studio-manager'
  AND role_row.is_system = FALSE
  AND grant_row.permission_id LIKE 'studioflow.%';

INSERT INTO platform."RolePermission" (id, role_id, permission_id, granted_at)
SELECT md5(role_row.id || ':' || profile.permission_id)::uuid,
       role_row.id,
       profile.permission_id,
       CURRENT_TIMESTAMP
FROM (
  VALUES
    ('studioflow.access'),
    ('studioflow.project.read'),
    ('studioflow.phase.work'),
    ('studioflow.phase.review'),
    ('studioflow.task.manage'),
    ('studioflow.mom.manage'),
    ('studioflow.schedule.manage'),
    ('studioflow.presentation.manage'),
    ('studioflow.project.manage'),
    ('studioflow.project.override'),
    ('studioflow.phase.override'),
    ('studioflow.settings.manage')
) AS profile(permission_id)
JOIN platform."Role" AS role_row ON role_row.code = 'studio-manager' AND role_row.is_system = FALSE
ON CONFLICT (role_id, permission_id) DO NOTHING;
