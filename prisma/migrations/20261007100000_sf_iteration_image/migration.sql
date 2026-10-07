-- WO-SF-NOTE-IMG-01: images attached to one iteration's client notes. Additive.
CREATE TABLE "studioflow"."sf_iteration_image" (
  "id" TEXT NOT NULL,
  "iteration_id" TEXT NOT NULL,
  "storage_key" TEXT NOT NULL,
  "content_type" TEXT NOT NULL,
  "bytes" INTEGER NOT NULL,
  "sort_order" INTEGER NOT NULL,
  "uploaded_by_id" TEXT NOT NULL,
  "uploaded_by_name" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sf_iteration_image_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sf_iteration_image_storage_key_key" ON "studioflow"."sf_iteration_image"("storage_key");
CREATE INDEX "sf_iteration_image_iteration_id_sort_order_idx" ON "studioflow"."sf_iteration_image"("iteration_id", "sort_order");

ALTER TABLE "studioflow"."sf_iteration_image" ADD CONSTRAINT "sf_iteration_image_iteration_id_fkey"
  FOREIGN KEY ("iteration_id") REFERENCES "studioflow"."sf_revision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
