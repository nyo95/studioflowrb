-- WO-SF-NOTES-ONLY-01: phase notes replace personal to-dos.
-- This rebuild-only migration deliberately keeps template-backed requirements and
-- their subtasks, while deleting ad-hoc roots (and their cascading children).

DELETE FROM "studioflow"."sf_checklist_item"
WHERE "template_id" IS NULL
  AND "parent_id" IS NULL;

DROP TABLE "studioflow"."sf_checklist_item_label";
DROP TABLE "studioflow"."sf_checklist_label";
DROP TABLE "studioflow"."sf_checklist_filter_view";

DROP INDEX "studioflow"."sf_checklist_item_assigned_to_id_is_checked_idx";

ALTER TABLE "studioflow"."sf_checklist_item"
  DROP COLUMN "priority",
  DROP COLUMN "due_at",
  DROP COLUMN "assigned_to_id";
