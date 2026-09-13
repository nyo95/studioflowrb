import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createConfiguredObjectStorage, createConfiguredPublicObjectStorage } from "./supabase";

describe("Supabase storage bucket separation", () => {
  it("fails safely when server-only provider configuration is absent", async () => {
    const previousUrl = process.env.SUPABASE_URL;
    const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      await assert.rejects(() => createConfiguredObjectStorage().put({ key: "studioflow/mom/a.png", body: Uint8Array.of(1), bytes: 1, contentType: "image/png" }));
      assert.throws(() => createConfiguredPublicObjectStorage().createPublicReadUrl("brand-marks/a.png"));
    } finally {
      if (previousUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previousUrl;
      if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
    }
  });

  it("keeps public Brand marks in the dedicated public bucket", () => {
    const previousUrl = process.env.SUPABASE_URL;
    const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "server-secret";
    try {
      const publicStorage = createConfiguredPublicObjectStorage();
      assert.equal(publicStorage.createPublicReadUrl("brand-marks/a.png"), "https://project.supabase.co/storage/v1/object/public/platform-public-assets/brand-marks/a.png");
    } finally {
      if (previousUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previousUrl;
      if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
    }
  });

  it("keeps private MOM reads signed through platform-assets", async () => {
    const previousUrl = process.env.SUPABASE_URL;
    const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "server-secret";
    const fetchBefore = globalThis.fetch;
    globalThis.fetch = async (input) => {
      assert.match(String(input), /\/storage\/v1\/object\/sign\/platform-assets\/studioflow\/mom\/a\.png/);
      return new Response(JSON.stringify({ signedURL: "/object/sign/platform-assets/studioflow%2Fmom%2Fa.png?token=temporary" }), { status: 200 });
    };
    try {
      assert.match(await createConfiguredObjectStorage().createSignedReadUrl("studioflow/mom/a.png", 600), /token=temporary/);
    } finally {
      globalThis.fetch = fetchBefore;
      if (previousUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previousUrl;
      if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
    }
  });
});
