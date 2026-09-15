-- SF-R2: legacy MOM (contract §10). Rebuild databases only; additive.

CREATE TYPE "studioflow"."sf_mom_list_style" AS ENUM ('DECIMAL', 'DISC', 'DASH', 'NONE');
CREATE TYPE "studioflow"."sf_mom_point_style" AS ENUM ('DEFAULT', 'PLAIN');

CREATE TABLE "studioflow"."sf_mom_document" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "topic" TEXT NOT NULL DEFAULT 'SITE INSPECTION REPORT',
  "meeting_date" DATE NOT NULL,
  "venue" TEXT,
  "attendees" TEXT,
  "prepared_by_name" TEXT NOT NULL,
  "created_by_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sf_mom_document_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "sf_mom_document_project_id_meeting_date_idx" ON "studioflow"."sf_mom_document"("project_id", "meeting_date");
ALTER TABLE "studioflow"."sf_mom_document" ADD CONSTRAINT "sf_mom_document_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "studioflow"."sf_project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "studioflow"."sf_mom_item" (
  "id" TEXT NOT NULL,
  "document_id" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL,
  "is_text_only" BOOLEAN NOT NULL DEFAULT false,
  "list_style" "studioflow"."sf_mom_list_style" NOT NULL DEFAULT 'DECIMAL',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sf_mom_item_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "sf_mom_item_document_id_sort_order_idx" ON "studioflow"."sf_mom_item"("document_id", "sort_order");
ALTER TABLE "studioflow"."sf_mom_item" ADD CONSTRAINT "sf_mom_item_document_id_fkey"
  FOREIGN KEY ("document_id") REFERENCES "studioflow"."sf_mom_document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "studioflow"."sf_mom_point" (
  "id" TEXT NOT NULL,
  "item_id" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL,
  "text" TEXT NOT NULL DEFAULT '',
  "style" "studioflow"."sf_mom_point_style" NOT NULL DEFAULT 'DEFAULT',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sf_mom_point_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "sf_mom_point_item_id_sort_order_idx" ON "studioflow"."sf_mom_point"("item_id", "sort_order");
ALTER TABLE "studioflow"."sf_mom_point" ADD CONSTRAINT "sf_mom_point_item_id_fkey"
  FOREIGN KEY ("item_id") REFERENCES "studioflow"."sf_mom_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "studioflow"."sf_mom_image" (
  "id" TEXT NOT NULL,
  "item_id" TEXT NOT NULL,
  "slot" INTEGER NOT NULL,
  "storage_key" TEXT NOT NULL,
  "content_type" TEXT NOT NULL,
  "bytes" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sf_mom_image_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sf_mom_image_slot_check" CHECK ("slot" IN (0, 1)),
  CONSTRAINT "sf_mom_image_bytes_check" CHECK ("bytes" > 0)
);
CREATE UNIQUE INDEX "sf_mom_image_storage_key_key" ON "studioflow"."sf_mom_image"("storage_key");
CREATE UNIQUE INDEX "sf_mom_image_item_id_slot_key" ON "studioflow"."sf_mom_image"("item_id", "slot");
ALTER TABLE "studioflow"."sf_mom_image" ADD CONSTRAINT "sf_mom_image_item_id_fkey"
  FOREIGN KEY ("item_id") REFERENCES "studioflow"."sf_mom_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
