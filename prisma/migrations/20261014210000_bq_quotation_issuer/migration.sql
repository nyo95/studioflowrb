-- The issuer of BQ quotations (owner 2026-10-14): its own name and logo, apart from the platform organisation.
ALTER TABLE "bq"."bq_quotation_settings"
  ADD COLUMN "company_name" TEXT,
  ADD COLUMN "logo_key" TEXT;
