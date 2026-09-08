-- SF-WO-5: Client responses
-- Schema: studioflow only. Purely additive. No ALTER/DROP on any existing table.
--
-- Note: sf_iteration_point.source_response_id / source_point_id stay plain TEXT
-- (no FK constraint added) to keep this migration strictly additive — adding a
-- constraint to an existing table would be an ALTER. Provenance is written by
-- the service and is covered by its guards.

CREATE TYPE "studioflow"."sf_response_kind" AS ENUM ('APPROVAL', 'REVISION');

CREATE TABLE "studioflow"."sf_response" (
  "id"             TEXT                            NOT NULL,
  "iteration_id"   TEXT                            NOT NULL,
  "kind"           "studioflow"."sf_response_kind" NOT NULL,
  "note"           TEXT,
  "received_at"    TIMESTAMPTZ                     NOT NULL DEFAULT NOW(),
  "recorded_by_id" TEXT                            NOT NULL,

  CONSTRAINT "sf_response_pkey"           PRIMARY KEY ("id"),
  CONSTRAINT "sf_response_iteration_fkey" FOREIGN KEY ("iteration_id")
    REFERENCES "studioflow"."sf_iteration" ("id")
);

CREATE INDEX "sf_response_iteration_idx" ON "studioflow"."sf_response" ("iteration_id");

CREATE TABLE "studioflow"."sf_response_point" (
  "id"          TEXT    NOT NULL,
  "response_id" TEXT    NOT NULL,
  "text"        TEXT    NOT NULL,
  "sort_order"  INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "sf_response_point_pkey"          PRIMARY KEY ("id"),
  CONSTRAINT "sf_response_point_response_fkey" FOREIGN KEY ("response_id")
    REFERENCES "studioflow"."sf_response" ("id")
);

CREATE INDEX "sf_response_point_response_idx" ON "studioflow"."sf_response_point" ("response_id");
