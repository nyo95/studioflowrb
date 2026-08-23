import { Prisma } from "@/generated/prisma/client";

/**
 * Platform Core shared error taxonomy and safe transport mapping (CORE.md §6).
 *
 * Expected errors are mapped exactly once at the transport boundary via
 * `toSafeErrorPayload`. Stack traces, causes, raw messages, Prisma internals,
 * constraint names/meta, SQL, and environment values never cross that boundary.
 * Framework redirect/not-found control-flow errors are rethrown, never mapped.
 */

export const ERROR_KINDS = [
  "VALIDATION",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "INVARIANT",
  "INFRASTRUCTURE",
  "INTERNAL",
] as const;

export type ErrorKind = (typeof ERROR_KINDS)[number];

export type ErrorDetails = Record<string, unknown>;

export type SafeErrorPayload = {
  kind: ErrorKind;
  code: string;
  safeMessage: string;
  details?: ErrorDetails;
};

const INTERNAL_FALLBACK_CODE = "INTERNAL";
const INTERNAL_FALLBACK_MESSAGE = "Something went wrong. Please try again.";

export class AppError extends Error {
  readonly kind: ErrorKind;
  readonly code: string;
  readonly safeMessage: string;
  readonly details?: ErrorDetails;

  constructor(
    kind: ErrorKind,
    code: string,
    safeMessage: string,
    options: { details?: ErrorDetails; cause?: unknown } = {},
  ) {
    super(safeMessage, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "AppError";
    this.kind = kind;
    this.code = code;
    this.safeMessage = safeMessage;
    if (options.details !== undefined) this.details = options.details;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Detects documented Next.js framework control-flow errors by their stable
 * `digest` prefix (`redirect()` → `NEXT_REDIRECT`, `notFound()` and HTTP
 * fallbacks → `NEXT_HTTP_ERROR_FALLBACK`). No Next.js internals are imported.
 */
const FRAMEWORK_CONTROL_FLOW_DIGEST_PREFIXES = [
  "NEXT_REDIRECT",
  "NEXT_HTTP_ERROR_FALLBACK",
] as const;

export function isFrameworkControlFlowError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("digest" in error)) return false;
  const digest = (error as { digest?: unknown }).digest;
  return (
    typeof digest === "string" &&
    FRAMEWORK_CONTROL_FLOW_DIGEST_PREFIXES.some((prefix) => digest.startsWith(prefix))
  );
}

export function rethrowIfFrameworkControlFlow(error: unknown): void {
  if (isFrameworkControlFlowError(error)) throw error;
}

/**
 * Central mapping of known Prisma request errors. Messages are generic and
 * actionable; constraint names (`meta.target`), queries, and values are
 * deliberately excluded.
 */
export function mapPrismaKnownError(error: Prisma.PrismaClientKnownRequestError): AppError {
  switch (error.code) {
    case "P2002":
      return new AppError(
        "CONFLICT",
        "P2002",
        "This value is already used by another record. Use a different value and try again.",
      );
    case "P2025":
      return new AppError(
        "NOT_FOUND",
        "P2025",
        "This record no longer exists or was changed. Refresh and try again.",
      );
    case "P2003":
      return new AppError(
        "CONFLICT",
        "P2003",
        "A related record is missing or still referenced. Refresh and try again.",
      );
    case "P2014":
      return new AppError(
        "CONFLICT",
        "P2014",
        "This change would break a required relation. Review the related records and try again.",
      );
    default:
      return new AppError(
        "INFRASTRUCTURE",
        error.code,
        "The database could not save this change. Try again; if it keeps failing, contact an administrator.",
      );
  }
}

function toPayload(error: AppError): SafeErrorPayload {
  return error.details !== undefined
    ? { kind: error.kind, code: error.code, safeMessage: error.safeMessage, details: error.details }
    : { kind: error.kind, code: error.code, safeMessage: error.safeMessage };
}

/**
 * The single transport-boundary mapper. Rethrows framework control-flow
 * errors, passes `AppError` through as its safe payload, maps known Prisma
 * errors centrally, and collapses everything else into a generic
 * `INTERNAL` payload that never carries the original message or cause.
 */
export function toSafeErrorPayload(error: unknown): SafeErrorPayload {
  rethrowIfFrameworkControlFlow(error);
  if (isAppError(error)) return toPayload(error);
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return toPayload(mapPrismaKnownError(error));
  }
  return { kind: "INTERNAL", code: INTERNAL_FALLBACK_CODE, safeMessage: INTERNAL_FALLBACK_MESSAGE };
}
