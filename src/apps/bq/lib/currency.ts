import { AppError } from "@platform/core/errors";

export function requireRupiah(value: string): "IDR" {
  if (value.trim().toUpperCase() !== "IDR") {
    throw new AppError("VALIDATION", "bq.currency.rupiah-only", "BQ works in Rupiah only for now.");
  }
  return "IDR";
}
