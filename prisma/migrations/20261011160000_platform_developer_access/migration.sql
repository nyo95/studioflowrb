CREATE TABLE "platform"."developer_access" (
    "id" TEXT NOT NULL DEFAULT 'developer',
    "totp_secret_enc" TEXT NOT NULL,
    "last_step" BIGINT,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "enrolled_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "developer_access_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "developer_access_singleton_check" CHECK ("id" = 'developer'),
    CONSTRAINT "developer_access_failed_count_check" CHECK ("failed_count" >= 0)
);

CREATE TABLE "platform"."developer_recovery_code" (
    "code_hash" TEXT NOT NULL,
    "used_at" TIMESTAMPTZ(3),

    CONSTRAINT "developer_recovery_code_pkey" PRIMARY KEY ("code_hash")
);

CREATE TABLE "platform"."developer_session" (
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "developer_session_pkey" PRIMARY KEY ("token_hash")
);

CREATE INDEX "developer_session_last_seen_at_idx" ON "platform"."developer_session"("last_seen_at");
CREATE INDEX "developer_session_expires_at_idx" ON "platform"."developer_session"("expires_at");
