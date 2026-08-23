import type { Prisma } from "@/generated/prisma/client";

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
export function isFrameworkControlFlowError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("digest" in error)) return false;
  const digest = (error as { digest?: unknown }).digest;
  if (typeof digest !== "string") return false;
  const parts = digest.split(";");
  if (parts[0] === "NEXT_HTTP_ERROR_FALLBACK") {
    return parts.length === 2 && [401, 403, 404].includes(Number(parts[1]));
  }
  if (parts[0] !== "NEXT_REDIRECT" || !["replace", "push"].includes(parts[1])) return false;
  return parts.length >= 5 && [303, 307, 308].includes(Number(parts.at(-2)));
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

function isPrismaKnownError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return typeof error === "object" && error !== null && "code" in error &&
    typeof (error as { code?: unknown }).code === "string" &&
    /^P\d{4}$/.test((error as { code: string }).code);
}

const FORBIDDEN_DETAIL_KEYS = /^(?:stack|sql|cause|constraint|query|environment)$/i;

function safeDetails(details: ErrorDetails): ErrorDetails | undefined {
  const seen = new WeakSet<object>();
  const visit = (value: unknown): unknown => {
    if (value === null || typeof value === "string" || typeof value === "boolean") return value;
    if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
    if (Array.isArray(value)) {
      if (seen.has(value)) return undefined;
      seen.add(value);
      const result = value.map(visit);
      seen.delete(value);
      return result.some((entry) => entry === undefined) ? undefined : result;
    }
    if (typeof value !== "object" || seen.has(value)) return undefined;
    seen.add(value);
    const result: ErrorDetails = {};
    for (const [key, entry] of Object.entries(value)) {
      if (FORBIDDEN_DETAIL_KEYS.test(key)) return undefined;
      const safe = visit(entry);
      if (safe === undefined) return undefined;
      result[key] = safe;
    }
    seen.delete(value);
    return result;
  };
  return visit(details) as ErrorDetails | undefined;
}

function toPayload(error: AppError): SafeErrorPayload {
  const details = error.details === undefined ? undefined : safeDetails(error.details);
  return details !== undefined
    ? { kind: error.kind, code: error.code, safeMessage: error.safeMessage, details }
    : { kind: error.kind, code: error.code, safeMessage: error.safeMessage };
}

/**
 * The single transport-boundary mapper. Rethrows framework control-flow
 * errors, passes `AppError` through as its safe payload, maps known Prisma
 * errors centrally, and collapses everything else into a generic
 * `INTERNAL` payload that never carries the original message or cause.
 */
export function toSafeErrorPayload(error: unknown, options: { reportUnknownError?: (error: unknown) => void } = {}): SafeErrorPayload {
  rethrowIfFrameworkControlFlow(error);
  if (isAppError(error)) return toPayload(error);
  if (isPrismaKnownError(error)) {
    return toPayload(mapPrismaKnownError(error));
  }
  options.reportUnknownError?.(error);
  return { kind: "INTERNAL", code: INTERNAL_FALLBACK_CODE, safeMessage: INTERNAL_FALLBACK_MESSAGE };
}
