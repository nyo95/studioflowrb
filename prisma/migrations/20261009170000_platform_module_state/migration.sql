CREATE TYPE "platform"."ModuleRuntimeState" AS ENUM ('ENABLED', 'DISABLED');

CREATE TABLE "platform"."module_state" (
    "module_id" TEXT NOT NULL,
    "state" "platform"."ModuleRuntimeState" NOT NULL DEFAULT 'ENABLED',
    "last_version" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" TEXT NOT NULL,
    CONSTRAINT "module_state_pkey" PRIMARY KEY ("module_id")
);

UPDATE "platform"."Role"
SET "name" = 'Company Administrator', "updated_at" = CURRENT_TIMESTAMP
WHERE "code" = 'platform-owner' AND "name" <> 'Company Administrator';
