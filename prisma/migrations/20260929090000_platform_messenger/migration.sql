-- Platform private 1:1 messenger with temporary private attachments.
CREATE TABLE "platform"."MessengerConversation" (
  "id" TEXT NOT NULL,
  "pair_key" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MessengerConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platform"."MessengerParticipant" (
  "id" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "last_read_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessengerParticipant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platform"."MessengerMessage" (
  "id" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "author_user_id" TEXT NOT NULL,
  "body" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessengerMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platform"."MessengerAttachment" (
  "id" TEXT NOT NULL,
  "message_id" TEXT NOT NULL,
  "storage_key" TEXT,
  "filename" TEXT NOT NULL,
  "content_type" TEXT NOT NULL,
  "bytes" INTEGER NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "purged_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessengerAttachment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MessengerConversation_pair_key_key" ON "platform"."MessengerConversation"("pair_key");
CREATE INDEX "MessengerConversation_updated_at_idx" ON "platform"."MessengerConversation"("updated_at");
CREATE UNIQUE INDEX "MessengerParticipant_conversation_id_user_id_key" ON "platform"."MessengerParticipant"("conversation_id", "user_id");
CREATE INDEX "MessengerParticipant_user_id_conversation_id_idx" ON "platform"."MessengerParticipant"("user_id", "conversation_id");
CREATE INDEX "MessengerMessage_conversation_id_created_at_idx" ON "platform"."MessengerMessage"("conversation_id", "created_at");
CREATE INDEX "MessengerMessage_author_user_id_created_at_idx" ON "platform"."MessengerMessage"("author_user_id", "created_at");
CREATE UNIQUE INDEX "MessengerAttachment_storage_key_key" ON "platform"."MessengerAttachment"("storage_key");
CREATE INDEX "MessengerAttachment_message_id_idx" ON "platform"."MessengerAttachment"("message_id");
CREATE INDEX "MessengerAttachment_expires_at_purged_at_idx" ON "platform"."MessengerAttachment"("expires_at", "purged_at");

ALTER TABLE "platform"."MessengerParticipant"
  ADD CONSTRAINT "MessengerParticipant_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "platform"."MessengerConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "platform"."MessengerMessage"
  ADD CONSTRAINT "MessengerMessage_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "platform"."MessengerConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "platform"."MessengerAttachment"
  ADD CONSTRAINT "MessengerAttachment_message_id_fkey"
  FOREIGN KEY ("message_id") REFERENCES "platform"."MessengerMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
