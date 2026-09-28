-- CreateEnum
CREATE TYPE "master_data"."SampleRequestIntakeStatus" AS ENUM ('IN_PROGRESS', 'PRICED', 'DECLINED');

-- CreateTable
CREATE TABLE "master_data"."SampleRequestIntake" (
    "id" TEXT NOT NULL,
    "source_request_id" TEXT NOT NULL,
    "source_project_id" TEXT NOT NULL,
    "source_project_name" TEXT NOT NULL,
    "source_option_id" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "brand_name" TEXT,
    "color" TEXT,
    "pattern" TEXT,
    "finishing" TEXT,
    "dimension" TEXT,
    "requested_from" TEXT NOT NULL,
    "request_note" TEXT,
    "requester_user_id" TEXT NOT NULL,
    "requester_label" TEXT NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL,
    "status" "master_data"."SampleRequestIntakeStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "vendor_id" TEXT,
    "quoted_amount" DECIMAL(16,2),
    "quoted_currency" TEXT,
    "staff_note" TEXT,
    "sku_id" TEXT,
    "price_material_id" TEXT,
    "handled_by_user_id" TEXT NOT NULL,
    "handled_by_label" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SampleRequestIntake_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SampleRequestIntake_source_request_id_key" ON "master_data"."SampleRequestIntake"("source_request_id");

-- CreateIndex
CREATE INDEX "SampleRequestIntake_status_started_at_idx" ON "master_data"."SampleRequestIntake"("status", "started_at");
