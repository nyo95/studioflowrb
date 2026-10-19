-- WO-SF-ROLE-PROFILES-01: canonical StudioFlow job profiles.
-- Role names are presentation only; runtime authorization remains grant + PIC fact based.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM platform."Role"
    WHERE code IN ('designer', 'drafter', 'studio-manager')
      AND is_system = TRUE
  ) THEN
    RAISE EXCEPTION 'StudioFlow canonical profile codes cannot be system roles';
  END IF;
END $$;

INSERT INTO platform."Role" (id, code, name, description, is_system, created_at, updated_at, archived_at)
VALUES
  (md5('studioflow-role-profile:designer')::uuid, 'designer', 'Designer', 'Designer PIC for assigned project work. Junior and Mid use this same profile.', FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
  (md5('studioflow-role-profile:drafter')::uuid, 'drafter', 'Drafter', 'Drafter PIC for assigned project work.', FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
  (md5('studioflow-role-profile:studio-manager')::uuid, 'studio-manager', 'Manager', 'Designer-capable StudioFlow operator for clients, projects, and PIC assignment.', FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    archived_at = NULL,
    updated_at = CURRENT_TIMESTAMP;

DELETE FROM platform."RolePermission" AS grant_row
USING platform."Role" AS role_row
WHERE grant_row.role_id = role_row.id
  AND role_row.code IN ('designer', 'drafter', 'studio-manager')
  AND grant_row.permission_id LIKE 'studioflow.%';

INSERT INTO platform."RolePermission" (id, role_id, permission_id, granted_at)
SELECT md5(role_row.id || ':' || profile.permission_id)::uuid,
       role_row.id,
       profile.permission_id,
       CURRENT_TIMESTAMP
FROM (
  VALUES
    ('designer', 'studioflow.access'),
    ('designer', 'studioflow.project.read'),
    ('designer', 'studioflow.project.pic-designer'),
    ('designer', 'studioflow.phase.work'),
    ('designer', 'studioflow.phase.review'),
    ('designer', 'studioflow.task.manage'),
    ('designer', 'studioflow.mom.manage'),
    ('designer', 'studioflow.schedule.manage'),
    ('designer', 'studioflow.presentation.manage'),
    ('drafter', 'studioflow.access'),
    ('drafter', 'studioflow.project.read'),
    ('drafter', 'studioflow.project.pic-drafter'),
    ('drafter', 'studioflow.phase.work'),
    ('drafter', 'studioflow.phase.review'),
    ('drafter', 'studioflow.task.manage'),
    ('drafter', 'studioflow.mom.manage'),
    ('drafter', 'studioflow.schedule.manage'),
    ('drafter', 'studioflow.presentation.manage'),
    ('studio-manager', 'studioflow.access'),
    ('studio-manager', 'studioflow.project.read'),
    ('studio-manager', 'studioflow.project.pic-designer'),
    ('studio-manager', 'studioflow.phase.work'),
    ('studio-manager', 'studioflow.phase.review'),
    ('studio-manager', 'studioflow.task.manage'),
    ('studio-manager', 'studioflow.mom.manage'),
    ('studio-manager', 'studioflow.schedule.manage'),
    ('studio-manager', 'studioflow.presentation.manage'),
    ('studio-manager', 'studioflow.project.manage')
) AS profile(role_code, permission_id)
JOIN platform."Role" AS role_row ON role_row.code = profile.role_code
ON CONFLICT (role_id, permission_id) DO NOTHING;
