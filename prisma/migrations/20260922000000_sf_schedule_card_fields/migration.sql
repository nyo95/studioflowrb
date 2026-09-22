-- Per-card field selection for the Product Schedule board view, matching
-- legacy's "Card fields" popover. Empty array means "no override": the
-- board shows every populated field, same as today. Purely additive.
ALTER TABLE "studioflow"."sf_schedule_entry" ADD COLUMN "card_fields" TEXT[] NOT NULL DEFAULT '{}';
