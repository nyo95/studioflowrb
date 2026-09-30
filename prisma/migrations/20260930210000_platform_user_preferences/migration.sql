CREATE TABLE "platform"."user_preference" (
  "user_id" UUID NOT NULL,
  "theme" TEXT,
  "locale" TEXT,
  "timezone" TEXT,
  "start_page" TEXT,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_preference_pkey" PRIMARY KEY ("user_id"),
  CONSTRAINT "user_preference_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "platform"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
