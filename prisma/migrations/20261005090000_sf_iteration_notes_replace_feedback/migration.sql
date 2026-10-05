-- Owner decision 2026-10-05: client feedback is no longer a list of per-point work items. What the client
-- said on an iteration is that iteration's notes (`sf_revision.note`, already used by Supervision visits).
-- Requirements (root checklist items of a phase) stay separate, as in legacy.
--
-- Data only, no schema change. Nothing is discarded:
--   1. every FEEDBACK activity on an iteration is appended, oldest first, to that iteration's notes;
--   2. feedback detached from its iteration (deferred) goes to the phase's latest iteration;
--      loose project-level feedback (no phase) becomes a general project to-do;
--   3. checklist items that were made from carried-forward feedback (same phase, same text as a
--      feedback point, no template, no subtasks) are removed: their text is in the notes now;
--   4. every FEEDBACK activity is closed, so nothing counts as open work. The rows stay as history.
DO $$
DECLARE on_iteration INTEGER; detached INTEGER; loose INTEGER; converted INTEGER;
BEGIN
  SELECT COUNT(*) INTO on_iteration FROM "studioflow"."sf_activity" WHERE "mode" = 'FEEDBACK' AND "revision_id" IS NOT NULL;
  SELECT COUNT(*) INTO detached FROM "studioflow"."sf_activity" WHERE "mode" = 'FEEDBACK' AND "revision_id" IS NULL AND "phase_id" IS NOT NULL;
  SELECT COUNT(*) INTO loose FROM "studioflow"."sf_activity" WHERE "mode" = 'FEEDBACK' AND "revision_id" IS NULL AND "phase_id" IS NULL;
  SELECT COUNT(*) INTO converted FROM "studioflow"."sf_checklist_item" c
    WHERE c."parent_id" IS NULL AND c."phase_id" IS NOT NULL AND c."template_id" IS NULL
      AND NOT EXISTS (SELECT 1 FROM "studioflow"."sf_checklist_item" k WHERE k."parent_id" = c."id")
      AND EXISTS (SELECT 1 FROM "studioflow"."sf_activity" a WHERE a."mode" = 'FEEDBACK' AND a."phase_id" = c."phase_id" AND a."content" = c."label" AND a."created_at" <= c."created_at");
  RAISE NOTICE 'Feedback to notes precheck: % on iterations, % detached, % loose; % converted checklist items to remove', on_iteration, detached, loose, converted;
END $$;

-- 2a. Detached feedback joins the phase's latest iteration (when the phase has one).
UPDATE "studioflow"."sf_activity" a
SET "revision_id" = (SELECT r."id" FROM "studioflow"."sf_revision" r WHERE r."phase_id" = a."phase_id" ORDER BY r."major" DESC LIMIT 1)
WHERE a."mode" = 'FEEDBACK' AND a."revision_id" IS NULL AND a."phase_id" IS NOT NULL
  AND EXISTS (SELECT 1 FROM "studioflow"."sf_revision" r WHERE r."phase_id" = a."phase_id");

-- 1. Append feedback to its iteration's notes, one "- point" line each, oldest first.
UPDATE "studioflow"."sf_revision" r
SET "note" = CASE WHEN r."note" IS NULL OR btrim(r."note") = '' THEN f."lines" ELSE r."note" || E'\n\n' || f."lines" END
FROM (
  SELECT "revision_id", string_agg('- ' || btrim("content"), E'\n' ORDER BY "created_at", "id") AS "lines"
  FROM "studioflow"."sf_activity"
  WHERE "mode" = 'FEEDBACK' AND "revision_id" IS NOT NULL AND btrim("content") <> ''
  GROUP BY "revision_id"
) f
WHERE r."id" = f."revision_id";

-- 2b. Loose project-level feedback (or a phase without any iteration) becomes a general to-do, still open if it was.
INSERT INTO "studioflow"."sf_checklist_item" ("id", "project_id", "phase_id", "label", "is_checked", "checked_at", "is_blocking", "due_at", "assigned_to_id", "created_by_id", "created_at", "updated_at")
SELECT gen_random_uuid()::text, a."project_id", NULL, a."content", a."status" = 'COMPLETED', a."completed_at", false, a."due_at", a."assigned_to_id", a."created_by_id", a."created_at", now()
FROM "studioflow"."sf_activity" a
WHERE a."mode" = 'FEEDBACK' AND a."revision_id" IS NULL AND btrim(a."content") <> '';

-- 3. Remove the checklist copies made from carried-forward feedback.
DELETE FROM "studioflow"."sf_checklist_item" c
WHERE c."parent_id" IS NULL AND c."phase_id" IS NOT NULL AND c."template_id" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "studioflow"."sf_checklist_item" k WHERE k."parent_id" = c."id")
  AND EXISTS (SELECT 1 FROM "studioflow"."sf_activity" a WHERE a."mode" = 'FEEDBACK' AND a."phase_id" = c."phase_id" AND a."content" = c."label" AND a."created_at" <= c."created_at");

-- 4. Close every feedback point; the rows remain as history.
UPDATE "studioflow"."sf_activity"
SET "status" = 'COMPLETED', "completed_at" = COALESCE("completed_at", now())
WHERE "mode" = 'FEEDBACK' AND "status" = 'OPEN';
