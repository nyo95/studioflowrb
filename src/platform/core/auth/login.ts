import { AppError } from "@platform/core/errors";
import { normalizeEmail } from "@platform/utilities/normalization";

import { loginFailureError } from "./failure";
import { isValidIdentityEmail } from "./identity-validation";
import { DUMMY_PASSWORD_HASH, isValidPasswordLength, verifyPassword } from "./password";
import { createSession, type CreatedSession, type DbClient, type SessionClientMetadata } from "./session-service";
import {
  deriveLoginEmailKey,
  deriveLoginNetworkKey,
  type LoginLimiter,
  type LoginNetworkKeySource,
} from "./limiter";

/**
 * Authenticated login composition (Foundation F0 §3).
 *
 * Order is locked:
 * 1. normalize the email (trimmed, NFC, lowercase);
 * 2. consume BOTH limiter buckets BEFORE credential verification — an
 *    infrastructure failure fails login CLOSED with `INFRASTRUCTURE`;
 * 3. look the user up and perform exactly one Argon2 verification — against
 *    the stored hash for a real user, against a valid non-user dummy hash
 *    otherwise, so every failure path costs the same and leaks nothing;
 * 4. unknown email, disabled user, malformed input, and wrong password all
 *    throw the identical generic failure;
 * 5. success resets the normalized-email failure bucket (never the network
 *    bucket) and creates the database session.
 *
 * The limiter is injected: server composition uses the atomic PostgreSQL
 * adapter; tests use focused fakes. No in-memory fallback exists in runtime.
 */

export type LoginOutcome = {
  session: CreatedSession;
  user: { id: string; displayName: string; email: string };
};

export type LoginPorts = {
  db: DbClient;
  limiter: LoginLimiter;
  /** Focused test seam proving every attempt performs exactly one verify. */
  verifyPassword?: typeof verifyPassword;
};

export async function performLogin(
  ports: LoginPorts,
  input: {
    email: string;
    password: string;
    networkKeySource: LoginNetworkKeySource;
  } & SessionClientMetadata,
): Promise<LoginOutcome> {
  const normalizedEmail = normalizeEmail(input.email);
  const emailKey = deriveLoginEmailKey(normalizedEmail);
  const networkKey = deriveLoginNetworkKey(input.networkKeySource);

  const limit = await ports.limiter.consume({ emailKey, networkKey });
  if (!limit.allowed) {
    const minutes = Math.max(1, Math.ceil((limit.retryAfterSeconds ?? 0) / 60));
    throw new AppError(
      "FORBIDDEN",
      "LOGIN_RATE_LIMITED",
      `Too many sign-in attempts. Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      { details: { retryAfterSeconds: limit.retryAfterSeconds } },
    );
  }

  const credentialShapeValid = isValidIdentityEmail(input.email) && isValidPasswordLength(input.password);
  const user = credentialShapeValid
    ? await ports.db.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true, display_name: true, email: true, status: true, password_hash: true },
      })
    : null;

  const verify = ports.verifyPassword ?? verifyPassword;
  const verified = await verify(user?.password_hash ?? DUMMY_PASSWORD_HASH, input.password);

  if (!credentialShapeValid || !user || !verified || user.status === "DISABLED") {
    throw loginFailureError();
  }

  await ports.limiter.resetEmailBucket(emailKey);

  const session = await createSession(ports.db, {
    userId: user.id,
    userAgent: input.userAgent,
    clientAddress: input.clientAddress,
  });

  return {
    session,
    user: { id: user.id, displayName: user.display_name, email: user.email },
  };
}
