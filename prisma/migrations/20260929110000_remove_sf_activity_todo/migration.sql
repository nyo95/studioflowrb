-- SfActivity has been feedback-only since V2-D1. Both rebuild databases were
-- checked for TODO rows before this migration was created.
ALTER TABLE "studioflow"."sf_activity"
  ALTER COLUMN "mode" DROP DEFAULT;

CREATE TYPE "studioflow"."sf_activity_mode_new" AS ENUM ('FEEDBACK');

ALTER TABLE "studioflow"."sf_activity"
  ALTER COLUMN "mode" TYPE "studioflow"."sf_activity_mode_new"
  USING ("mode"::text::"studioflow"."sf_activity_mode_new");

DROP TYPE "studioflow"."sf_activity_mode";
ALTER TYPE "studioflow"."sf_activity_mode_new" RENAME TO "sf_activity_mode";

ALTER TABLE "studioflow"."sf_activity"
  ALTER COLUMN "mode" SET DEFAULT 'FEEDBACK'::"studioflow"."sf_activity_mode";
