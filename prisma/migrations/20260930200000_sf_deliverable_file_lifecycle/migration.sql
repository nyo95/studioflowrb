ALTER TABLE "studioflow"."sf_deliverable"
  ADD COLUMN "slot_key" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "is_final" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "finalized_at" TIMESTAMP(3),
  ADD COLUMN "finalized_by_id" TEXT,
  ADD COLUMN "expires_at" TIMESTAMP(3),
  ADD COLUMN "expiry_warned_at" TIMESTAMP(3);

UPDATE "studioflow"."sf_deliverable"
SET "slot_key" = lower(trim("name")),
    "expires_at" = CURRENT_TIMESTAMP + INTERVAL '30 days';

CREATE INDEX "sf_deliverable_phase_id_slot_key_created_at_id_idx"
  ON "studioflow"."sf_deliverable"("phase_id", "slot_key", "created_at", "id");
CREATE INDEX "sf_deliverable_expires_at_idx"
  ON "studioflow"."sf_deliverable"("expires_at");
