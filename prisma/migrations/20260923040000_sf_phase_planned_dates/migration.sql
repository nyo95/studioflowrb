-- Per-phase planned start/end for the portfolio Timeline page; overridable, unset means "no override, fall back to the equal-width sequence split" (owner, 2026-09-23). Additive.

ALTER TABLE "studioflow"."sf_phase" ADD COLUMN "planned_start_date" DATE;
ALTER TABLE "studioflow"."sf_phase" ADD COLUMN "planned_end_date" DATE;
