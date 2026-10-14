-- Presentation slides with layouts (owner 2026-10-14, "mini PowerPoint"): a slide holds up to four images in the boxes
-- of its layout, with an optional title and caption; pins move from the slide to the image they sit on.
-- Every existing slide becomes layout "one" holding its own image whole ("contain", as it showed before); its pins follow.

CREATE TABLE "presentation"."sf_presentation_slide_image" (
    "id" TEXT NOT NULL,
    "slide_id" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "image_key" TEXT NOT NULL,
    "image_ratio" DOUBLE PRECISION,
    "fit" TEXT NOT NULL DEFAULT 'cover',
    "focus_x" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "focus_y" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sf_presentation_slide_image_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sf_presentation_slide_image_image_key_key" ON "presentation"."sf_presentation_slide_image"("image_key");
CREATE UNIQUE INDEX "sf_presentation_slide_image_slide_id_slot_key" ON "presentation"."sf_presentation_slide_image"("slide_id", "slot");
ALTER TABLE "presentation"."sf_presentation_slide_image" ADD CONSTRAINT "sf_presentation_slide_image_slide_id_fkey"
  FOREIGN KEY ("slide_id") REFERENCES "presentation"."sf_presentation_slide"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "presentation"."sf_presentation_slide_image" ("id", "slide_id", "slot", "image_key", "image_ratio", "fit", "created_at", "updated_at")
SELECT gen_random_uuid()::text, "id", 0, "image_key", "image_ratio", 'contain', "created_at", "updated_at"
FROM "presentation"."sf_presentation_slide";

ALTER TABLE "presentation"."sf_presentation_annotation" ADD COLUMN "image_id" TEXT;
UPDATE "presentation"."sf_presentation_annotation" AS a
SET "image_id" = i."id"
FROM "presentation"."sf_presentation_slide_image" AS i
WHERE i."slide_id" = a."slide_id";
ALTER TABLE "presentation"."sf_presentation_annotation" ALTER COLUMN "image_id" SET NOT NULL;
ALTER TABLE "presentation"."sf_presentation_annotation" DROP CONSTRAINT "sf_presentation_annotation_slide_id_fkey";
DROP INDEX IF EXISTS "presentation"."sf_presentation_annotation_slide_id_sort_order_idx";
ALTER TABLE "presentation"."sf_presentation_annotation" DROP COLUMN "slide_id";
CREATE INDEX "sf_presentation_annotation_image_id_sort_order_idx" ON "presentation"."sf_presentation_annotation"("image_id", "sort_order");
ALTER TABLE "presentation"."sf_presentation_annotation" ADD CONSTRAINT "sf_presentation_annotation_image_id_fkey"
  FOREIGN KEY ("image_id") REFERENCES "presentation"."sf_presentation_slide_image"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "presentation"."sf_presentation_slide"
  ADD COLUMN "layout" TEXT NOT NULL DEFAULT 'one',
  ADD COLUMN "title" TEXT,
  ADD COLUMN "caption" TEXT;
DROP INDEX IF EXISTS "presentation"."sf_presentation_slide_image_key_key";
ALTER TABLE "presentation"."sf_presentation_slide" DROP COLUMN "image_key", DROP COLUMN "image_ratio";
