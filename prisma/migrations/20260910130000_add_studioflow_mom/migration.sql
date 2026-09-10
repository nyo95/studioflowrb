-- Project-owned MOM records. No relation to phases, iterations, tasks, or client responses.
CREATE TYPE "studioflow"."sf_mom_state" AS ENUM ('DRAFT', 'ISSUED', 'SUPERSEDED');
CREATE TYPE "studioflow"."sf_mom_list_style" AS ENUM ('NONE', 'BULLET', 'NUMBERED');
CREATE TYPE "studioflow"."sf_mom_point_style" AS ENUM ('TEXT', 'BULLET', 'NUMBERED');

CREATE TABLE "studioflow"."sf_mom_document" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "topic" TEXT NOT NULL,
  "meeting_at" TIMESTAMP(3) NOT NULL,
  "venue" TEXT,
  "attendees_text" TEXT,
  "prepared_by_name" TEXT NOT NULL,
  "state" "studioflow"."sf_mom_state" NOT NULL DEFAULT 'DRAFT',
  "sequence" INTEGER,
  "supersedes_id" TEXT,
  "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "issued_by" TEXT,
  "issued_at" TIMESTAMP(3),
  CONSTRAINT "sf_mom_document_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "studioflow"."sf_mom_item" (
  "id" TEXT NOT NULL,
  "document_id" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_text_only" BOOLEAN NOT NULL DEFAULT false,
  "list_style" "studioflow"."sf_mom_list_style" NOT NULL DEFAULT 'NONE',
  CONSTRAINT "sf_mom_item_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "studioflow"."sf_mom_point" (
  "id" TEXT NOT NULL,
  "item_id" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "text" TEXT NOT NULL,
  "style" "studioflow"."sf_mom_point_style" NOT NULL DEFAULT 'TEXT',
  CONSTRAINT "sf_mom_point_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "studioflow"."sf_mom_image" (
  "id" TEXT NOT NULL,
  "item_id" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "storage_key" TEXT NOT NULL,
  "alt_text" TEXT,
  CONSTRAINT "sf_mom_image_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sf_mom_document_project_id_sequence_key" ON "studioflow"."sf_mom_document"("project_id", "sequence");
CREATE INDEX "sf_mom_document_project_id_state_created_at_idx" ON "studioflow"."sf_mom_document"("project_id", "state", "created_at");
CREATE INDEX "sf_mom_document_supersedes_id_idx" ON "studioflow"."sf_mom_document"("supersedes_id");
CREATE INDEX "sf_mom_item_document_id_sort_order_idx" ON "studioflow"."sf_mom_item"("document_id", "sort_order");
CREATE INDEX "sf_mom_point_item_id_sort_order_idx" ON "studioflow"."sf_mom_point"("item_id", "sort_order");
CREATE INDEX "sf_mom_image_item_id_sort_order_idx" ON "studioflow"."sf_mom_image"("item_id", "sort_order");

ALTER TABLE "studioflow"."sf_mom_document" ADD CONSTRAINT "sf_mom_document_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "studioflow"."sf_project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "studioflow"."sf_mom_document" ADD CONSTRAINT "sf_mom_document_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "studioflow"."sf_mom_document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "studioflow"."sf_mom_item" ADD CONSTRAINT "sf_mom_item_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "studioflow"."sf_mom_document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "studioflow"."sf_mom_point" ADD CONSTRAINT "sf_mom_point_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "studioflow"."sf_mom_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "studioflow"."sf_mom_image" ADD CONSTRAINT "sf_mom_image_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "studioflow"."sf_mom_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
