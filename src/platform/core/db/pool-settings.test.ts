import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DB_POOL_DEFAULTS, readDbPoolSettings } from "./pool-settings";

describe("readDbPoolSettings", () => {
  it("returns the conservative defaults when no settings are present", () => {
    assert.deepStrictEqual(readDbPoolSettings({}), {
      max: DB_POOL_DEFAULTS.max,
      idleTimeoutMillis: DB_POOL_DEFAULTS.idleTimeoutMillis,
      connectionTimeoutMillis: DB_POOL_DEFAULTS.connectionTimeoutMillis,
    });
  });

  it("treats empty-string values as unset", () => {
    assert.deepStrictEqual(
      readDbPoolSettings({
        DB_POOL_MAX: "",
        DB_POOL_IDLE_TIMEOUT_MS: "",
        DB_POOL_CONNECTION_TIMEOUT_MS: "",
      }),
      {
        max: DB_POOL_DEFAULTS.max,
        idleTimeoutMillis: DB_POOL_DEFAULTS.idleTimeoutMillis,
        connectionTimeoutMillis: DB_POOL_DEFAULTS.connectionTimeoutMillis,
      },
    );
  });

  it("applies explicit non-secret pool overrides", () => {
    assert.deepStrictEqual(
      readDbPoolSettings({
        DATABASE_URL: "postgresql://localhost:5432/db",
        DB_POOL_MAX: "4",
        DB_POOL_IDLE_TIMEOUT_MS: "1000",
        DB_POOL_CONNECTION_TIMEOUT_MS: "250",
      }),
      { max: 4, idleTimeoutMillis: 1000, connectionTimeoutMillis: 250 },
    );
  });

  it("rejects non-positive and malformed values, naming the offending variable", () => {
    const invalid = ["0", "-1", "abc", "2.5", "10px"];
    for (const value of invalid) {
      assert.throws(
        () => readDbPoolSettings({ DB_POOL_MAX: value }),
        (error: unknown) => error instanceof Error && error.message.includes("DB_POOL_MAX"),
      );
      assert.throws(
        () => readDbPoolSettings({ DB_POOL_IDLE_TIMEOUT_MS: value }),
        (error: unknown) =>
          error instanceof Error && error.message.includes("DB_POOL_IDLE_TIMEOUT_MS"),
      );
      assert.throws(
        () => readDbPoolSettings({ DB_POOL_CONNECTION_TIMEOUT_MS: value }),
        (error: unknown) =>
          error instanceof Error && error.message.includes("DB_POOL_CONNECTION_TIMEOUT_MS"),
      );
    }
  });
});
