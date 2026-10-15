ALTER TABLE "studioflow"."sf_deliverable"
  ADD COLUMN "version_number" INTEGER;

WITH numbered AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "phase_id", "slot_key"
    ORDER BY "created_at" ASC, "id" ASC
  )::INTEGER AS "number"
  FROM "studioflow"."sf_deliverable"
)
UPDATE "studioflow"."sf_deliverable" AS d
SET "version_number" = numbered."number"
FROM numbered
WHERE d."id" = numbered."id";

ALTER TABLE "studioflow"."sf_deliverable"
  ALTER COLUMN "version_number" SET NOT NULL;

CREATE UNIQUE INDEX "sf_deliverable_phase_id_slot_key_version_number_key"
  ON "studioflow"."sf_deliverable"("phase_id", "slot_key", "version_number");

CREATE TABLE "studioflow"."sf_deliverable_slot" (
  "phase_id" TEXT NOT NULL,
  "slot_key" TEXT NOT NULL,
  "last_version" INTEGER NOT NULL,
  CONSTRAINT "sf_deliverable_slot_pkey" PRIMARY KEY ("phase_id", "slot_key"),
  CONSTRAINT "sf_deliverable_slot_phase_id_fkey"
    FOREIGN KEY ("phase_id") REFERENCES "studioflow"."sf_phase"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "sf_deliverable_slot_last_version_positive" CHECK ("last_version" > 0)
);

INSERT INTO "studioflow"."sf_deliverable_slot" ("phase_id", "slot_key", "last_version")
SELECT "phase_id", "slot_key", MAX("version_number")
FROM "studioflow"."sf_deliverable"
GROUP BY "phase_id", "slot_key";
