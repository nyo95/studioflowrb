-- Template items now carry the same is_blocking policy bit as checklist items,
-- so seeding correctly propagates blocking vs. optional into generated rows.
ALTER TABLE "studioflow"."sf_checklist_template"
  ADD COLUMN "is_blocking" BOOLEAN NOT NULL DEFAULT true;
