import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { requireDisposableTestDatabaseUrl } from "./test-support";

describe("disposable database guard", () => {
  it("accepts only matching URLs whose database name is explicitly marked for tests", () => {
    const url = "postgresql://studioflow:secret@localhost:5433/studioflow_rebuild_test";
    assert.equal(
      requireDisposableTestDatabaseUrl({ DATABASE_URL: url, PLATFORM_TEST_DATABASE_URL: url }),
      url,
    );
  });

  it("rejects the live development database even when both variables match", () => {
    const url = "postgresql://masterdata:secret@localhost:5433/masterdata";
    assert.throws(
      () => requireDisposableTestDatabaseUrl({ DATABASE_URL: url, PLATFORM_TEST_DATABASE_URL: url }),
      /must explicitly contain a test marker/,
    );
  });

  it("rejects missing, mismatched, and invalid URLs", () => {
    assert.throws(() => requireDisposableTestDatabaseUrl({}), /set both DATABASE_URL/);
    assert.throws(
      () =>
        requireDisposableTestDatabaseUrl({
          DATABASE_URL: "postgresql://localhost/app_test",
          PLATFORM_TEST_DATABASE_URL: "postgresql://localhost/other_test",
        }),
      /does not equal/,
    );
    assert.throws(
      () => requireDisposableTestDatabaseUrl({ DATABASE_URL: "not-a-url", PLATFORM_TEST_DATABASE_URL: "not-a-url" }),
      /URL is invalid/,
    );
  });
});
