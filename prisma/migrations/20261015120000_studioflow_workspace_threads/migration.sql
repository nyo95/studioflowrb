CREATE TABLE "studioflow"."sf_workspace_thread" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "anchor_card_id" TEXT,
    "offset_x" INTEGER,
    "offset_y" INTEGER,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "sf_workspace_thread_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sf_workspace_thread_point_check" CHECK ("x" BETWEEN 0 AND 100000 AND "y" BETWEEN 0 AND 100000),
    CONSTRAINT "sf_workspace_thread_anchor_check" CHECK (
      ("anchor_card_id" IS NULL AND "offset_x" IS NULL AND "offset_y" IS NULL)
      OR ("anchor_card_id" IS NOT NULL AND "offset_x" IS NOT NULL AND "offset_y" IS NOT NULL)
    )
);

ALTER TABLE "studioflow"."sf_workspace_card" ADD COLUMN "thread_id" TEXT;
CREATE INDEX "sf_workspace_thread_project_id_idx" ON "studioflow"."sf_workspace_thread"("project_id");
CREATE INDEX "sf_workspace_thread_anchor_card_id_idx" ON "studioflow"."sf_workspace_thread"("anchor_card_id");
CREATE INDEX "sf_workspace_card_thread_id_idx" ON "studioflow"."sf_workspace_card"("thread_id");
ALTER TABLE "studioflow"."sf_workspace_thread" ADD CONSTRAINT "sf_workspace_thread_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "studioflow"."sf_project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "studioflow"."sf_workspace_thread" ADD CONSTRAINT "sf_workspace_thread_anchor_card_id_fkey"
  FOREIGN KEY ("anchor_card_id") REFERENCES "studioflow"."sf_workspace_card"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "studioflow"."sf_workspace_card" ADD CONSTRAINT "sf_workspace_card_thread_id_fkey"
  FOREIGN KEY ("thread_id") REFERENCES "studioflow"."sf_workspace_thread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- An automatic anchor deletion leaves a free thread at its stored absolute point.
-- Clear offsets before the anchor check runs, including when the FK performs SET NULL.
CREATE FUNCTION "studioflow"."clear_workspace_thread_offsets"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.anchor_card_id IS NULL THEN
    NEW.offset_x := NULL;
    NEW.offset_y := NULL;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "sf_workspace_thread_clear_offsets"
  BEFORE UPDATE OF "anchor_card_id" ON "studioflow"."sf_workspace_thread"
  FOR EACH ROW EXECUTE FUNCTION "studioflow"."clear_workspace_thread_offsets"();
