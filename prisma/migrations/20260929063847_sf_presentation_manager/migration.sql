-- CreateEnum
CREATE TYPE "studioflow"."sf_presentation_label_side" AS ENUM ('auto', 'left', 'right');

-- CreateTable
CREATE TABLE "studioflow"."sf_presentation_board" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sf_presentation_board_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studioflow"."sf_presentation_slide" (
    "id" TEXT NOT NULL,
    "board_id" TEXT NOT NULL,
    "image_key" TEXT NOT NULL,
    "image_ratio" DOUBLE PRECISION,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sf_presentation_slide_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studioflow"."sf_presentation_annotation" (
    "id" TEXT NOT NULL,
    "slide_id" TEXT NOT NULL,
    "schedule_entry_id" TEXT,
    "pin_x" DOUBLE PRECISION NOT NULL,
    "pin_y" DOUBLE PRECISION NOT NULL,
    "label_side" "studioflow"."sf_presentation_label_side" NOT NULL DEFAULT 'auto',
    "note" TEXT,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sf_presentation_annotation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sf_presentation_board_project_id_sort_order_idx" ON "studioflow"."sf_presentation_board"("project_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "sf_presentation_slide_image_key_key" ON "studioflow"."sf_presentation_slide"("image_key");

-- CreateIndex
CREATE INDEX "sf_presentation_slide_board_id_sort_order_idx" ON "studioflow"."sf_presentation_slide"("board_id", "sort_order");

-- CreateIndex
CREATE INDEX "sf_presentation_annotation_slide_id_sort_order_idx" ON "studioflow"."sf_presentation_annotation"("slide_id", "sort_order");

-- CreateIndex
CREATE INDEX "sf_presentation_annotation_schedule_entry_id_idx" ON "studioflow"."sf_presentation_annotation"("schedule_entry_id");

-- AddForeignKey
ALTER TABLE "studioflow"."sf_presentation_board" ADD CONSTRAINT "sf_presentation_board_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "studioflow"."sf_project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studioflow"."sf_presentation_slide" ADD CONSTRAINT "sf_presentation_slide_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "studioflow"."sf_presentation_board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studioflow"."sf_presentation_annotation" ADD CONSTRAINT "sf_presentation_annotation_slide_id_fkey" FOREIGN KEY ("slide_id") REFERENCES "studioflow"."sf_presentation_slide"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studioflow"."sf_presentation_annotation" ADD CONSTRAINT "sf_presentation_annotation_schedule_entry_id_fkey" FOREIGN KEY ("schedule_entry_id") REFERENCES "studioflow"."sf_schedule_entry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
