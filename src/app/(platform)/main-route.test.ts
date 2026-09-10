import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveMainRoute } from "./main-route";

const APPS = [
  { appId: "masterdata", rootPath: "/masterdata" },
  { appId: "bq", rootPath: "/bq" },
  { appId: "studioflow", rootPath: "/studioflow" },
];

describe("resolveMainRoute", () => {
  it("keeps default Master Data ahead of landing when main is unset", () => {
    assert.equal(resolveMainRoute(APPS, null, "bq"), "/masterdata");
    assert.equal(resolveMainRoute(APPS.filter((app) => app.appId !== "masterdata"), null, "studioflow"), "/studioflow");
  });
  it("returns null when the user has no accessible app", () => {
    assert.equal(resolveMainRoute([], "bq", "masterdata"), null);
  });

  it("sends an eligible user to the configured main app", () => {
    assert.equal(resolveMainRoute(APPS, "bq", null), "/bq");
  });

  it("falls back to the configured landing app when the user cannot reach the main app", () => {
    const withoutBq = APPS.filter((app) => app.appId !== "bq");
    assert.equal(resolveMainRoute(withoutBq, "bq", "studioflow"), "/studioflow");
  });

  it("ignores an unknown or inaccessible main app id rather than erroring", () => {
    assert.equal(resolveMainRoute(APPS, "not-a-real-app", null), "/masterdata");
  });

  it("ignores an unknown or inaccessible landing app id the same way", () => {
    const withoutBq = APPS.filter((app) => app.appId !== "bq");
    assert.equal(resolveMainRoute(withoutBq, "bq", "not-a-real-app"), "/masterdata");
  });

  it("preserves the pre-existing default when nothing is configured: Master Data first, then registry order", () => {
    assert.equal(resolveMainRoute(APPS, null, null), "/masterdata");
    const withoutMasterdata = APPS.filter((app) => app.appId !== "masterdata");
    assert.equal(resolveMainRoute(withoutMasterdata, null, null), "/bq");
  });

  it("never returns a route outside the accessible set", () => {
    const onlyStudioflow = APPS.filter((app) => app.appId === "studioflow");
    assert.equal(resolveMainRoute(onlyStudioflow, "bq", "masterdata"), "/studioflow");
  });
});
