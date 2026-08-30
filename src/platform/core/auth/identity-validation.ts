import { z } from "zod";

import { AppError } from "@platform/core/errors";
import { normalizeEmail, normalizeText } from "@platform/utilities/normalization";

import { countCodePoints, isValidPasswordLength } from "./password";

const EMAIL_MAX_CODE_POINTS = 254;
const DISPLAY_NAME_MAX_CODE_POINTS = 120;
const emailShape = z.string().email();

export function isValidIdentityEmail(value: string): boolean {
  const normalized = normalizeEmail(value);
  return normalized.length > 0 && countCodePoints(normalized) <= EMAIL_MAX_CODE_POINTS && emailShape.safeParse(normalized).success;
}

export function parseIdentityEmail(value: string): string {
  const normalized = normalizeEmail(value);
  if (!isValidIdentityEmail(normalized)) {
    throw new AppError("VALIDATION", "EMAIL_INVALID", "Enter a valid email address.");
  }
  return normalized;
}

export function parseDisplayName(value: string): string {
  const normalized = normalizeText(value);
  const length = countCodePoints(normalized);
  if (length < 1 || length > DISPLAY_NAME_MAX_CODE_POINTS) {
    throw new AppError("VALIDATION", "DISPLAY_NAME_INVALID", "Enter a display name of 1–120 characters.");
  }
  return normalized;
}

export function parsePassword(value: string): string {
  if (!isValidPasswordLength(value)) {
    throw new AppError("VALIDATION", "PASSWORD_POLICY", "The password must contain between 12 and 128 characters.");
  }
  return value;
}

/** Shared Zod boundary refinements count Unicode code points, never UTF-16 units. */
export const identityEmailSchema = z.string().transform(normalizeEmail).refine(isValidIdentityEmail, "Enter a valid email address.");
export const displayNameSchema = z.string().transform(normalizeText).refine(
  (value) => countCodePoints(value) >= 1 && countCodePoints(value) <= DISPLAY_NAME_MAX_CODE_POINTS,
  "Enter a display name of 1–120 characters.",
);
export const passwordSchema = z.string().refine(isValidPasswordLength, "The password must contain between 12 and 128 characters.");
