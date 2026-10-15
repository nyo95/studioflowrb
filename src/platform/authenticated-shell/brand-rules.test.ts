import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { areaBrandFor, brandMark } from "./brand-rules";

describe("shell brand rules", () => {
  const contractor = { rootPaths: ["/bq", "/masterdata"], name: "Contractor A", logoUrl: null };
  const consultant = { rootPaths: ["/studioflow"], name: "Consultant B", logoUrl: "/b.png" };

  it("marks each area with the identity that owns it, and nothing elsewhere", () => {
    assert.equal(areaBrandFor("/bq/123", [contractor, consultant]), contractor);
    assert.equal(areaBrandFor("/masterdata", [contractor, consultant]), contractor);
    assert.equal(areaBrandFor("/studioflow/projects/p/presentation/b", [contractor, consultant]), consultant);
    assert.equal(areaBrandFor("/", [contractor, consultant]), null);
    assert.equal(areaBrandFor("/settings/general", [contractor, consultant]), null);
    assert.equal(areaBrandFor("/bqx", [contractor]), null);
  });

  it("keeps the monogram rules", () => {
    assert.equal(brandMark("StudioFlow"), "SF");
    assert.equal(brandMark("Contractor A"), "CA");
    assert.equal(brandMark("RAD"), "RAD");
  });
});
