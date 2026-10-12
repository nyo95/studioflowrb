import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { NextRequest } from "next/server";

import { proxy } from "./proxy";

describe("application session proxy", () => {
  it("leaves the independently authenticated Developer console outside app login", () => {
    for (const path of ["/system", "/system/login"]) {
      const response = proxy(new NextRequest(`http://localhost${path}`));
      assert.equal(response.headers.get("x-middleware-next"), "1");
      assert.equal(response.headers.get("location"), null);
    }
  });

  it("continues redirecting anonymous application routes to app login", () => {
    const response = proxy(new NextRequest("http://localhost/settings"));
    assert.equal(response.status, 307);
    assert.equal(response.headers.get("location"), "http://localhost/login");
  });
});
