-- The studio's quotation letter (owner 2026-10-14): addressee, project facts, validity, schedule, payment terms,
-- PPN and rounding per project; letterhead and defaults in one BQ-owned settings row.
ALTER TABLE "bq"."bq_project"
  ADD COLUMN "client_contact" TEXT,
  ADD COLUMN "client_address" TEXT,
  ADD COLUMN "project_area" TEXT,
  ADD COLUMN "project_location" TEXT,
  ADD COLUMN "quotation_valid_until" DATE,
  ADD COLUMN "quotation_schedule" TEXT,
  ADD COLUMN "quotation_payment_terms" TEXT,
  ADD COLUMN "quotation_ppn_pct" DECIMAL(6,3),
  ADD COLUMN "quotation_rounding" DECIMAL(18,2);

CREATE TABLE "bq"."bq_quotation_settings" (
    "id" TEXT NOT NULL DEFAULT 'bq_quotation_settings',
    "company_address" TEXT,
    "company_email" TEXT,
    "signer_name" TEXT,
    "signature_key" TEXT,
    "default_payment_terms" TEXT,
    "default_ppn_pct" DECIMAL(6,3) NOT NULL DEFAULT 11,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_label" TEXT,

    CONSTRAINT "bq_quotation_settings_pkey" PRIMARY KEY ("id")
);
