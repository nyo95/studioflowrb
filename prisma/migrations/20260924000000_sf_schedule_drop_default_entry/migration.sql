-- Owner decision 2026-09-24: "default categories" (a reserved, always-empty
-- schedule entry) is folded into Template Items — a template item with a
-- blank Type now reserves its category with no default product, the same
-- way a live schedule entry already supports "Reserve code only". The
-- separate is_default_entry flag and its dedicated Settings table are gone.
ALTER TABLE "studioflow"."sf_schedule_template_category" DROP COLUMN "is_default_entry";
