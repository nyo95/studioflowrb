-- CreateTable
CREATE TABLE "platform"."Notification" (
    "id" TEXT NOT NULL,
    "recipient_user_id" TEXT NOT NULL,
    "app_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "href" TEXT,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMP(3),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_recipient_user_id_read_at_created_at_idx" ON "platform"."Notification"("recipient_user_id", "read_at", "created_at");

