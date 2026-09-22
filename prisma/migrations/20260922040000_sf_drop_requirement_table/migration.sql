-- Drop sf_requirement (owner sign-off 2026-09-22), completing the merge started in
-- 20260922010000_sf_checklist_blocking_merge. Rows were already copied into
-- sf_checklist_item as warning-only (`is_blocking = false`) root items; nothing
-- reads this table at runtime, so the rollback copy is no longer needed.

DROP TABLE "studioflow"."sf_requirement";
