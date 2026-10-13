-- WO-SF-WORKSPACE-02: every project that already has Workspace sections gets one fixed default destination.
-- A person's ordinary sections remain nullable; PostgreSQL therefore permits any number of them per project.

ALTER TABLE "studioflow"."sf_workspace_section" ADD COLUMN "system_key" TEXT;

WITH ranked AS (
  SELECT
    section."id",
    row_number() OVER (
      PARTITION BY section."project_id"
      ORDER BY
        CASE WHEN section."title" = 'Notes' THEN 0 ELSE 1 END,
        CASE WHEN section."title" = 'Notes' THEN section."created_at" END,
        CASE WHEN section."title" = 'Notes' THEN section."id" END,
        section."sort_order",
        section."created_at",
        section."id"
    ) AS choice
  FROM "studioflow"."sf_workspace_section" section
)
UPDATE "studioflow"."sf_workspace_section" section
SET
  "system_key" = 'DEFAULT',
  "title" = CASE WHEN section."title" = 'Notes' THEN 'Workspace' ELSE section."title" END,
  "version" = section."version" + 1
FROM ranked
WHERE ranked."id" = section."id"
  AND ranked.choice = 1;

-- DEFAULT_SECTION_GUARD: fail closed before the unique constraint is installed.
DO $$
BEGIN
  IF EXISTS (
    SELECT section."project_id"
    FROM "studioflow"."sf_workspace_section" section
    GROUP BY section."project_id"
    HAVING count(*) FILTER (WHERE section."system_key" = 'DEFAULT') <> 1
  ) OR EXISTS (
    SELECT section."project_id"
    FROM "studioflow"."sf_workspace_section" section
    WHERE section."system_key" = 'DEFAULT'
    GROUP BY section."project_id"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Workspace default-section migration refused: every project with sections must have exactly one DEFAULT section';
  END IF;
END $$;

ALTER TABLE "studioflow"."sf_workspace_section"
  ADD CONSTRAINT "sf_workspace_section_project_id_system_key_key" UNIQUE ("project_id", "system_key");
