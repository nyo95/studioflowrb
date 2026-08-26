import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assessPartyQuickEntry,
  assertBrandScopedContactAllowed,
  assertPartyCanBeDeleted,
  assertPartyEligibleForRole,
  assertPartyRoleCanBeRemoved,
  mapLegacyPartyClassification,
  normalizePartyRoles,
  normalizePartyType,
  operationalRolesFromRelationshipEvidence,
} from "./party-rules";

describe("Party domain rules", () => {
  it("keeps structural type separate and maps only the locked COMPANY alias", () => {
    assert.equal(normalizePartyType("company"), "ORGANIZATION");
    assert.equal(normalizePartyType(" individual "), "INDIVIDUAL");
    assert.throws(() => normalizePartyType("supplier"), { code: "PARTY_TYPE_INVALID" });
  });

  it("maps legacy classifications to the locked role/business-type split", () => {
    assert.deepEqual(mapLegacyPartyClassification("SUPPLIER"), {
      roles: ["MATERIAL_SUPPLIER"],
      businessTypeCode: null,
    });
    assert.deepEqual(mapLegacyPartyClassification("retail"), {
      roles: ["MATERIAL_SUPPLIER"],
      businessTypeCode: "RETAILER",
    });
    assert.deepEqual(mapLegacyPartyClassification("Vendor"), {
      roles: ["WORK_VENDOR"],
      businessTypeCode: "SERVICE_PROVIDER",
    });
    assert.deepEqual(mapLegacyPartyClassification("MANUFACTURER"), {
      roles: [],
      businessTypeCode: "MANUFACTURER",
    });
    assert.throws(() => mapLegacyPartyClassification("WHOLESALER"), {
      code: "LEGACY_PARTY_CLASSIFICATION_UNKNOWN",
    });
  });

  it("derives operational roles only from strong commercial relationship evidence", () => {
    assert.deepEqual(operationalRolesFromRelationshipEvidence({
      hasBrandSupplier: true,
      hasSkuPrice: false,
      hasWorkPrice: true,
    }), ["MATERIAL_SUPPLIER", "WORK_VENDOR"]);
    assert.deepEqual(operationalRolesFromRelationshipEvidence({
      hasBrandSupplier: false,
      hasSkuPrice: false,
      hasWorkPrice: false,
    }), []);
    assert.deepEqual(normalizePartyRoles(["WORK_VENDOR", "MATERIAL_SUPPLIER", "WORK_VENDOR"]), [
      "MATERIAL_SUPPLIER",
      "WORK_VENDOR",
    ]);
  });

  it("checks operational role and live state without consulting BusinessType", () => {
    assert.doesNotThrow(() => assertPartyEligibleForRole({
      deletedAt: null,
      roles: ["MATERIAL_SUPPLIER"],
    }, "MATERIAL_SUPPLIER"));
    assert.throws(() => assertPartyEligibleForRole({
      deletedAt: null,
      roles: ["WORK_VENDOR"],
    }, "MATERIAL_SUPPLIER"), { code: "PARTY_NOT_OPERATIONALLY_ELIGIBLE" });
  });

  it("prevents removing the final live role or a commercially referenced role", () => {
    assert.throws(() => assertPartyRoleCanBeRemoved({
      deletedAt: null,
      currentRoles: ["MATERIAL_SUPPLIER"],
      role: "MATERIAL_SUPPLIER",
      references: { liveBrandSuppliers: 0, canonicalSkuPrices: 0, liveWorkPrices: 0 },
    }), { code: "PARTY_REQUIRES_OPERATIONAL_ROLE" });

    assert.throws(() => assertPartyRoleCanBeRemoved({
      deletedAt: null,
      currentRoles: ["MATERIAL_SUPPLIER", "WORK_VENDOR"],
      role: "MATERIAL_SUPPLIER",
      references: { liveBrandSuppliers: 1, canonicalSkuPrices: 0, liveWorkPrices: 0 },
    }), { code: "PARTY_ROLE_STILL_REFERENCED" });

    assert.doesNotThrow(() => assertPartyRoleCanBeRemoved({
      deletedAt: null,
      currentRoles: ["MATERIAL_SUPPLIER", "WORK_VENDOR"],
      role: "MATERIAL_SUPPLIER",
      references: { liveBrandSuppliers: 0, canonicalSkuPrices: 0, liveWorkPrices: 0 },
    }));
  });

  it("blocks Party deletion while any locked commercial reference remains", () => {
    assert.doesNotThrow(() => assertPartyCanBeDeleted({
      liveOwnedBrands: 0,
      liveBrandSuppliers: 0,
      canonicalSkuPrices: 0,
      liveWorkPrices: 0,
    }));
    assert.throws(() => assertPartyCanBeDeleted({
      liveOwnedBrands: 1,
      liveBrandSuppliers: 0,
      canonicalSkuPrices: 0,
      liveWorkPrices: 0,
    }), { code: "PARTY_STILL_REFERENCED" });
  });

  it("allows Brand-scoped contacts only for a live owned/supplied Brand", () => {
    assert.doesNotThrow(() => assertBrandScopedContactAllowed({
      brandId: null,
      brandDeletedAt: null,
      partyOwnsBrand: false,
      hasLiveBrandSupplier: false,
    }));
    assert.doesNotThrow(() => assertBrandScopedContactAllowed({
      brandId: "brand-1",
      brandDeletedAt: null,
      partyOwnsBrand: false,
      hasLiveBrandSupplier: true,
    }));
    assert.throws(() => assertBrandScopedContactAllowed({
      brandId: "brand-1",
      brandDeletedAt: null,
      partyOwnsBrand: false,
      hasLiveBrandSupplier: false,
    }), { code: "PARTY_CONTACT_BRAND_SCOPE_INVALID" });
  });

  it("quick entry returns missing information instead of guessing classifications", () => {
    assert.deepEqual(assessPartyQuickEntry({ name: "  Vendor Baru  " }), {
      ready: false,
      missing: ["type", "roles"],
    });
    assert.deepEqual(assessPartyQuickEntry({
      name: "  Vendor Baru  ",
      type: "ORGANIZATION",
      roles: ["WORK_VENDOR"],
    }), {
      ready: true,
      value: { name: "Vendor Baru", type: "ORGANIZATION", roles: ["WORK_VENDOR"] },
    });
  });
});
