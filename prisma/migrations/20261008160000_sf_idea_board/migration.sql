-- WO-SF-IDEAS-01: personal Ideas cards and where each was used in a project's Product Schedule.

-- CreateTable
CREATE TABLE "studioflow"."sf_idea_card" (
    "id" TEXT NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "title" TEXT,
    "source_url" TEXT,
    "note" TEXT,
    "image_key" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sf_idea_card_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studioflow"."sf_idea_usage" (
    "id" TEXT NOT NULL,
    "card_id" TEXT NOT NULL,
    "option_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sf_idea_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sf_idea_card_image_key_key" ON "studioflow"."sf_idea_card"("image_key");

-- CreateIndex
CREATE INDEX "sf_idea_card_owner_user_id_created_at_idx" ON "studioflow"."sf_idea_card"("owner_user_id", "created_at");

-- CreateIndex
CREATE INDEX "sf_idea_usage_card_id_created_at_idx" ON "studioflow"."sf_idea_usage"("card_id", "created_at");

-- CreateIndex
CREATE INDEX "sf_idea_usage_option_id_idx" ON "studioflow"."sf_idea_usage"("option_id");

-- AddForeignKey
ALTER TABLE "studioflow"."sf_idea_usage" ADD CONSTRAINT "sf_idea_usage_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "studioflow"."sf_idea_card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studioflow"."sf_idea_usage" ADD CONSTRAINT "sf_idea_usage_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "studioflow"."sf_schedule_option"("id") ON DELETE CASCADE ON UPDATE CASCADE;
