import { AppError } from "@platform/core/errors";

/**
 * The single generic login failure. Unknown email, disabled user, malformed
 * input, and wrong password are indistinguishable to the client: identical
 * kind, code, and copy, backed by equivalent verification work.
 */
export function loginFailureError(): AppError {
  return new AppError("UNAUTHENTICATED", "LOGIN_FAILED", "Sign in failed. Check your email and password.");
}
