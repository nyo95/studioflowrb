-- Data-only: iterations that still carry the old default name ("<phase name> <number>") take the new default
-- ("<project name> <prefix><number>", owner 2026-10-08). Kind names (CD Mall / CD Final) and names a person typed
-- never equal the old default, so they are untouched. Idempotent: after the rewrite no row matches again.
UPDATE "studioflow"."sf_revision" AS r
SET "name" = p."name" || ' ' || ph."prefix_snapshot" || r."major"
FROM "studioflow"."sf_phase" AS ph
JOIN "studioflow"."sf_project" AS p ON p."id" = ph."project_id"
WHERE r."phase_id" = ph."id"
  AND r."name" = ph."name_snapshot" || ' ' || r."major";
