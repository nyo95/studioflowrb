ALTER TYPE "studioflow"."sf_sample_request_status" ADD VALUE 'DECLINED';

ALTER TABLE "studioflow"."sf_schedule_sample_request"
  ADD COLUMN "declined_by_id" TEXT,
  ADD COLUMN "declined_by_name" TEXT,
  ADD COLUMN "declined_at" TIMESTAMP(3),
  ADD COLUMN "decline_reason" TEXT;
