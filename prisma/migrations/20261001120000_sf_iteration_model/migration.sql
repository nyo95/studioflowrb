-- WO-SF-ITER-01 Phase 1. This preflight is deliberately before any destructive
-- merge: an attached activity/deliverable is never allowed to lose its iteration.
DO $$
DECLARE bad_count INTEGER; phase_count INTEGER; revision_count INTEGER; merge_count INTEGER; activity_count INTEGER; deliverable_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO phase_count FROM "studioflow"."sf_phase";
  SELECT COUNT(*) INTO revision_count FROM "studioflow"."sf_revision";
  SELECT COUNT(*) INTO merge_count FROM (SELECT 1 FROM "studioflow"."sf_revision" GROUP BY "phase_id", "major" HAVING COUNT(*) > 1) grouped;
  SELECT COUNT(*) INTO activity_count FROM "studioflow"."sf_activity" WHERE "revision_id" IS NOT NULL;
  SELECT COUNT(*) INTO deliverable_count FROM "studioflow"."sf_deliverable" WHERE "revision_id" IS NOT NULL;
  RAISE NOTICE 'SF iteration precheck: phases %, revisions %, major groups to merge %, activities to re-point %, deliverables to re-point %', phase_count, revision_count, merge_count, activity_count, deliverable_count;
  SELECT COUNT(*) INTO bad_count
  FROM "studioflow"."sf_activity" a
  LEFT JOIN "studioflow"."sf_revision" r ON r."id" = a."revision_id"
  WHERE a."revision_id" IS NOT NULL AND r."id" IS NULL;
  IF bad_count > 0 THEN RAISE EXCEPTION 'SF iteration migration aborted: % activities have an unattached revision', bad_count; END IF;
  SELECT COUNT(*) INTO bad_count
  FROM "studioflow"."sf_deliverable" d
  LEFT JOIN "studioflow"."sf_revision" r ON r."id" = d."revision_id"
  WHERE d."revision_id" IS NOT NULL AND r."id" IS NULL;
  IF bad_count > 0 THEN RAISE EXCEPTION 'SF iteration migration aborted: % deliverables have an unattached revision', bad_count; END IF;
END $$;

ALTER TABLE "studioflow"."sf_phase" ADD COLUMN "note" TEXT;
ALTER TABLE "studioflow"."sf_checklist_item" ADD COLUMN "dismissed_at" TIMESTAMP(3);
ALTER TABLE "studioflow"."sf_phase_definition" ADD COLUMN "default_iteration_kinds" JSONB;
ALTER TABLE "studioflow"."sf_revision" ADD COLUMN "name" TEXT;
ALTER TABLE "studioflow"."sf_revision" ADD COLUMN "sent_at" TIMESTAMP(3);
ALTER TABLE "studioflow"."sf_revision" ADD COLUMN "answered_at" TIMESTAMP(3);
ALTER TABLE "studioflow"."sf_revision" ADD COLUMN "done_at" TIMESTAMP(3);
ALTER TABLE "studioflow"."sf_revision" ADD COLUMN "visit_date" DATE;
ALTER TABLE "studioflow"."sf_revision" ADD COLUMN "note" TEXT;
ALTER TABLE "studioflow"."sf_revision" ADD COLUMN "legacy_phase_status" TEXT;
ALTER TABLE "studioflow"."sf_revision" ADD COLUMN "legacy_is_lower" BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE "studioflow"."sf_revision" r SET "legacy_phase_status" = p."status"::TEXT
FROM "studioflow"."sf_phase" p WHERE p."id" = r."phase_id";
UPDATE "studioflow"."sf_revision" r SET "legacy_is_lower" = r."major" < ranked.max_major
FROM (SELECT "phase_id", max("major") AS max_major FROM "studioflow"."sf_revision" GROUP BY "phase_id") ranked
WHERE ranked."phase_id" = r."phase_id";

-- Keep only the highest minor for each former major and move its attachments.
WITH survivors AS (
  SELECT id, first_value(id) OVER (PARTITION BY phase_id, major ORDER BY minor DESC, created_at DESC, id DESC) AS survivor_id
  FROM "studioflow"."sf_revision"
)
UPDATE "studioflow"."sf_activity" a SET "revision_id" = s.survivor_id
FROM survivors s WHERE a."revision_id" = s.id AND s.id <> s.survivor_id;
WITH survivors AS (
  SELECT id, first_value(id) OVER (PARTITION BY phase_id, major ORDER BY minor DESC, created_at DESC, id DESC) AS survivor_id
  FROM "studioflow"."sf_revision"
)
UPDATE "studioflow"."sf_deliverable" d SET "revision_id" = s.survivor_id
FROM survivors s WHERE d."revision_id" = s.id AND s.id <> s.survivor_id;
DELETE FROM "studioflow"."sf_revision" r
USING (
  SELECT id, row_number() OVER (PARTITION BY phase_id, major ORDER BY minor DESC, created_at DESC, id DESC) AS rank
  FROM "studioflow"."sf_revision"
) ranked WHERE r.id = ranked.id AND ranked.rank > 1;

-- Replace enum types only after the old values have been inspected above.
ALTER TABLE "studioflow"."sf_revision" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "studioflow"."sf_phase" ALTER COLUMN "status" DROP DEFAULT;
DROP INDEX IF EXISTS "studioflow"."sf_revision_one_active_per_phase";
ALTER TYPE "studioflow"."sf_revision_status" RENAME TO "sf_revision_status_old";
CREATE TYPE "studioflow"."sf_revision_status" AS ENUM ('NOT_SENT','SENT','ANSWERED','REVISED','DONE');
ALTER TYPE "studioflow"."sf_phase_status" RENAME TO "sf_phase_status_old";
CREATE TYPE "studioflow"."sf_phase_status" AS ENUM ('PENDING','ACTIVE','DONE');

ALTER TABLE "studioflow"."sf_revision" ALTER COLUMN "status" TYPE "studioflow"."sf_revision_status"
USING (CASE
  WHEN "legacy_is_lower" THEN 'REVISED'
  WHEN "legacy_phase_status" = 'ON_REVIEW_CLIENT' THEN 'SENT'
  WHEN "legacy_phase_status" IN ('READY_FOR_NEXT','COMPLETED') THEN 'DONE'
  ELSE 'NOT_SENT'
END)::"studioflow"."sf_revision_status";
ALTER TABLE "studioflow"."sf_phase" ALTER COLUMN "status" TYPE "studioflow"."sf_phase_status"
USING (CASE
  WHEN "status"::TEXT IN ('READY_FOR_NEXT','COMPLETED') THEN 'DONE'
  WHEN "status"::TEXT = 'PENDING' THEN 'PENDING'
  ELSE 'ACTIVE'
END)::"studioflow"."sf_phase_status";
DROP TYPE "studioflow"."sf_revision_status_old";
DROP TYPE "studioflow"."sf_phase_status_old";

UPDATE "studioflow"."sf_revision" r
SET "name" = p."name_snapshot" || ' ' || r."major",
    "sent_at" = CASE WHEN r."status" = 'SENT' THEN p."status_changed_at" END,
    "done_at" = CASE WHEN r."status" = 'DONE' THEN p."status_changed_at" END
FROM "studioflow"."sf_phase" p WHERE p."id" = r."phase_id";
ALTER TABLE "studioflow"."sf_revision" ALTER COLUMN "name" SET NOT NULL;
ALTER TABLE "studioflow"."sf_revision" ALTER COLUMN "status" SET DEFAULT 'NOT_SENT';
ALTER TABLE "studioflow"."sf_phase" ALTER COLUMN "status" SET DEFAULT 'PENDING';
ALTER TABLE "studioflow"."sf_revision" DROP COLUMN "minor";
ALTER TABLE "studioflow"."sf_revision" DROP COLUMN "closed_at";
ALTER TABLE "studioflow"."sf_revision" DROP COLUMN "legacy_phase_status";
ALTER TABLE "studioflow"."sf_revision" DROP COLUMN "legacy_is_lower";
ALTER TABLE "studioflow"."sf_revision" ADD CONSTRAINT "sf_revision_phase_id_major_key" UNIQUE ("phase_id", "major");
CREATE UNIQUE INDEX "sf_revision_one_open_iteration_per_phase"
  ON "studioflow"."sf_revision" ("phase_id") WHERE "status" IN ('NOT_SENT','SENT','ANSWERED');

UPDATE "studioflow"."sf_phase_definition"
SET "default_iteration_kinds" = '[{"name":"CD Mall"},{"name":"CD Final"}]'::jsonb
WHERE "id" = '00000000-0000-4000-8000-000000000104';

CREATE TABLE "studioflow"."sf_phase_event" (
  "id" TEXT NOT NULL, "project_id" TEXT NOT NULL, "phase_id" TEXT NOT NULL,
  "iteration_id" TEXT, "from_state" TEXT, "to_state" TEXT NOT NULL,
  "actor_id" TEXT NOT NULL, "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "auto_created" JSONB, "undone_at" TIMESTAMP(3), "undone_by_id" TEXT,
  CONSTRAINT "sf_phase_event_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sf_phase_event_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "studioflow"."sf_project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "sf_phase_event_phase_id_fkey" FOREIGN KEY ("phase_id") REFERENCES "studioflow"."sf_phase"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "sf_phase_event_iteration_id_fkey" FOREIGN KEY ("iteration_id") REFERENCES "studioflow"."sf_revision"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "sf_phase_event_project_id_occurred_at_idx" ON "studioflow"."sf_phase_event"("project_id", "occurred_at");
CREATE INDEX "sf_phase_event_phase_id_occurred_at_idx" ON "studioflow"."sf_phase_event"("phase_id", "occurred_at");
