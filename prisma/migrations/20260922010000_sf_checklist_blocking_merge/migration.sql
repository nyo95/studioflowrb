-- Merge SfRequirement into SfChecklistItem (owner decision 2026-09-22, supersedes V2 contract §5).
--
-- A requirement was structurally a subset of a checklist item: the only real difference
-- was one policy bit — a root checklist item blocks approval, a requirement only warns.
-- That bit now lives on the item itself as `is_blocking`.
--
-- Non-destructive: `sf_requirement` keeps its rows as a rollback copy and is dropped in a
-- separate migration once the merge is accepted. Nothing reads it after this point.

ALTER TABLE "studioflow"."sf_checklist_item" ADD COLUMN "is_blocking" BOOLEAN NOT NULL DEFAULT true;

-- Requirements become warning-only ROOT items, keeping their id so history stays traceable.
-- `description` folds into the label: SfChecklistItem has no description column and the
-- merged model stays lean (no production rows carry one).
INSERT INTO "studioflow"."sf_checklist_item"
  ("id", "project_id", "phase_id", "parent_id", "label", "is_checked", "checked_at",
   "is_blocking", "sort_order", "priority", "created_by_id", "created_at", "updated_at")
SELECT
  r."id",
  r."project_id",
  r."phase_id",
  NULL,
  CASE WHEN COALESCE(r."description", '') <> '' THEN r."title" || ' — ' || r."description" ELSE r."title" END,
  r."is_met",
  r."met_at",
  FALSE,
  COALESCE(
    (SELECT MAX(c."sort_order")
       FROM "studioflow"."sf_checklist_item" c
      WHERE c."project_id" = r."project_id"
        AND c."phase_id" IS NOT DISTINCT FROM r."phase_id"),
    -1
  ) + ROW_NUMBER() OVER (PARTITION BY r."project_id", r."phase_id" ORDER BY r."created_at"),
  4,
  r."created_by_id",
  r."created_at",
  r."updated_at"
FROM "studioflow"."sf_requirement" r
WHERE NOT EXISTS (SELECT 1 FROM "studioflow"."sf_checklist_item" c WHERE c."id" = r."id");

-- Approval gate reads this index: unticked, blocking, root items of a phase.
CREATE INDEX "sf_checklist_item_phase_id_is_blocking_is_checked_idx"
  ON "studioflow"."sf_checklist_item"("phase_id", "is_blocking", "is_checked");
