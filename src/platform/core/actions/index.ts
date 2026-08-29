import { ZodError } from "zod";

import {
  AppError,
  isFrameworkControlFlowError,
  toSafeErrorPayload,
  type SafeErrorPayload,
} from "@platform/core/errors";
import { validationError } from "@platform/core/validation";

/**
 * Safe server-action result boundary (CORE.md §13).
 *
 * One framework-thin wrapper: it executes an app-supplied command, rethrows
 * framework control-flow (redirect/not-found), maps expected AppError/Zod/
 * known-Prisma failures through the shared safe error taxonomy, and collapses
 * unexpected errors into a generic INTERNAL payload reported through the
 * injected reporter — raw messages, causes, constraint names, and stack traces
 * never reach clients.
 *
 * It owns NO authentication, permission, transaction, revalidation, redirect,
 * or domain policy. Apps keep those in their own action boundary.
 */

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: SafeErrorPayload };

export type ActionReporter = (error: unknown) => void;

/**
 * Runs a command and returns a safe result instead of throwing. `rethrow`
 * marks framework control-flow errors; the reporter observes unexpected
 * failures server-side only.
 */
export async function runSafeAction<T>(
  command: () => Promise<T>,
  options: { reportUnknownError?: ActionReporter } = {},
): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await command() };
  } catch (error) {
    if (isFrameworkControlFlowError(error)) throw error;
    const payload = toSafeErrorPayload(
      error instanceof ZodError ? validationError(error) : error,
      { reportUnknownError: options.reportUnknownError },
    );
    return { ok: false, error: payload };
  }
}

export function isActionFailure<T>(result: ActionResult<T>): result is { ok: false; error: SafeErrorPayload } {
  return result.ok === false;
}
