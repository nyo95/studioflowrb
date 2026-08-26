import { AppError } from "@platform/core/errors";
import { normalizeText } from "@platform/utilities/normalization";

export const PARTY_TYPES = ["ORGANIZATION", "INDIVIDUAL"] as const;
export type PartyType = (typeof PARTY_TYPES)[number];

export const PARTY_ROLES = ["MATERIAL_SUPPLIER", "WORK_VENDOR"] as const;
export type PartyRole = (typeof PARTY_ROLES)[number];

export type LegacyPartyClassification =
  | "SUPPLIER"
  | "RETAIL"
  | "DISTRIBUTOR"
  | "SUBCON"
  | "SERVICE_VENDOR"
  | "VENDOR"
  | "MANUFACTURER";

export type LegacyPartyMapping = {
  roles: readonly PartyRole[];
  businessTypeCode: "RETAILER" | "DISTRIBUTOR" | "CONTRACTOR" | "SERVICE_PROVIDER" | "MANUFACTURER" | null;
};

const LEGACY_PARTY_MAPPINGS: Readonly<Record<LegacyPartyClassification, LegacyPartyMapping>> = {
  SUPPLIER: { roles: ["MATERIAL_SUPPLIER"], businessTypeCode: null },
  RETAIL: { roles: ["MATERIAL_SUPPLIER"], businessTypeCode: "RETAILER" },
  DISTRIBUTOR: { roles: ["MATERIAL_SUPPLIER"], businessTypeCode: "DISTRIBUTOR" },
  SUBCON: { roles: ["WORK_VENDOR"], businessTypeCode: "CONTRACTOR" },
  SERVICE_VENDOR: { roles: ["WORK_VENDOR"], businessTypeCode: "SERVICE_PROVIDER" },
  VENDOR: { roles: ["WORK_VENDOR"], businessTypeCode: "SERVICE_PROVIDER" },
  MANUFACTURER: { roles: [], businessTypeCode: "MANUFACTURER" },
};

export type PartyRoleReferences = {
  liveBrandSuppliers: number;
  canonicalSkuPrices: number;
  liveWorkPrices: number;
};

export type PartyDeleteReferences = PartyRoleReferences & {
  liveOwnedBrands: number;
};

export function normalizePartyType(value: string): PartyType {
  const normalized = normalizeText(value).toLocaleUpperCase("en-US");
  if (normalized === "COMPANY") return "ORGANIZATION";
  if (normalized === "ORGANIZATION" || normalized === "INDIVIDUAL") return normalized;
  throw new AppError(
    "VALIDATION",
    "PARTY_TYPE_INVALID",
    "Party type must be Organization or Individual.",
  );
}

export function mapLegacyPartyClassification(value: string): LegacyPartyMapping {
  const normalized = normalizeText(value).toLocaleUpperCase("en-US");
  if (!Object.hasOwn(LEGACY_PARTY_MAPPINGS, normalized)) {
    throw new AppError(
      "VALIDATION",
      "LEGACY_PARTY_CLASSIFICATION_UNKNOWN",
      "The legacy Party classification has no approved mapping.",
    );
  }
  return LEGACY_PARTY_MAPPINGS[normalized as LegacyPartyClassification];
}

/** Relationship evidence may add roles; labels and Brand ownership never do. */
export function operationalRolesFromRelationshipEvidence(input: {
  hasBrandSupplier: boolean;
  hasSkuPrice: boolean;
  hasWorkPrice: boolean;
}): PartyRole[] {
  const roles: PartyRole[] = [];
  if (input.hasBrandSupplier || input.hasSkuPrice) roles.push("MATERIAL_SUPPLIER");
  if (input.hasWorkPrice) roles.push("WORK_VENDOR");
  return roles;
}

export function normalizePartyRoles(values: readonly PartyRole[]): PartyRole[] {
  const selected = new Set(values);
  return PARTY_ROLES.filter((role) => selected.has(role));
}

export function assertPartyEligibleForRole(party: {
  deletedAt: Date | null;
  roles: readonly PartyRole[];
}, requiredRole: PartyRole): void {
  if (party.deletedAt !== null || !party.roles.includes(requiredRole)) {
    throw new AppError(
      "VALIDATION",
      "PARTY_NOT_OPERATIONALLY_ELIGIBLE",
      "The selected Party is not eligible for this commercial role.",
      { details: { requiredRole } },
    );
  }
}

export function assertPartyRoleCanBeRemoved(input: {
  deletedAt: Date | null;
  currentRoles: readonly PartyRole[];
  role: PartyRole;
  references: PartyRoleReferences;
}): void {
  const remaining = normalizePartyRoles(input.currentRoles.filter((role) => role !== input.role));
  if (input.deletedAt === null && remaining.length === 0) {
    throw new AppError(
      "INVARIANT",
      "PARTY_REQUIRES_OPERATIONAL_ROLE",
      "A live Party must retain at least one operational role.",
    );
  }

  const blocked = input.role === "MATERIAL_SUPPLIER"
    ? input.references.liveBrandSuppliers > 0 || input.references.canonicalSkuPrices > 0
    : input.references.liveWorkPrices > 0;
  if (blocked) {
    throw new AppError(
      "CONFLICT",
      "PARTY_ROLE_STILL_REFERENCED",
      "This operational role is still required by live commercial records.",
      { details: { role: input.role } },
    );
  }
}

export function assertPartyCanBeDeleted(references: PartyDeleteReferences): void {
  const blockers = Object.entries(references)
    .filter(([, count]) => count > 0)
    .map(([name]) => name);
  if (blockers.length > 0) {
    throw new AppError(
      "CONFLICT",
      "PARTY_STILL_REFERENCED",
      "This Party is still used by live commercial records and cannot be deleted.",
      { details: { blockers } },
    );
  }
}

export function assertBrandScopedContactAllowed(input: {
  brandId: string | null;
  brandDeletedAt: Date | null;
  partyOwnsBrand: boolean;
  hasLiveBrandSupplier: boolean;
}): void {
  if (input.brandId === null) return;
  if (
    input.brandDeletedAt !== null ||
    (!input.partyOwnsBrand && !input.hasLiveBrandSupplier)
  ) {
    throw new AppError(
      "VALIDATION",
      "PARTY_CONTACT_BRAND_SCOPE_INVALID",
      "A Brand-scoped contact requires a live Brand owned or supplied by this Party.",
    );
  }
}

export type PartyQuickEntryAssessment =
  | {
      ready: true;
      value: { name: string; type: PartyType; roles: PartyRole[] };
    }
  | {
      ready: false;
      missing: readonly ("name" | "type" | "roles")[];
    };

export function assessPartyQuickEntry(input: {
  name?: string;
  type?: PartyType;
  roles?: readonly PartyRole[];
}): PartyQuickEntryAssessment {
  const name = input.name === undefined ? "" : normalizeText(input.name);
  const roles = normalizePartyRoles(input.roles ?? []);
  const missing: ("name" | "type" | "roles")[] = [];
  if (!name) missing.push("name");
  if (input.type === undefined) missing.push("type");
  if (roles.length === 0) missing.push("roles");
  if (missing.length > 0) return { ready: false, missing };
  return { ready: true, value: { name, type: input.type!, roles } };
}
