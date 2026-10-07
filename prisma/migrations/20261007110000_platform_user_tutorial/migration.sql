-- First-use tours are personal account state. App-defined keys and content
-- remain outside the platform schema; only a validated key/version/state is stored.
ALTER TABLE "platform"."user_preference" ADD COLUMN "language" TEXT;
ALTER TABLE "platform"."user_preference"
  ADD CONSTRAINT "user_preference_language_check" CHECK ("language" IS NULL OR "language" IN ('id', 'en'));

CREATE TABLE "platform"."user_tutorial" (
  "user_id" UUID NOT NULL,
  "tour_key" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "state" TEXT NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_tutorial_pkey" PRIMARY KEY ("user_id", "tour_key"),
  CONSTRAINT "user_tutorial_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "platform"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "user_tutorial_version_check" CHECK ("version" > 0),
  CONSTRAINT "user_tutorial_state_check" CHECK ("state" IN ('completed', 'dismissed'))
);
