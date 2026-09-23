-- Physical sample request tracking against a Product Schedule option (owner, 2026-09-23). Additive.

CREATE TYPE "studioflow"."sf_sample_request_status" AS ENUM ('REQUESTED', 'RECEIVED');

CREATE TABLE "studioflow"."sf_schedule_sample_request" (
  "id" TEXT NOT NULL,
  "option_id" TEXT NOT NULL,
  "requested_from" TEXT NOT NULL,
  "note" TEXT,
  "status" "studioflow"."sf_sample_request_status" NOT NULL DEFAULT 'REQUESTED',
  "requested_by_id" TEXT NOT NULL,
  "requested_by_name" TEXT NOT NULL,
  "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "received_by_id" TEXT,
  "received_by_name" TEXT,
  "received_at" TIMESTAMP(3),
  "received_note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sf_schedule_sample_request_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sf_schedule_sample_request_option_id_created_at_idx" ON "studioflow"."sf_schedule_sample_request"("option_id", "created_at");

ALTER TABLE "studioflow"."sf_schedule_sample_request" ADD CONSTRAINT "sf_schedule_sample_request_option_id_fkey"
  FOREIGN KEY ("option_id") REFERENCES "studioflow"."sf_schedule_option"("id") ON DELETE CASCADE ON UPDATE CASCADE;
