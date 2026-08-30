import { RateLimiterPostgres, type RateLimiterRes } from "rate-limiter-flexible";

import { pool } from "@platform/core/db";
import { AppError } from "@platform/core/errors";

import {
  EMAIL_LIMITER_KEY_PREFIX,
  LOGIN_BLOCK_SECONDS,
  LOGIN_DURATION_SECONDS,
  LOGIN_EMAIL_POINTS,
  LOGIN_NETWORK_POINTS,
  NETWORK_LIMITER_KEY_PREFIX,
  type LoginLimitKeys,
  type LoginLimitOutcome,
  type LoginLimiter,
} from "./limiter";

/**
 * Atomic PostgreSQL login limiter adapter (Foundation F0 locked decision).
 *
 * Uses the ONE shared process-level pg pool and the migration-created
 * `platform.LoginRateLimit` table (`tableCreated: true` — no implicit runtime
 * DDL). Store failures are translated to a closed-login
 * `AppError("INFRASTRUCTURE")`, never to an in-memory fallback.
 */

type LoginLimiters = { email: RateLimiterPostgres; network: RateLimiterPostgres };

let limiters: LoginLimiters | undefined;

function getLoginLimiters(): LoginLimiters {
  limiters ??= {
    email: new RateLimiterPostgres({
      storeClient: pool,
      schemaName: "platform",
      tableName: "LoginRateLimit",
      tableCreated: true,
      keyPrefix: EMAIL_LIMITER_KEY_PREFIX,
      points: LOGIN_EMAIL_POINTS,
      duration: LOGIN_DURATION_SECONDS,
      blockDuration: LOGIN_BLOCK_SECONDS,
    }),
    network: new RateLimiterPostgres({
      storeClient: pool,
      schemaName: "platform",
      tableName: "LoginRateLimit",
      tableCreated: true,
      keyPrefix: NETWORK_LIMITER_KEY_PREFIX,
      points: LOGIN_NETWORK_POINTS,
      duration: LOGIN_DURATION_SECONDS,
      blockDuration: LOGIN_BLOCK_SECONDS,
    }),
  };
  return limiters;
}

function isRateLimiterRes(error: unknown): error is RateLimiterRes {
  return typeof error === "object" && error !== null && "msBeforeNext" in error &&
    typeof (error as { msBeforeNext?: unknown }).msBeforeNext === "number";
}

export function createPostgresLoginLimiter(): LoginLimiter {
  return {
    async consume(keys: LoginLimitKeys): Promise<LoginLimitOutcome> {
      const { email, network } = getLoginLimiters();
      const closed = (error: unknown): never => {
        throw new AppError(
          "INFRASTRUCTURE",
          "LOGIN_LIMITER_UNAVAILABLE",
          "Sign-in is temporarily unavailable. Try again shortly.",
          { cause: error },
        );
      };
      try {
        await email.consume(keys.emailKey, 1);
      } catch (error) {
        if (isRateLimiterRes(error)) {
          return { allowed: false, retryAfterSeconds: Math.ceil(error.msBeforeNext / 1000), blockedBy: "email" };
        }
        closed(error);
      }
      try {
        await network.consume(keys.networkKey, 1);
      } catch (error) {
        if (isRateLimiterRes(error)) {
          return { allowed: false, retryAfterSeconds: Math.ceil(error.msBeforeNext / 1000), blockedBy: "network" };
        }
        closed(error);
      }
      return { allowed: true };
    },

    async resetEmailBucket(emailKey: string): Promise<void> {
      const { email } = getLoginLimiters();
      try {
        await email.delete(emailKey);
      } catch (error) {
        throw new AppError(
          "INFRASTRUCTURE",
          "LOGIN_LIMITER_UNAVAILABLE",
          "Sign-in is temporarily unavailable. Try again shortly.",
          { cause: error },
        );
      }
    },
  };
}
