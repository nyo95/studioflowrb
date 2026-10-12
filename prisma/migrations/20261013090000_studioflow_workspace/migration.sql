-- WO-SF-WORKSPACE-01: phase notes become one Workspace per project. The note tables are renamed in place (ids, text,
-- images and storage keys kept); every project with notes gets one "Notes" section; phase and round become labels.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "studioflow"."sf_phase_note" note
    LEFT JOIN "studioflow"."sf_phase" phase ON phase."id" = note."phase_id"
    WHERE phase."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Workspace migration refused: a phase note points to a missing phase';
  END IF;
END $$;

CREATE TYPE "studioflow"."sf_workspace_card_origin" AS ENUM ('NOTE', 'CLIENT_ANSWER', 'SITE_VISIT');

CREATE TABLE "studioflow"."sf_workspace_section" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "sf_workspace_section_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "sf_workspace_section_project_id_sort_order_idx" ON "studioflow"."sf_workspace_section"("project_id", "sort_order");
ALTER TABLE "studioflow"."sf_workspace_section" ADD CONSTRAINT "sf_workspace_section_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "studioflow"."sf_project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One "Notes" section per project that has notes, created by the project's creator.
INSERT INTO "studioflow"."sf_workspace_section" ("id", "project_id", "title", "sort_order", "created_by_id", "created_at", "updated_at")
SELECT gen_random_uuid()::text, project."id", 'Notes', 0, project."created_by_id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "studioflow"."sf_project" project
WHERE EXISTS (
  SELECT 1 FROM "studioflow"."sf_phase_note" note
  JOIN "studioflow"."sf_phase" phase ON phase."id" = note."phase_id"
  WHERE phase."project_id" = project."id"
);

-- Cards: the renamed note table.
ALTER TABLE "studioflow"."sf_phase_note" RENAME TO "sf_workspace_card";
ALTER TABLE "studioflow"."sf_workspace_card" RENAME CONSTRAINT "sf_phase_note_pkey" TO "sf_workspace_card_pkey";
ALTER TABLE "studioflow"."sf_workspace_card" DROP CONSTRAINT "sf_phase_note_phase_id_fkey";
ALTER TABLE "studioflow"."sf_workspace_card" RENAME CONSTRAINT "sf_phase_note_iteration_id_fkey" TO "sf_workspace_card_iteration_id_fkey";
ALTER INDEX "studioflow"."sf_phase_note_phase_id_created_at_idx" RENAME TO "sf_workspace_card_phase_id_created_at_idx";
ALTER INDEX "studioflow"."sf_phase_note_iteration_id_idx" RENAME TO "sf_workspace_card_iteration_id_idx";
ALTER TABLE "studioflow"."sf_workspace_card" RENAME COLUMN "is_starred" TO "is_pinned";

ALTER TABLE "studioflow"."sf_workspace_card"
  ADD COLUMN "project_id" TEXT,
  ADD COLUMN "section_id" TEXT,
  ADD COLUMN "sort_order" INTEGER,
  ADD COLUMN "origin" "studioflow"."sf_workspace_card_origin" NOT NULL DEFAULT 'NOTE',
  ADD COLUMN "updated_at" TIMESTAMP(3),
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "studioflow"."sf_workspace_card" ALTER COLUMN "phase_id" DROP NOT NULL;

UPDATE "studioflow"."sf_workspace_card" card
SET "project_id" = phase."project_id"
FROM "studioflow"."sf_phase" phase
WHERE phase."id" = card."phase_id";

UPDATE "studioflow"."sf_workspace_card" card
SET "section_id" = section."id"
FROM "studioflow"."sf_workspace_section" section
WHERE section."project_id" = card."project_id";

-- Oldest first across all phases of the project, as one stream.
UPDATE "studioflow"."sf_workspace_card" card
SET "sort_order" = ordered.position
FROM (
  SELECT "id", (ROW_NUMBER() OVER (PARTITION BY "project_id" ORDER BY "created_at", "id") - 1)::integer AS position
  FROM "studioflow"."sf_workspace_card"
) ordered
WHERE ordered."id" = card."id";

-- Origin: client feedback stays a client answer; a note the visit command wrote with its visit round becomes a site visit.
UPDATE "studioflow"."sf_workspace_card" SET "origin" = 'CLIENT_ANSWER' WHERE "is_client_feedback";
UPDATE "studioflow"."sf_workspace_card" card
SET "origin" = 'SITE_VISIT'
FROM "studioflow"."sf_revision" round
WHERE round."id" = card."iteration_id"
  AND NOT card."is_client_feedback"
  AND round."visit_date" IS NOT NULL
  AND date_trunc('second', card."created_at") = date_trunc('second', round."created_at");

UPDATE "studioflow"."sf_workspace_card" SET "updated_at" = COALESCE("edited_at", "created_at");

ALTER TABLE "studioflow"."sf_workspace_card" DROP COLUMN "is_client_feedback";
ALTER TABLE "studioflow"."sf_workspace_card"
  ALTER COLUMN "project_id" SET NOT NULL,
  ALTER COLUMN "section_id" SET NOT NULL,
  ALTER COLUMN "sort_order" SET NOT NULL,
  ALTER COLUMN "updated_at" SET NOT NULL;

CREATE INDEX "sf_workspace_card_section_id_sort_order_idx" ON "studioflow"."sf_workspace_card"("section_id", "sort_order");
CREATE INDEX "sf_workspace_card_project_id_created_at_idx" ON "studioflow"."sf_workspace_card"("project_id", "created_at");
ALTER TABLE "studioflow"."sf_workspace_card" ADD CONSTRAINT "sf_workspace_card_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "studioflow"."sf_project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "studioflow"."sf_workspace_card" ADD CONSTRAINT "sf_workspace_card_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "studioflow"."sf_workspace_section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "studioflow"."sf_workspace_card" ADD CONSTRAINT "sf_workspace_card_phase_id_fkey" FOREIGN KEY ("phase_id") REFERENCES "studioflow"."sf_phase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Card images: the renamed note image table.
ALTER TABLE "studioflow"."sf_phase_note_image" RENAME TO "sf_workspace_card_image";
ALTER TABLE "studioflow"."sf_workspace_card_image" RENAME CONSTRAINT "sf_phase_note_image_pkey" TO "sf_workspace_card_image_pkey";
ALTER TABLE "studioflow"."sf_workspace_card_image" RENAME COLUMN "note_id" TO "card_id";
ALTER TABLE "studioflow"."sf_workspace_card_image" RENAME CONSTRAINT "sf_phase_note_image_note_id_fkey" TO "sf_workspace_card_image_card_id_fkey";
ALTER INDEX "studioflow"."sf_phase_note_image_storage_key_key" RENAME TO "sf_workspace_card_image_storage_key_key";
ALTER INDEX "studioflow"."sf_phase_note_image_note_id_sort_order_idx" RENAME TO "sf_workspace_card_image_card_id_sort_order_idx";
