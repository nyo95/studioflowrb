-- WO-SF-NOTEFEED-01: phase notes become a stream of messages. Existing notes are converted, then the old fields go.

CREATE TABLE "studioflow"."sf_phase_note" (
  "id" TEXT NOT NULL,
  "phase_id" TEXT NOT NULL,
  "iteration_id" TEXT,
  "body" TEXT NOT NULL DEFAULT '',
  "is_starred" BOOLEAN NOT NULL DEFAULT false,
  "is_client_feedback" BOOLEAN NOT NULL DEFAULT false,
  "author_id" TEXT,
  "author_name" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "edited_at" TIMESTAMP(3),
  CONSTRAINT "sf_phase_note_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "sf_phase_note_phase_id_created_at_idx" ON "studioflow"."sf_phase_note"("phase_id", "created_at");
CREATE INDEX "sf_phase_note_iteration_id_idx" ON "studioflow"."sf_phase_note"("iteration_id");
ALTER TABLE "studioflow"."sf_phase_note" ADD CONSTRAINT "sf_phase_note_phase_id_fkey"
  FOREIGN KEY ("phase_id") REFERENCES "studioflow"."sf_phase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "studioflow"."sf_phase_note" ADD CONSTRAINT "sf_phase_note_iteration_id_fkey"
  FOREIGN KEY ("iteration_id") REFERENCES "studioflow"."sf_revision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "studioflow"."sf_phase_note_image" (
  "id" TEXT NOT NULL,
  "note_id" TEXT NOT NULL,
  "storage_key" TEXT NOT NULL,
  "content_type" TEXT NOT NULL,
  "bytes" INTEGER NOT NULL,
  "sort_order" INTEGER NOT NULL,
  "uploaded_by_id" TEXT NOT NULL,
  "uploaded_by_name" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sf_phase_note_image_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sf_phase_note_image_storage_key_key" ON "studioflow"."sf_phase_note_image"("storage_key");
CREATE INDEX "sf_phase_note_image_note_id_sort_order_idx" ON "studioflow"."sf_phase_note_image"("note_id", "sort_order");
ALTER TABLE "studioflow"."sf_phase_note_image" ADD CONSTRAINT "sf_phase_note_image_note_id_fkey"
  FOREIGN KEY ("note_id") REFERENCES "studioflow"."sf_phase_note"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- An iteration's client notes and images become one message on that iteration (its id reused, so images map 1:1).
-- A visit's note is the visit's own record, not client feedback.
INSERT INTO "studioflow"."sf_phase_note" ("id", "phase_id", "iteration_id", "body", "is_client_feedback", "created_at")
SELECT r."id", r."phase_id", r."id", COALESCE(r."note", ''), r."visit_date" IS NULL, COALESCE(r."answered_at", r."created_at")
FROM "studioflow"."sf_revision" r
WHERE COALESCE(TRIM(r."note"), '') <> ''
   OR EXISTS (SELECT 1 FROM "studioflow"."sf_iteration_image" i WHERE i."iteration_id" = r."id");

INSERT INTO "studioflow"."sf_phase_note_image" ("id", "note_id", "storage_key", "content_type", "bytes", "sort_order", "uploaded_by_id", "uploaded_by_name", "created_at")
SELECT "id", "iteration_id", "storage_key", "content_type", "bytes", "sort_order", "uploaded_by_id", "uploaded_by_name", "created_at"
FROM "studioflow"."sf_iteration_image";

-- A phase's pinned note becomes a starred message without an iteration.
INSERT INTO "studioflow"."sf_phase_note" ("id", "phase_id", "body", "is_starred", "created_at")
SELECT p."id", p."id", p."note", true, p."updated_at"
FROM "studioflow"."sf_phase" p
WHERE COALESCE(TRIM(p."note"), '') <> '';

DROP TABLE "studioflow"."sf_iteration_image";
ALTER TABLE "studioflow"."sf_revision" DROP COLUMN "note";
ALTER TABLE "studioflow"."sf_phase" DROP COLUMN "note";
