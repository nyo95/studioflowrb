-- CreateTable
CREATE TABLE "studioflow"."sf_asset_cleanup_failure" (
    "id" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "first_failed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "sf_asset_cleanup_failure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sf_asset_cleanup_failure_storage_key_key" ON "studioflow"."sf_asset_cleanup_failure"("storage_key");
