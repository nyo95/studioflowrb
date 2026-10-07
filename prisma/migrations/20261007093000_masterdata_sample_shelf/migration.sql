CREATE TYPE "master_data"."SampleStatus" AS ENUM ('AVAILABLE', 'BORROWED', 'SENT_TO_CLIENT', 'LOST', 'DISCARDED');
CREATE TYPE "master_data"."SampleMovementKind" AS ENUM ('IN', 'OUT', 'RETURN', 'STATUS', 'MOVED', 'REMOVED');

CREATE TABLE "master_data"."Sample" (
  "id" TEXT NOT NULL,
  "sku_id" TEXT NOT NULL,
  "source_intake_id" TEXT,
  "rack" TEXT NOT NULL,
  "box" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "location_note" TEXT,
  "notes" TEXT,
  "status" "master_data"."SampleStatus" NOT NULL DEFAULT 'AVAILABLE',
  "holder_name" TEXT,
  "holder_project_id" TEXT,
  "holder_project_name" TEXT,
  "out_since" TIMESTAMP(3),
  "deleted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Sample_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Sample_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "master_data"."Sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Sample_source_intake_id_fkey" FOREIGN KEY ("source_intake_id") REFERENCES "master_data"."SampleRequestIntake"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "master_data"."SampleMovement" (
  "id" TEXT NOT NULL,
  "sample_id" TEXT NOT NULL,
  "kind" "master_data"."SampleMovementKind" NOT NULL,
  "status_after" "master_data"."SampleStatus" NOT NULL,
  "holder_name" TEXT,
  "holder_project_name" TEXT,
  "from_rack" TEXT,
  "from_box" TEXT,
  "to_rack" TEXT,
  "to_box" TEXT,
  "note" TEXT,
  "actor_user_id" TEXT NOT NULL,
  "actor_label" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SampleMovement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SampleMovement_sample_id_fkey" FOREIGN KEY ("sample_id") REFERENCES "master_data"."Sample"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Sample_source_intake_id_key" ON "master_data"."Sample"("source_intake_id");
CREATE INDEX "Sample_rack_box_idx" ON "master_data"."Sample"("rack", "box");
CREATE INDEX "Sample_status_idx" ON "master_data"."Sample"("status");
CREATE INDEX "Sample_sku_id_idx" ON "master_data"."Sample"("sku_id");
CREATE INDEX "Sample_deleted_at_idx" ON "master_data"."Sample"("deleted_at");
CREATE INDEX "SampleMovement_sample_id_created_at_idx" ON "master_data"."SampleMovement"("sample_id", "created_at");
