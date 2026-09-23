-- MOM: replace the per-row `sf_mom_point` list with one free-typed `content`
-- field per section (owner decision, 2026-09-23; STUDIOFLOW-REWORK-CONTRACT.md §10).
-- List markers ("1.", "-", "*") become literal characters the user types
-- (WhatsApp-style auto-continue), not a computed `list_style`/`style` pair.
--
-- Backfill joins each item's existing points (in order) into one string,
-- reproducing the exact marker each point rendered before this change, so
-- existing MOMs read the same after the migration as before it.

ALTER TABLE "studioflow"."sf_mom_item" ADD COLUMN "content" TEXT NOT NULL DEFAULT '';

DO $$
DECLARE
  item_row RECORD;
  point_row RECORD;
  counter INT;
  prefix TEXT;
  lines TEXT[];
BEGIN
  FOR item_row IN SELECT "id", "list_style" FROM "studioflow"."sf_mom_item" LOOP
    counter := 0;
    lines := ARRAY[]::TEXT[];
    FOR point_row IN
      SELECT "text", "style" FROM "studioflow"."sf_mom_point"
      WHERE "item_id" = item_row.id
      ORDER BY "sort_order" ASC, "created_at" ASC
    LOOP
      IF item_row.list_style = 'NONE' OR point_row.style = 'PLAIN' THEN
        prefix := '';
      ELSE
        counter := counter + 1;
        prefix := CASE item_row.list_style
          WHEN 'DECIMAL' THEN counter || '. '
          WHEN 'DISC' THEN '• '
          WHEN 'DASH' THEN '– '
          ELSE ''
        END;
      END IF;
      lines := array_append(lines, prefix || point_row.text);
    END LOOP;
    UPDATE "studioflow"."sf_mom_item" SET "content" = array_to_string(lines, E'\n') WHERE "id" = item_row.id;
  END LOOP;
END $$;

DROP TABLE "studioflow"."sf_mom_point";
DROP TYPE "studioflow"."sf_mom_point_style";

ALTER TABLE "studioflow"."sf_mom_item" DROP COLUMN "list_style";
DROP TYPE "studioflow"."sf_mom_list_style";
