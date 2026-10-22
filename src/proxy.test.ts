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

  it("lets bearer-token integration routes through to the integration kit, which authenticates them itself", () => {
    for (const path of ["/api/integrations/v1/ping", "/api/integrations/v1/schedule-assistant/projects", "/api/integrations/v1/sketchup/projects"]) {
      const response = proxy(new NextRequest(`http://localhost${path}`, { headers: { authorization: "Bearer sfk_x" } }));
      assert.equal(response.headers.get("x-middleware-next"), "1");
      assert.equal(response.headers.get("location"), null);
    }
    // Only that prefix: a look-alike path stays behind app login.
    assert.equal(proxy(new NextRequest("http://localhost/api/integrations-admin")).status, 307);
  });

  it("continues redirecting anonymous application routes to app login", () => {
    const response = proxy(new NextRequest("http://localhost/settings"));
    assert.equal(response.status, 307);
    assert.equal(response.headers.get("location"), "http://localhost/login");
  });
});
