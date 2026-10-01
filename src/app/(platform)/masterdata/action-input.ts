import { z } from "zod";

import { AppError } from "@platform/core/errors";
import { validationError } from "@platform/core/validation";

export type PriceKind = "material" | "material-labor" | "labor";

export function parsePriceKind(kind: unknown): PriceKind {
  const parsed = z.enum(["material", "material-labor", "labor"]).safeParse(kind);
  if (!parsed.success) throw validationError(parsed.error);
  return parsed.data;
}

export function parseOptionalContactsJson(value: FormDataEntryValue | null): unknown | undefined {
  if (value === null) return undefined;
  try { return JSON.parse(String(value)); }
  catch { throw new AppError("VALIDATION", "CONTACTS_JSON_INVALID", "Supplier contacts payload is malformed."); }
}
