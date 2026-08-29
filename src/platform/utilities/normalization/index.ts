export function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

/**
 * Canonical email normalization for identity keys and storage: Unicode NFC,
 * trimmed, lowercased. Verification/format rules stay with the owning
 * boundary; this only fixes representation so comparisons are stable.
 */
export function normalizeEmail(value: string): string {
  return value.normalize("NFC").trim().toLowerCase();
}
