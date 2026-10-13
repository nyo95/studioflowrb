-- WO-SF-WORKSPACE-04: one board per project with standalone Text / Image / File elements.
-- Frames fold into each project's DEFAULT section at the place they were drawn (their titles become heading elements);
-- every card image becomes an image element keeping the image's id; nothing is lost.

DO $$
BEGIN
  IF EXISTS (
    SELECT section."project_id"
    FROM "studioflow"."sf_workspace_section" section
    GROUP BY section."project_id"
    HAVING count(*) FILTER (WHERE section."system_key" = 'DEFAULT') <> 1
  ) THEN
    RAISE EXCEPTION 'Workspace elements migration refused: a project with sections has no single DEFAULT section';
  END IF;
END $$;

CREATE TYPE "studioflow"."sf_workspace_element_kind" AS ENUM ('TEXT', 'IMAGE', 'FILE');
CREATE TYPE "studioflow"."sf_workspace_text_style" AS ENUM ('PLAIN', 'HEADING', 'STICKY');

ALTER TABLE "studioflow"."sf_workspace_card"
  ADD COLUMN "kind" "studioflow"."sf_workspace_element_kind" NOT NULL DEFAULT 'TEXT',
  ADD COLUMN "text_style" "studioflow"."sf_workspace_text_style" NOT NULL DEFAULT 'PLAIN',
  ADD COLUMN "storage_key" TEXT,
  ADD COLUMN "content_type" TEXT,
  ADD COLUMN "bytes" INTEGER,
  ADD COLUMN "file_name" TEXT,
  ADD COLUMN "uploaded_by_id" TEXT,
  ADD COLUMN "uploaded_by_name" TEXT;

-- 1. Frames. Where each frame was drawn, by the canvas rule: a placed frame at its stored place; an unplaced one to
--    the right of everything placed, in order, 384 wide with a 32 gap, 32 from the top.
CREATE TEMP TABLE "ws_frame_origin" AS
WITH placed_right AS (
  SELECT section."project_id", max(section."canvas_x" + section."canvas_w") AS right_edge
  FROM "studioflow"."sf_workspace_section" section
  WHERE section."canvas_x" IS NOT NULL AND section."canvas_w" IS NOT NULL AND section."canvas_h" IS NOT NULL
  GROUP BY section."project_id"
), unplaced AS (
  SELECT section."id",
    (row_number() OVER (PARTITION BY section."project_id" ORDER BY section."sort_order", section."created_at", section."id") - 1)::integer AS n
  FROM "studioflow"."sf_workspace_section" section
  WHERE NOT (section."canvas_x" IS NOT NULL AND section."canvas_w" IS NOT NULL AND section."canvas_h" IS NOT NULL)
)
SELECT
  section."id", section."project_id", section."system_key", section."title", section."created_by_id", section."created_at", section."canvas_w",
  CASE WHEN unplaced."id" IS NULL THEN section."canvas_x"
       ELSE (CASE WHEN COALESCE(placed_right.right_edge, 0) = 0 THEN 32 ELSE placed_right.right_edge + 32 END) + unplaced.n * 416 END AS ox,
  CASE WHEN unplaced."id" IS NULL THEN section."canvas_y" ELSE 32 END AS oy
FROM "studioflow"."sf_workspace_section" section
LEFT JOIN placed_right ON placed_right."project_id" = section."project_id"
LEFT JOIN unplaced ON unplaced."id" = section."id";

-- Placed cards take board coordinates (frame origin + place in frame); the DEFAULT frame then sits at the origin, so
-- every card shows where it was. Unplaced cards stay unplaced.
UPDATE "studioflow"."sf_workspace_card" card
SET "canvas_x" = LEAST(100000, frame.ox + card."canvas_x"),
    "canvas_y" = LEAST(100000, frame.oy + card."canvas_y")
FROM "ws_frame_origin" frame
WHERE frame."id" = card."section_id" AND card."canvas_x" IS NOT NULL AND card."canvas_y" IS NOT NULL;

-- A frame's title becomes a heading element where the frame was drawn.
INSERT INTO "studioflow"."sf_workspace_card"
  ("id", "project_id", "section_id", "sort_order", "body", "origin", "author_id", "author_name", "created_at", "updated_at", "version", "canvas_x", "canvas_y", "canvas_w", "kind", "text_style")
SELECT gen_random_uuid()::text, frame."project_id", board."id", 0, frame."title", 'NOTE', frame."created_by_id", NULL, frame."created_at", CURRENT_TIMESTAMP, 1,
  LEAST(100000, frame.ox), LEAST(100000, frame.oy), LEAST(100000, GREATEST(260, COALESCE(frame."canvas_w", 384))), 'TEXT', 'HEADING'
FROM "ws_frame_origin" frame
JOIN "studioflow"."sf_workspace_section" board ON board."project_id" = frame."project_id" AND board."system_key" = 'DEFAULT'
WHERE frame."system_key" IS DISTINCT FROM 'DEFAULT';

UPDATE "studioflow"."sf_workspace_card" card
SET "section_id" = board."id"
FROM "studioflow"."sf_workspace_section" board
WHERE board."project_id" = card."project_id" AND board."system_key" = 'DEFAULT' AND card."section_id" <> board."id";

DELETE FROM "studioflow"."sf_workspace_section" WHERE "system_key" IS DISTINCT FROM 'DEFAULT';

UPDATE "studioflow"."sf_workspace_section"
SET "canvas_x" = 0, "canvas_y" = 0, "canvas_w" = COALESCE("canvas_w", 384), "canvas_h" = COALESCE("canvas_h", 240);

-- 2. Images. Each image becomes an image element with the image's id and its card's labels. A card with no text is
--    replaced by its first image (same place and width); the other images line up to the right of their card.
CREATE TEMP TABLE "ws_image_move" AS
SELECT image."id", image."card_id", image."storage_key", image."content_type", image."bytes", image."uploaded_by_id", image."uploaded_by_name", image."created_at",
  (row_number() OVER (PARTITION BY image."card_id" ORDER BY image."sort_order", image."created_at", image."id") - 1)::integer AS r
FROM "studioflow"."sf_workspace_card_image" image;

INSERT INTO "studioflow"."sf_workspace_card"
  ("id", "project_id", "section_id", "sort_order", "phase_id", "iteration_id", "body", "is_pinned", "origin", "author_id", "author_name", "created_at", "updated_at", "version",
   "canvas_x", "canvas_y", "canvas_w", "kind", "text_style", "storage_key", "content_type", "bytes", "uploaded_by_id", "uploaded_by_name")
SELECT moved."id", card."project_id", card."section_id", 0, card."phase_id", card."iteration_id", '', card."is_pinned", card."origin", card."author_id", card."author_name", moved."created_at", CURRENT_TIMESTAMP, 1,
  CASE WHEN card."body" = '' AND moved.r = 0 THEN card."canvas_x"
       WHEN card."canvas_x" IS NULL OR card."canvas_y" IS NULL THEN NULL
       ELSE LEAST(100000, card."canvas_x" + COALESCE(card."canvas_w", 256) + 16 + (moved.r - CASE WHEN card."body" = '' THEN 1 ELSE 0 END) * 256) END,
  CASE WHEN card."body" = '' AND moved.r = 0 THEN card."canvas_y"
       WHEN card."canvas_x" IS NULL OR card."canvas_y" IS NULL THEN NULL
       ELSE card."canvas_y" END,
  CASE WHEN card."body" = '' AND moved.r = 0 THEN card."canvas_w"
       WHEN card."canvas_x" IS NULL OR card."canvas_y" IS NULL THEN NULL
       ELSE 240 END,
  'IMAGE', 'PLAIN', moved."storage_key", moved."content_type", moved."bytes", moved."uploaded_by_id", moved."uploaded_by_name"
FROM "ws_image_move" moved
JOIN "studioflow"."sf_workspace_card" card ON card."id" = moved."card_id";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "ws_image_move" moved
    LEFT JOIN "studioflow"."sf_workspace_card" element
      ON element."id" = moved."id" AND element."kind" = 'IMAGE' AND element."storage_key" = moved."storage_key"
    WHERE element."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Workspace elements migration refused: an image did not become an image element';
  END IF;
END $$;

DELETE FROM "studioflow"."sf_workspace_card" card
WHERE card."kind" = 'TEXT' AND card."body" = ''
  AND EXISTS (SELECT 1 FROM "ws_image_move" moved WHERE moved."card_id" = card."id");

DROP TABLE "studioflow"."sf_workspace_card_image";
DROP TABLE "ws_image_move";
DROP TABLE "ws_frame_origin";

-- 3. The phone reads the board top to bottom: placed elements by (y, x), then unplaced ones oldest first.
UPDATE "studioflow"."sf_workspace_card" card
SET "sort_order" = ordered.position
FROM (
  SELECT "id", (row_number() OVER (
    PARTITION BY "section_id"
    ORDER BY ("canvas_x" IS NULL OR "canvas_y" IS NULL), "canvas_y", "canvas_x", "created_at", "id"
  ) - 1)::integer AS position
  FROM "studioflow"."sf_workspace_card"
) ordered
WHERE ordered."id" = card."id";

-- 4. Element rules: what each kind holds; images may be narrower than text.
ALTER TABLE "studioflow"."sf_workspace_card" DROP CONSTRAINT IF EXISTS "sf_workspace_card_canvas_w_range";
ALTER TABLE "studioflow"."sf_workspace_card"
  ADD CONSTRAINT "sf_workspace_card_canvas_w_range" CHECK ("canvas_w" IS NULL OR ("canvas_w" >= 120 AND "canvas_w" <= 100000)),
  ADD CONSTRAINT "sf_workspace_card_kind_content" CHECK (
    ("kind" = 'TEXT' AND "storage_key" IS NULL AND "content_type" IS NULL AND "bytes" IS NULL AND "file_name" IS NULL)
    OR ("kind" = 'IMAGE' AND "storage_key" IS NOT NULL AND "content_type" IS NOT NULL AND "bytes" IS NOT NULL AND "file_name" IS NULL AND "body" = '')
    OR ("kind" = 'FILE' AND "storage_key" IS NOT NULL AND "content_type" IS NOT NULL AND "bytes" IS NOT NULL AND "file_name" IS NOT NULL AND "body" = '')
  );
CREATE UNIQUE INDEX "sf_workspace_card_storage_key_key" ON "studioflow"."sf_workspace_card"("storage_key");
