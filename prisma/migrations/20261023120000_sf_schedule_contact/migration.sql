ALTER TABLE "studioflow"."sf_schedule_option" ADD COLUMN "contact" TEXT;
ALTER TABLE "studioflow"."sf_schedule_template_item" ADD COLUMN "contact" TEXT;

-- Data move: only options without a Contact value take it from a labeled notes line.
WITH lines AS (
    SELECT option_row.id, part.ordinality,
           part.line,
           part.line ~* '^[[:space:]]*contact[[:space:]]*:[[:space:]]*[^[:space:]].*$' AS is_contact
    FROM "studioflow"."sf_schedule_option" AS option_row
    CROSS JOIN LATERAL regexp_split_to_table(option_row.notes, E'\r?\n')
        WITH ORDINALITY AS part(line, ordinality)
    WHERE option_row.contact IS NULL AND option_row.notes IS NOT NULL
), moved AS (
    SELECT id,
           (array_agg(btrim(regexp_replace(line, '^[[:space:]]*contact[[:space:]]*:[[:space:]]*', '', 'i'))
                ORDER BY ordinality) FILTER (WHERE is_contact))[1] AS contact,
           nullif(btrim(string_agg(line, E'\n' ORDER BY ordinality) FILTER (WHERE NOT is_contact)), '') AS notes
    FROM lines
    GROUP BY id
    HAVING bool_or(is_contact)
)
UPDATE "studioflow"."sf_schedule_option" AS option_row
SET contact = moved.contact,
    notes = moved.notes,
    search_key = CASE WHEN option_row.search_key = '' THEN lower(moved.contact)
                      ELSE option_row.search_key || ' | ' || lower(moved.contact) END
FROM moved
WHERE option_row.id = moved.id;
