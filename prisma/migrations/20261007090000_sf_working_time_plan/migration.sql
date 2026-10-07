ALTER TABLE "studioflow"."sf_project"
  ADD COLUMN "fit_out_start_date" DATE,
  ADD COLUMN "plan_overrides" JSONB;

ALTER TABLE "studioflow"."sf_phase"
  ADD COLUMN "planned_dates_manual" BOOLEAN NOT NULL DEFAULT false;

UPDATE "studioflow"."sf_phase"
SET "planned_dates_manual" = true
WHERE "planned_start_date" IS NOT NULL OR "planned_end_date" IS NOT NULL;

ALTER TABLE "studioflow"."sf_settings"
  ADD COLUMN "cd_mall_days" INTEGER NOT NULL DEFAULT 5 CHECK ("cd_mall_days" BETWEEN 1 AND 260),
  ADD COLUMN "cd_final_days" INTEGER NOT NULL DEFAULT 5 CHECK ("cd_final_days" BETWEEN 1 AND 260),
  ADD COLUMN "fit_out_gap_days" INTEGER NOT NULL DEFAULT 5 CHECK ("fit_out_gap_days" BETWEEN 1 AND 260),
  ADD COLUMN "fit_out_to_handover_days" INTEGER NOT NULL DEFAULT 40 CHECK ("fit_out_to_handover_days" BETWEEN 1 AND 260),
  ADD COLUMN "handover_to_opening_days" INTEGER NOT NULL DEFAULT 10 CHECK ("handover_to_opening_days" BETWEEN 1 AND 260);

CREATE TABLE "studioflow"."sf_holiday" (
  "id" UUID NOT NULL,
  "date" DATE NOT NULL,
  "label" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "created_by_id" TEXT,
  "updated_by_id" TEXT,
  CONSTRAINT "sf_holiday_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sf_holiday_date_key" UNIQUE ("date")
);

UPDATE "studioflow"."sf_phase_definition"
SET "name" = 'Construction'
WHERE "id" = '00000000-0000-4000-8000-000000000105' AND "name" = 'Supervision';

UPDATE "studioflow"."sf_phase"
SET "name_snapshot" = 'Construction'
WHERE "definition_id" = '00000000-0000-4000-8000-000000000105';
