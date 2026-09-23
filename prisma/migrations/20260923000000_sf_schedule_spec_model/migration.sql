-- Product Schedule spec model (owner decisions 2026-09-23, REWORK-CONTRACT §11.3/§11.8).
--
-- 1. "Item No" (sku_text) is the same thing as Type: both are the manufacturer's
--    designation ("Nude Pro - ATS 1132 M"). The duplicate is removed and any
--    value it held is folded into product_name (the Type) so nothing is lost.
-- 2. Free-form spec lines move into an `extra` JSON array of {label, value}.
--    This is additive: the fields that appear on nearly every card stay typed
--    columns, so search, ordering and CSV keep working off the database.
-- 3. card_fields becomes nullable JSON: NULL = "no override, use the default
--    set", an array = an explicit choice that may legitimately be empty. The
--    old TEXT[] used `{}` for both, which made "default" and "everything" the
--    same stored value.

-- ── 1. sku_text → product_name ───────────────────────────────────────────────
UPDATE "studioflow"."sf_schedule_option"
SET "product_name" = left(btrim("product_name") || ' - ' || btrim("sku_text"), 200)
WHERE "sku_text" IS NOT NULL
  AND btrim("sku_text") <> ''
  AND position(upper(btrim("sku_text")) in upper("product_name")) = 0;

UPDATE "studioflow"."sf_schedule_template_item"
SET "product_name" = left(btrim("product_name") || ' - ' || btrim("sku_text"), 200)
WHERE "sku_text" IS NOT NULL
  AND btrim("sku_text") <> ''
  AND position(upper(btrim("sku_text")) in upper("product_name")) = 0;

ALTER TABLE "studioflow"."sf_schedule_option" DROP COLUMN "sku_text";
ALTER TABLE "studioflow"."sf_schedule_template_item" DROP COLUMN "sku_text";

-- ── 2. extra spec fields ─────────────────────────────────────────────────────
ALTER TABLE "studioflow"."sf_schedule_option" ADD COLUMN "extra" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "studioflow"."sf_schedule_template_item" ADD COLUMN "extra" JSONB NOT NULL DEFAULT '[]';

-- ── 3. search_key rebuilt without sku_text, with the legacy placeholder rule ──
-- A row whose brand AND type are both placeholders carries no specification, so
-- it gets an empty key and stays out of the cross-project reuse search (legacy
-- `deriveScheduleSpecFields`).
UPDATE "studioflow"."sf_schedule_option" SET "search_key" =
  CASE
    WHEN (btrim(coalesce("brand_name", '')) = '' OR upper(btrim("brand_name")) = ANY (ARRAY['N/A','UNKNOWN','PENDING','-','—','[RESERVED]','GENERIC','DRAFT','MANUAL ITEM','NEW ITEM','CUSTOM','MANUAL']))
     AND (btrim(coalesce("product_name", '')) = '' OR upper(btrim("product_name")) = ANY (ARRAY['N/A','UNKNOWN','PENDING','-','—','[RESERVED]','GENERIC','DRAFT','MANUAL ITEM','NEW ITEM','CUSTOM','MANUAL']))
    THEN ''
    ELSE (
      SELECT coalesce(string_agg(lower(btrim(part)), ' | ' ORDER BY ord), '')
      FROM unnest(ARRAY["brand_name", "product_name", "color", "pattern", "finishing", "dimension"]) WITH ORDINALITY AS t(part, ord)
      WHERE btrim(coalesce(part, '')) <> ''
    )
  END;

-- ── 4. card_fields: TEXT[] → nullable JSONB ──────────────────────────────────
ALTER TABLE "studioflow"."sf_schedule_entry" ADD COLUMN "card_fields_json" JSONB;
-- `{}` meant "no override" before, and still does — it becomes NULL. A stored
-- choice keeps its fields minus the dropped `sku` key; a choice that was *only*
-- `sku` would become a blank card, so it falls back to the default instead.
UPDATE "studioflow"."sf_schedule_entry"
SET "card_fields_json" = to_jsonb(array_remove("card_fields", 'sku'))
WHERE cardinality(array_remove("card_fields", 'sku')) > 0;
ALTER TABLE "studioflow"."sf_schedule_entry" DROP COLUMN "card_fields";
ALTER TABLE "studioflow"."sf_schedule_entry" RENAME COLUMN "card_fields_json" TO "card_fields";

-- A template item carries the card choice of the row it was saved from, so
-- applying a template reproduces the card the studio approved.
ALTER TABLE "studioflow"."sf_schedule_template_item" ADD COLUMN "card_fields" JSONB;
