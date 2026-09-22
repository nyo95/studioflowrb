-- "Subtasks never block" is a domain rule, so store it rather than leaving readers to
-- re-derive it from depth. The previous migration's column default made existing
-- subtasks blocking on paper; the approval gate ignores them (it filters parent_id IS NULL),
-- so this only makes the stored data agree with the rule.
UPDATE "studioflow"."sf_checklist_item"
   SET "is_blocking" = FALSE
 WHERE "parent_id" IS NOT NULL
   AND "is_blocking" = TRUE;
