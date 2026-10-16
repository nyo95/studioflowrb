CREATE UNIQUE INDEX "sf_deliverable_one_final_per_slot_idx"
  ON "studioflow"."sf_deliverable"("phase_id", "slot_key")
  WHERE "is_final" = true;
