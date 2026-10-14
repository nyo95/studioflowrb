ALTER TABLE "studioflow"."sf_workspace_card" ADD COLUMN "reply_to_id" TEXT;

ALTER TABLE "studioflow"."sf_workspace_card"
  ADD CONSTRAINT "sf_workspace_card_reply_to_id_fkey"
  FOREIGN KEY ("reply_to_id") REFERENCES "studioflow"."sf_workspace_card"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "sf_workspace_card_reply_to_id_idx" ON "studioflow"."sf_workspace_card"("reply_to_id");

CREATE TABLE "studioflow"."sf_note_tag" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "name" VARCHAR(32) NOT NULL,
  "key" VARCHAR(32) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sf_note_tag_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sf_note_tag_project_id_key_key" ON "studioflow"."sf_note_tag"("project_id", "key");
ALTER TABLE "studioflow"."sf_note_tag" ADD CONSTRAINT "sf_note_tag_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "studioflow"."sf_project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "studioflow"."sf_note_tag_link" (
  "card_id" TEXT NOT NULL,
  "tag_id" TEXT NOT NULL,
  CONSTRAINT "sf_note_tag_link_pkey" PRIMARY KEY ("card_id", "tag_id")
);
CREATE INDEX "sf_note_tag_link_tag_id_idx" ON "studioflow"."sf_note_tag_link"("tag_id");
ALTER TABLE "studioflow"."sf_note_tag_link" ADD CONSTRAINT "sf_note_tag_link_card_id_fkey"
  FOREIGN KEY ("card_id") REFERENCES "studioflow"."sf_workspace_card"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "studioflow"."sf_note_tag_link" ADD CONSTRAINT "sf_note_tag_link_tag_id_fkey"
  FOREIGN KEY ("tag_id") REFERENCES "studioflow"."sf_note_tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "studioflow"."sf_note_item_link" (
  "card_id" TEXT NOT NULL,
  "entry_id" TEXT NOT NULL,
  "code_snapshot" TEXT NOT NULL,
  CONSTRAINT "sf_note_item_link_pkey" PRIMARY KEY ("card_id", "entry_id")
);
CREATE INDEX "sf_note_item_link_entry_id_idx" ON "studioflow"."sf_note_item_link"("entry_id");
ALTER TABLE "studioflow"."sf_note_item_link" ADD CONSTRAINT "sf_note_item_link_card_id_fkey"
  FOREIGN KEY ("card_id") REFERENCES "studioflow"."sf_workspace_card"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "studioflow"."sf_note_item_link" ADD CONSTRAINT "sf_note_item_link_entry_id_fkey"
  FOREIGN KEY ("entry_id") REFERENCES "studioflow"."sf_schedule_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
