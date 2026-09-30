CREATE TYPE "studioflow"."sf_cd_item_status" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED');

CREATE TABLE "studioflow"."sf_cd_item" (
  "id" TEXT NOT NULL,
  "phase_id" TEXT NOT NULL,
  "drawing_code" TEXT NOT NULL,
  "drawing_name" TEXT NOT NULL,
  "status" "studioflow"."sf_cd_item_status" NOT NULL DEFAULT 'PENDING',
  "assigned_to_id" TEXT,
  "created_by_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "sf_cd_item_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sf_cd_item_phase_id_fkey" FOREIGN KEY ("phase_id") REFERENCES "studioflow"."sf_phase"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "sf_cd_item_phase_id_idx" ON "studioflow"."sf_cd_item"("phase_id");
