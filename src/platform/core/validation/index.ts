import { z } from "zod";

import { AppError } from "@platform/core/errors";

/**
 * Platform Core boundary-validation convention (CORE.md §7).
 *
 * Zod is the standard boundary-validation library. Validation transforms
 * representation only; business invariants stay in domain code.
 * Mutation schemas must reject unknown keys (`z.strictObject` / `.strict()`);
 * omitted and explicit `null` stay distinct where clearing a value matters.
 */

export type ValidationIssue = {
  path: string[];
  message: string;
};

export function toValidationIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.map((segment) => String(segment)),
    message: issue.message,
  }));
}

export function validationError(error: z.ZodError): AppError {
  return new AppError("VALIDATION", "VALIDATION_FAILED", "The submitted data is invalid.", {
    details: { issues: toValidationIssues(error) },
  });
}

/** RFC-4122 UUID scalar. */
export const UuidSchema = z.uuid();

/** ISO-8601 instant; accepts UTC `Z` form, rejects date-only and explicit offsets. */
export const IsoInstantSchema = z.iso.datetime();

/** Date-only calendar value as `YYYY-MM-DD`; never converted through an instant. */
export const DateOnlySchema = z.iso.date();
