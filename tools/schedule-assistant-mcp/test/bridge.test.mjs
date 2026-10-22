// @ts-check
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { after, before, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { readConfig } from "../bridge.mjs";

const SERVER = fileURLToPath(new URL("../server.mjs", import.meta.url));
const TOKEN = `sfk_${"a".repeat(12)}_${"B".repeat(43)}`;
const PROJECT = "11111111-1111-4111-8111-111111111111";
const ENTRY = "22222222-2222-4222-8222-222222222222";
const DIGEST = "f".repeat(64);

/** @type {Array<{ method: string, path: string, headers: Record<string, string | string[] | undefined>, body: string }>} */
let requests = [];
/** @type {(req: { method: string, path: string, body: string }) => { status?: number, body: unknown, headers?: Record<string, string> }} */
let answer = () => ({ body: { ok: true, data: [] } });
/** @type {import("node:http").Server} */
let http;
let baseUrl = "";

before(async () => {
  http = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      const entry = { method: req.method ?? "GET", path: req.url ?? "", headers: req.headers, body };
      requests.push(entry);
      const reply = answer(entry);
      res.writeHead(reply.status ?? 200, { "content-type": "application/json", ...(reply.headers ?? {}) });
      res.end(JSON.stringify(reply.body));
    });
  });
  await new Promise((resolve) => http.listen(0, "127.0.0.1", () => resolve(undefined)));
  const address = http.address();
  baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});
after(() => new Promise((resolve) => http.close(() => resolve(undefined))));
beforeEach(() => { requests = []; answer = () => ({ body: { ok: true, data: [] } }); });

/** @param {Record<string, string>} [env] */
async function connect(env = {}) {
  let stderr = "";
  const transport = new StdioClientTransport({ command: process.execPath, args: [SERVER], env: { PATH: process.env.PATH ?? "", STUDIOFLOW_URL: baseUrl, STUDIOFLOW_TOKEN: TOKEN, ...env }, stderr: "pipe" });
  transport.stderr?.on("data", (chunk) => { stderr += chunk; });
  const client = new Client({ name: "bridge-test", version: "1.0.0" });
  await client.connect(transport);
  return { client, stderr: () => stderr };
}

/** @param {any} response */
function json(response) {
  return JSON.parse(response.content[0].text);
}

describe("configuration", () => {
  it("refuses a missing token, a malformed token and plain http to a remote host, without echoing the token", () => {
    assert.throws(() => readConfig({ STUDIOFLOW_URL: "https://studio.example" }), /STUDIOFLOW_TOKEN/);
    assert.throws(() => readConfig({ STUDIOFLOW_URL: "https://studio.example", STUDIOFLOW_TOKEN: "sfk_bad" }), (error) => error instanceof Error && !error.message.includes("sfk_bad"));
    assert.throws(() => readConfig({ STUDIOFLOW_URL: "http://studio.example", STUDIOFLOW_TOKEN: TOKEN }), /https/);
    assert.equal(readConfig({ STUDIOFLOW_URL: "http://localhost:3001", STUDIOFLOW_TOKEN: TOKEN }).baseUrl.port, "3001");
    assert.equal(readConfig({ STUDIOFLOW_URL: "https://studio.example", STUDIOFLOW_TOKEN: TOKEN }).token, TOKEN);
  });

  it("exits at start with a stderr message when the URL is remote plain http", async () => {
    const child = spawn(process.execPath, [SERVER], { env: { PATH: process.env.PATH ?? "", STUDIOFLOW_URL: "http://studio.example", STUDIOFLOW_TOKEN: TOKEN } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const code = await new Promise((resolve) => child.on("exit", resolve));
    assert.equal(code, 1);
    assert.equal(stdout, "");
    assert.match(stderr, /https/);
    assert.equal(stderr.includes(TOKEN), false);
  });
});

describe("MCP tools over stdio", () => {
  it("lists exactly the six tools with apply as the only non-read-only tool", async () => {
    const { client } = await connect();
    try {
      const { tools } = await client.listTools();
      assert.deepEqual(tools.map((tool) => tool.name).sort(), ["apply_schedule_changes", "get_schedule_context", "list_projects", "preview_schedule_changes", "search_brands", "search_reusable_options"]);
      for (const tool of tools) assert.equal(tool.annotations?.readOnlyHint, tool.name !== "apply_schedule_changes", tool.name);
    } finally {
      await client.close();
    }
  });

  it("calls the read routes with the bearer token and forwards their data", async () => {
    answer = ({ path }) => ({ body: { ok: true, data: { path } } });
    const { client, stderr } = await connect();
    try {
      assert.deepEqual(json(await client.callTool({ name: "list_projects", arguments: {} })), { path: "/api/integrations/v1/schedule-assistant/projects" });
      assert.deepEqual(json(await client.callTool({ name: "get_schedule_context", arguments: { projectId: PROJECT } })), { path: `/api/integrations/v1/schedule-assistant/projects/${PROJECT}/context` });
      assert.deepEqual(json(await client.callTool({ name: "search_brands", arguments: { query: "Roman tile" } })), { path: "/api/integrations/v1/schedule-assistant/brands?q=Roman%20tile" });
      assert.deepEqual(json(await client.callTool({ name: "search_reusable_options", arguments: { projectId: PROJECT, query: "granit", section: "MATERIAL" } })), { path: `/api/integrations/v1/schedule-assistant/projects/${PROJECT}/reusable-options?q=granit&section=MATERIAL` });
      assert.equal(requests.length, 4);
      for (const request of requests) assert.equal(request.headers.authorization, `Bearer ${TOKEN}`);
      assert.equal(stderr().includes(TOKEN), false);
    } finally {
      await client.close();
    }
  });

  it("returns a fresh operationId only for a valid preview and reports issues otherwise", async () => {
    const operations = [{ op: "create_entry", section: "FIXTURE", category: "Lamp", qty: "4" }];
    answer = () => ({ body: { ok: true, data: { valid: true, digest: DIGEST, baseFingerprint: "x", templatesCreated: 0, operations: [] } } });
    const { client } = await connect();
    try {
      const first = json(await client.callTool({ name: "preview_schedule_changes", arguments: { projectId: PROJECT, operations } }));
      const second = json(await client.callTool({ name: "preview_schedule_changes", arguments: { projectId: PROJECT, operations } }));
      assert.match(first.operationId, /^[0-9a-f-]{36}$/);
      assert.notEqual(first.operationId, second.operationId);
      assert.deepEqual(JSON.parse(requests[0].body), { operations });
      assert.equal(requests[0].headers["idempotency-key"], undefined);
      answer = () => ({ body: { ok: true, data: { valid: false, issues: [{ index: 0, op: "create_entry", code: "SCHEDULE_QTY_INVALID", message: "bad" }] } } });
      const invalid = json(await client.callTool({ name: "preview_schedule_changes", arguments: { projectId: PROJECT, operations } }));
      assert.equal(invalid.valid, false);
      assert.equal(invalid.operationId, undefined);
    } finally {
      await client.close();
    }
  });

  it("applies with the Idempotency-Key and a byte-identical body on retry, then reads back the touched entries", async () => {
    const operations = [{ op: "update_entry", entryId: ENTRY, location: "Lobby" }];
    const operationId = "33333333-3333-4333-8333-333333333333";
    answer = ({ path }) => path.endsWith("/apply")
      ? { body: { ok: true, data: { operationId, applied: true, templatesCreated: 0, operations: [{ index: 0, op: "update_entry", effect: "update", entryId: ENTRY, entryCode: "LA-01" }] } }, headers: requests.filter((r) => r.path.endsWith("/apply")).length > 1 ? { "idempotency-replayed": "true" } : {} }
      : { body: { ok: true, data: { entries: [{ id: ENTRY, code: "LA-01" }, { id: "other", code: "LA-02" }] } } };
    const { client } = await connect();
    try {
      const args = { projectId: PROJECT, operationId, digest: DIGEST, operations };
      const first = json(await client.callTool({ name: "apply_schedule_changes", arguments: args }));
      const second = json(await client.callTool({ name: "apply_schedule_changes", arguments: args }));
      const applies = requests.filter((request) => request.path.endsWith("/apply"));
      assert.equal(applies.length, 2);
      assert.equal(applies[0].headers["idempotency-key"], operationId);
      assert.equal(applies[0].body, applies[1].body);
      assert.equal(requests.filter((request) => request.path.endsWith("/context")).length, 2);
      assert.deepEqual(first.readBack.entries, [{ id: ENTRY, code: "LA-01" }]);
      assert.equal(first.replayed, false);
      assert.equal(second.replayed, true);
    } finally {
      await client.close();
    }
  });

  it("turns a StudioFlow refusal into a tool error with the safe message", async () => {
    answer = () => ({ status: 409, body: { ok: false, error: { kind: "CONFLICT", code: "SCHEDULE_PREVIEW_STALE", message: "Preview again." } } });
    const { client } = await connect();
    try {
      const response = /** @type {any} */ (await client.callTool({ name: "apply_schedule_changes", arguments: { projectId: PROJECT, operationId: "33333333-3333-4333-8333-333333333333", digest: DIGEST, operations: [{ op: "apply_templates" }] } }));
      assert.equal(response.isError, true);
      assert.match(response.content[0].text, /SCHEDULE_PREVIEW_STALE/);
      assert.equal(requests.filter((request) => request.path.endsWith("/context")).length, 0);
    } finally {
      await client.close();
    }
  });

  it("says the apply succeeded when only the read-back fails", async () => {
    answer = ({ path }) => path.endsWith("/apply")
      ? { body: { ok: true, data: { operationId: "x", applied: true, templatesCreated: 0, operations: [] } } }
      : { status: 500, body: { ok: false, error: { kind: "INTERNAL", code: "INTERNAL", message: "boom" } } };
    const { client } = await connect();
    try {
      const response = json(await client.callTool({ name: "apply_schedule_changes", arguments: { projectId: PROJECT, operationId: "33333333-3333-4333-8333-333333333333", digest: DIGEST, operations: [{ op: "apply_templates" }] } }));
      assert.equal(response.applied.applied, true);
      assert.match(response.readBack.error, /saved/);
    } finally {
      await client.close();
    }
  });

  it("rejects an operation shape the wire contract does not allow before calling StudioFlow", async () => {
    const { client } = await connect();
    try {
      const response = /** @type {any} */ (await client.callTool({ name: "preview_schedule_changes", arguments: { projectId: PROJECT, operations: [{ op: "delete_entry", entryId: ENTRY }] } }));
      assert.equal(response.isError, true);
      assert.equal(requests.length, 0);
    } finally {
      await client.close();
    }
  });
});
