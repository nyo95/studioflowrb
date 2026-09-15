-- R8.67 recovery: restore the Foundation login limiter table on rebuild
-- databases whose R8.64 migration was already recorded after dropping it.
-- This is additive and touches only the Platform-owned limiter table.

CREATE TABLE IF NOT EXISTS "platform"."LoginRateLimit" (
    "key" VARCHAR(255) PRIMARY KEY,
    "points" INTEGER NOT NULL DEFAULT 0,
    "expire" BIGINT
);
