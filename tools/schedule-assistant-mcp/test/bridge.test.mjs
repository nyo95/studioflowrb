// @ts-check
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { after, before, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import { approvalMessage, readConfig } from "../bridge.mjs";

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

/**
 * @param {Record<string, string>} [env]
 * @param {(request: any) => any} [elicit] when given, the client declares the elicitation capability and answers with it
 */
async function connect(env = {}, elicit) {
  let stderr = "";
  const transport = new StdioClientTransport({ command: process.execPath, args: [SERVER], env: { PATH: process.env.PATH ?? "", STUDIOFLOW_URL: baseUrl, STUDIOFLOW_TOKEN: TOKEN, ...env }, stderr: "pipe" });
  transport.stderr?.on("data", (chunk) => { stderr += chunk; });
  const client = new Client({ name: "bridge-test", version: "1.0.0" }, elicit ? { capabilities: { elicitation: {} } } : undefined);
  /** @type {any[]} */
  const dialogs = [];
  if (elicit) client.setRequestHandler(ElicitRequestSchema, async (request) => { dialogs.push(request.params); return elicit(request.params); });
  await client.connect(transport);
  return { client, stderr: () => stderr, dialogs };
}

const OPERATIONS = [{ op: "update_entry", entryId: ENTRY, location: "Lobby" }];

/** A fake StudioFlow that answers every route the bridge uses; `apply` may override the apply answer. */
function studio(/** @type {{ apply?: (count: number) => { status?: number, body: unknown, headers?: Record<string, string> }, context?: () => { status?: number, body: unknown } }} */ overrides = {}) {
  let applies = 0;
  return (/** @type {{ path: string }} */ { path }) => {
    if (path.endsWith("/schedule-assistant/projects")) return { body: { ok: true, data: [{ id: PROJECT, name: "Sociolla SBW R1", status: "ACTIVE", canApply: true }] } };
    if (path.endsWith("/preview")) return { body: { ok: true, data: { valid: true, digest: DIGEST, baseFingerprint: "x", templatesCreated: 0, operations: [{ index: 0, op: "update_entry", effect: "update", entryCode: "LA-01" }] } } };
    if (path.endsWith("/apply")) {
      applies += 1;
      return overrides.apply?.(applies) ?? { body: { ok: true, data: { operationId: "x", applied: true, templatesCreated: 0, operations: [{ index: 0, op: "update_entry", effect: "update", entryId: ENTRY, entryCode: "LA-01" }] } }, headers: applies > 1 ? { "idempotency-replayed": "true" } : {} };
    }
    if (path.endsWith("/context")) return overrides.context?.() ?? { body: { ok: true, data: { entries: [{ id: ENTRY, code: "LA-01" }, { id: "other", code: "LA-02" }] } } };
    return { body: { ok: true, data: [] } };
  };
}

/** Preview in this session, then return the apply arguments it issued. */
async function previewed(/** @type {Client} */ client) {
  const preview = json(await client.callTool({ name: "preview_schedule_changes", arguments: { projectId: PROJECT, operations: OPERATIONS } }));
  return { projectId: PROJECT, operationId: preview.operationId, digest: preview.digest, operations: OPERATIONS };
}

const applyCount = () => requests.filter((request) => request.path.endsWith("/apply")).length;

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

  it("applies a preview from this session with the Idempotency-Key and a byte-identical body on retry, then reads back the touched entries", async () => {
    answer = studio();
    const { client } = await connect();
    try {
      const args = await previewed(client);
      const first = json(await client.callTool({ name: "apply_schedule_changes", arguments: args }));
      const second = json(await client.callTool({ name: "apply_schedule_changes", arguments: args }));
      const applies = requests.filter((request) => request.path.endsWith("/apply"));
      assert.equal(applies.length, 2);
      assert.equal(applies[0].headers["idempotency-key"], args.operationId);
      assert.equal(applies[0].body, applies[1].body);
      assert.deepEqual(first.readBack.entries, [{ id: ENTRY, code: "LA-01" }]);
      assert.equal(first.replayed, false);
      assert.equal(second.replayed, true);
    } finally {
      await client.close();
    }
  });

  it("refuses an apply this session did not preview, or one whose operations or project differ", async () => {
    answer = studio();
    const { client } = await connect();
    try {
      const invented = /** @type {any} */ (await client.callTool({ name: "apply_schedule_changes", arguments: { projectId: PROJECT, operationId: "33333333-3333-4333-8333-333333333333", digest: DIGEST, operations: OPERATIONS } }));
      assert.equal(invented.isError, true);
      assert.match(invented.content[0].text, /APPLY_NOT_PREVIEWED/);
      const args = await previewed(client);
      const changed = /** @type {any} */ (await client.callTool({ name: "apply_schedule_changes", arguments: { ...args, operations: [{ op: "update_entry", entryId: ENTRY, location: "Kasir" }] } }));
      assert.match(changed.content[0].text, /APPLY_NOT_PREVIEWED/);
      const otherProject = /** @type {any} */ (await client.callTool({ name: "apply_schedule_changes", arguments: { ...args, projectId: "44444444-4444-4444-8444-444444444444" } }));
      assert.match(otherProject.content[0].text, /APPLY_NOT_PREVIEWED/);
      assert.equal(applyCount(), 0);
      // The same operations with fields in another order are the same preview.
      const reordered = json(await client.callTool({ name: "apply_schedule_changes", arguments: { ...args, operations: [{ location: "Lobby", entryId: ENTRY, op: "update_entry" }] } }));
      assert.equal(reordered.applied.applied, true);
    } finally {
      await client.close();
    }
  });

  it("asks the user in the bridge's own dialog when the client supports it, and saves only on yes", async () => {
    answer = studio();
    const yes = await connect({}, () => ({ action: "accept", content: { setuju: true } }));
    try {
      const applied = json(await yes.client.callTool({ name: "apply_schedule_changes", arguments: await previewed(yes.client) }));
      assert.equal(applied.applied.applied, true);
      assert.equal(yes.dialogs.length, 1);
      assert.match(yes.dialogs[0].message, /Sociolla SBW R1/);
      assert.match(yes.dialogs[0].message, /LA-01/);
      assert.deepEqual(yes.dialogs[0].requestedSchema.required, ["setuju"]);
      assert.equal(applyCount(), 1);
    } finally {
      await yes.client.close();
    }
    for (const reply of [{ action: "decline" }, { action: "cancel" }, { action: "accept", content: { setuju: false } }]) {
      requests = [];
      const no = await connect({}, () => reply);
      try {
        const refused = json(await no.client.callTool({ name: "apply_schedule_changes", arguments: await previewed(no.client) }));
        assert.equal(refused.applied, false);
        assert.match(refused.reason, /Tidak ada yang disimpan/);
        assert.equal(applyCount(), 0, JSON.stringify(reply));
      } finally {
        await no.client.close();
      }
    }
  });

  it("falls back to the client's own tool approval when the client has no dialog support", async () => {
    answer = studio();
    const { client, dialogs } = await connect();
    try {
      const applied = json(await client.callTool({ name: "apply_schedule_changes", arguments: await previewed(client) }));
      assert.equal(applied.applied.applied, true);
      assert.equal(dialogs.length, 0);
    } finally {
      await client.close();
    }
  });

  it("applies final decisions only through the bridge's own dialog, naming every finalized option, never through a client's tool approval", async () => {
    const OPTION = "55555555-5555-4555-8555-555555555555";
    const OPTION_2 = "66666666-6666-4666-8666-666666666666";
    const finals = [{ op: "finalize_option", optionId: OPTION }, { op: "finalize_option", optionId: OPTION_2 }];
    answer = ({ path }) => {
      if (path.endsWith("/schedule-assistant/projects")) return { body: { ok: true, data: [{ id: PROJECT, name: "Sociolla SBZ", status: "ACTIVE", canApply: true }] } };
      if (path.endsWith("/preview")) return { body: { ok: true, data: { valid: true, digest: DIGEST, baseFingerprint: "x", templatesCreated: 0, operations: [{ index: 0, op: "finalize_option", effect: "update", entryCode: "TI-01", optionLabel: "B" }, { index: 1, op: "finalize_option", effect: "update", entryCode: "TI-02", optionLabel: "A" }] } } };
      if (path.endsWith("/apply")) return { body: { ok: true, data: { operationId: "x", applied: true, templatesCreated: 0, operations: [] } } };
      return { body: { ok: true, data: { entries: [] } } };
    };
    const args = async (/** @type {Client} */ client) => {
      const issued = json(await client.callTool({ name: "preview_schedule_changes", arguments: { projectId: PROJECT, operations: finals } }));
      return { projectId: PROJECT, operationId: issued.operationId, digest: issued.digest, operations: finals };
    };
    const plain = await connect();
    try {
      const refused = /** @type {any} */ (await plain.client.callTool({ name: "apply_schedule_changes", arguments: await args(plain.client) }));
      assert.equal(refused.isError, true);
      assert.match(refused.content[0].text, /FINAL_NEEDS_CONFIRMATION_DIALOG/);
      assert.equal(applyCount(), 0);
    } finally {
      await plain.client.close();
    }
    const asked = await connect({}, () => ({ action: "accept", content: { setuju: true } }));
    try {
      assert.equal(json(await asked.client.callTool({ name: "apply_schedule_changes", arguments: await args(asked.client) })).applied.applied, true);
      assert.match(asked.dialogs[0].message, /KEPUTUSAN FINAL \(2\)/);
      assert.match(asked.dialogs[0].message, /TI-01 B, TI-02 A/);
      assert.match(asked.dialogs[0].message, /2 keputusan final/);
      assert.equal(applyCount(), 1);
    } finally {
      await asked.client.close();
    }
    requests = [];
    const declined = await connect({}, () => ({ action: "decline" }));
    try {
      assert.equal(json(await declined.client.callTool({ name: "apply_schedule_changes", arguments: await args(declined.client) })).applied, false);
      assert.equal(applyCount(), 0);
    } finally {
      await declined.client.close();
    }
  });

  it("states the final-decision rules in the server instructions and rejects a loose finalize shape", async () => {
    const { client } = await connect();
    try {
      assert.match(client.getInstructions() ?? "", /finalize_option/);
      for (const operations of [[{ op: "finalize_option" }], [{ op: "finalize_option", optionId: "not-a-uuid" }], [{ op: "finalize_option", optionId: ENTRY, all: true }]]) {
        const response = /** @type {any} */ (await client.callTool({ name: "preview_schedule_changes", arguments: { projectId: PROJECT, operations } }));
        assert.equal(response.isError, true);
      }
      assert.equal(requests.filter((request) => request.path.endsWith("/preview")).length, 0);
    } finally {
      await client.close();
    }
  });

  it("turns a StudioFlow refusal into a tool error and forgets a stale preview", async () => {
    answer = studio({ apply: () => ({ status: 409, body: { ok: false, error: { kind: "CONFLICT", code: "SCHEDULE_PREVIEW_STALE", message: "Preview again." } } }) });
    const { client } = await connect();
    try {
      const args = await previewed(client);
      const response = /** @type {any} */ (await client.callTool({ name: "apply_schedule_changes", arguments: args }));
      assert.equal(response.isError, true);
      assert.match(response.content[0].text, /SCHEDULE_PREVIEW_STALE/);
      assert.equal(requests.filter((request) => request.path.endsWith("/context")).length, 0);
      const again = /** @type {any} */ (await client.callTool({ name: "apply_schedule_changes", arguments: args }));
      assert.match(again.content[0].text, /APPLY_NOT_PREVIEWED/);
      assert.equal(applyCount(), 1);
    } finally {
      await client.close();
    }
  });

  it("says the apply succeeded when only the read-back fails", async () => {
    answer = studio({ context: () => ({ status: 500, body: { ok: false, error: { kind: "INTERNAL", code: "INTERNAL", message: "boom" } } }) });
    const { client } = await connect();
    try {
      const response = json(await client.callTool({ name: "apply_schedule_changes", arguments: await previewed(client) }));
      assert.equal(response.applied.applied, true);
      assert.match(response.readBack.error, /saved/);
    } finally {
      await client.close();
    }
  });

  it("offers the guided interview as the susun_jadwal prompt and in the server instructions", async () => {
    const { client } = await connect();
    try {
      const { prompts } = await client.listPrompts();
      assert.ok(prompts.some((prompt) => prompt.name === "susun_jadwal"));
      const prompt = await client.getPrompt({ name: "susun_jadwal", arguments: { proyek: "Sociolla", permintaan: "tambah downlight 12 pcs" } });
      const text = /** @type {any} */ (prompt.messages[0].content).text;
      assert.match(text, /Sociolla/);
      assert.match(text, /tambah downlight 12 pcs/);
      assert.match(text, /list_projects/);
      assert.match(client.getInstructions() ?? "", /Confirm the project/);
    } finally {
      await client.close();
    }
  });

  it("summarises a preview in plain words for the confirmation dialog", () => {
    const message = approvalMessage("Gondola", [
      { op: "create_entry", effect: "create", entryCode: "DO-01", optionLabel: "A" },
      { op: "create_option", effect: "create", entryCode: "DO-01", optionLabel: "B" },
      { op: "update_entry", effect: "no_change", entryCode: "LA-01" },
    ], 3);
    assert.equal(message, 'Terapkan ke Product Schedule "Gondola": 1 item baru, 1 opsi baru, 3 item dari template studio. Kode: DO-01 A, DO-01 B. Opsi baru tidak otomatis final.');
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
