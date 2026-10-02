import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fetchPublicHtml, isPublicIp, isSafeWebUrl, type SafeFetchDeps } from "./safe-fetch";

const html = (body: string, init: ResponseInit = {}) =>
  new Response(body, { status: 200, headers: { "content-type": "text/html" }, ...init });

function deps(handler: (url: string) => Response, dns: Record<string, string[]> = {}): SafeFetchDeps & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    fetch: (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return handler(String(input));
    }) as typeof fetch,
    resolve: async (host) => dns[host] ?? ["93.184.216.34"],
  };
}

const OPTIONS = { timeoutMs: 1000, maxBytes: 1000 };

describe("StudioFlow Library safe web fetching", () => {
  it("rejects loopback, private, link-local, and internal addresses", () => {
    for (const url of [
      "http://localhost/", "http://[::1]/", "http://127.0.0.2/", "http://0.0.0.0/", "http://[fd00::1]/",
      "http://[fe80::1]/", "http://[::ffff:127.0.0.1]/", "http://100.64.0.1/", "http://169.254.169.254/",
      "http://10.0.0.5/", "http://192.168.1.1/", "http://172.20.0.1/", "http://metadata.google.internal/",
      "http://intranet/", "http://user:pass@example.com/", "ftp://example.com/",
    ]) assert.equal(isSafeWebUrl(url), false, url);
    for (const url of ["https://example.com/", "http://93.184.216.34/", "https://[2606:2800:220:1::1]/"]) assert.equal(isSafeWebUrl(url), true, url);
  });

  it("classifies IP ranges", () => {
    assert.equal(isPublicIp("8.8.8.8"), true);
    assert.equal(isPublicIp("198.18.0.1"), false);
    assert.equal(isPublicIp("not-an-ip"), false);
  });

  it("refuses a public name that resolves to a private address", async () => {
    const d = deps(() => html("<h1>x</h1>"), { "evil.example.com": ["10.0.0.1"] });
    assert.equal(await fetchPublicHtml("https://evil.example.com/", OPTIONS, d), null);
    assert.deepEqual(d.calls, []);
  });

  it("checks every redirect hop before requesting it", async () => {
    const d = deps((url) => url.includes("start")
      ? new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest" } })
      : html("secret"));
    assert.equal(await fetchPublicHtml("https://brand.example.com/start", OPTIONS, d), null);
    assert.deepEqual(d.calls, ["https://brand.example.com/start"]);
  });

  it("follows a safe redirect and caps the body", async () => {
    const d = deps((url) => url.endsWith("/a") ? new Response(null, { status: 301, headers: { location: "/b" } }) : html("x".repeat(5000)));
    const page = await fetchPublicHtml("https://brand.example.com/a", OPTIONS, d);
    assert.equal(page?.finalUrl, "https://brand.example.com/b");
    assert.equal(page?.html.length, 1000);
  });

  it("stops after too many redirects and ignores non-HTML", async () => {
    const loop = deps(() => new Response(null, { status: 302, headers: { location: "/again" } }));
    assert.equal(await fetchPublicHtml("https://brand.example.com/", OPTIONS, loop), null);
    const json = deps(() => new Response("{}", { headers: { "content-type": "application/json" } }));
    assert.equal(await fetchPublicHtml("https://brand.example.com/", OPTIONS, json), null);
  });
});
