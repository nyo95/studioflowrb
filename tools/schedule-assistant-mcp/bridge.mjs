// @ts-check
import { randomUUID } from "node:crypto";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

/**
 * StudioFlow Schedule Assistant MCP bridge (WO-SCHEDULE-ASSISTANT-01). One provider-neutral server for Claude Code,
 * Codex, OpenCode and Gemini CLI. It only forwards to the StudioFlow integration routes with the user's personal token;
 * StudioFlow decides every code, label and Brand snapshot. Schemas mirror src/apps/schedule-assistant/contract.ts.
 */

export const API_PATH = "/api/integrations/v1/schedule-assistant/";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const TOKEN = /^sfk_[a-f0-9]{12}_[A-Za-z0-9_-]{43}$/;

/**
 * Reads the bridge configuration from the environment. The token is never echoed back in an error.
 * @param {Record<string, string | undefined>} env
 */
export function readConfig(env) {
  const urlText = env.STUDIOFLOW_URL?.trim();
  const token = env.STUDIOFLOW_TOKEN?.trim();
  if (!urlText) throw new Error("STUDIOFLOW_URL is required (for example https://studioflow.example.com).");
  if (!token || !TOKEN.test(token)) throw new Error("STUDIOFLOW_TOKEN must be a StudioFlow personal integration token (sfk_...).");
  let baseUrl;
  try {
    baseUrl = new URL(urlText);
  } catch {
    throw new Error("STUDIOFLOW_URL is not a valid URL.");
  }
  const local = LOCAL_HOSTS.has(baseUrl.hostname);
  if (baseUrl.protocol !== "https:" && !(baseUrl.protocol === "http:" && local)) {
    throw new Error("STUDIOFLOW_URL must use https (plain http is allowed only for localhost, 127.0.0.1 or ::1).");
  }
  return { baseUrl, token };
}

const text = (/** @type {number} */ max) => z.string().max(max);
const optionalText = (/** @type {number} */ max) => text(max).nullable().optional();
const id = z.string().uuid();
const option = z.object({
  brandId: id.nullable().optional().describe("An active Master Data Brand id from search_brands. Omit or null for no Brand."),
  brandName: optionalText(160).describe("Only when the brief names a Brand you could not find: StudioFlow answers with suggestions. Never stored."),
  productName: text(200).describe("The product designation (\"Type\")."),
  color: optionalText(160),
  pattern: optionalText(160),
  finishing: optionalText(160),
  dimension: optionalText(160),
  notes: optionalText(2000),
  extra: z.array(z.object({ label: text(80), value: text(500) }).strict()).max(30).optional(),
}).strict();
const operation = z.union([
  z.object({ op: z.literal("apply_templates") }).strict().describe("Add every active studio template item not yet in the project. Only as the first operation."),
  z.object({ op: z.literal("create_entry"), ref: text(80).optional().describe("A name later operations can use as entryRef."), section: z.enum(["MATERIAL", "FIXTURE"]), category: text(80), qty: optionalText(20).describe("Fixture only."), unit: optionalText(40).describe("Fixture only."), location: optionalText(160), option: option.optional().describe("The first option (A). Never final.") }).strict(),
  z.object({ op: z.literal("update_entry"), entryId: id, qty: optionalText(20), unit: optionalText(40), location: optionalText(160) }).strict(),
  z.object({ op: z.literal("create_option"), entryId: id.optional(), entryRef: text(80).optional(), option }).strict().describe("Send exactly one of entryId or entryRef."),
  z.object({ op: z.literal("reuse_option"), entryId: id.optional(), entryRef: text(80).optional(), sourceOptionId: id.describe("From search_reusable_options.") }).strict().describe("Send exactly one of entryId or entryRef."),
  z.object({ op: z.literal("update_option"), optionId: id, patch: option.partial().strict().describe("Only sent fields change; null clears a field.") }).strict(),
]);
const operations = z.array(operation).min(1).max(100);
const projectId = id.describe("A project id from list_projects.");

const INSTRUCTIONS = [
  "This server composes one StudioFlow project's Product Schedule.",
  "Required flow: list_projects -> get_schedule_context -> (search_brands / search_reusable_options as needed) -> preview_schedule_changes -> show the user the preview in plain words -> wait for the user's explicit yes -> apply_schedule_changes with the exact operationId, digest and operations from that preview -> show the read-back.",
  "Never call apply_schedule_changes without the user's explicit approval of that preview. If apply answers SCHEDULE_PREVIEW_STALE, preview again and ask again.",
  "StudioFlow decides codes, prefixes, category spelling, option labels and Brand snapshots; new options are never final. Deleting, final decisions, samples and images are not available.",
].join(" ");

/**
 * @typedef {{ ok: boolean, status: number, body: any, replayed: boolean }} ApiResult
 * @typedef {{ baseUrl: URL, token: string, fetch?: typeof fetch, log?: (line: string) => void }} BridgeOptions
 */

/** @param {BridgeOptions} options */
export function createBridge(options) {
  const doFetch = options.fetch ?? fetch;
  const log = options.log ?? ((line) => process.stderr.write(`${line}\n`));

  /**
   * @param {string} path
   * @param {{ method?: string, body?: string, idempotencyKey?: string }} [init]
   * @returns {Promise<ApiResult>}
   */
  async function call(path, init = {}) {
    const url = new URL(API_PATH + path, options.baseUrl);
    /** @type {Record<string, string>} */
    const headers = { authorization: `Bearer ${options.token}`, accept: "application/json" };
    if (init.body !== undefined) headers["content-type"] = "application/json";
    if (init.idempotencyKey) headers["idempotency-key"] = init.idempotencyKey;
    let response;
    try {
      response = await doFetch(url, { method: init.method ?? "GET", headers, body: init.body, redirect: "error" });
    } catch (error) {
      log(`schedule-assistant: request to ${url.pathname} failed: ${error instanceof Error ? error.message : "network error"}`);
      throw new Error(`StudioFlow could not be reached at ${options.baseUrl.origin}.`);
    }
    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    return { ok: response.ok && body?.ok === true, status: response.status, body, replayed: response.headers.get("idempotency-replayed") === "true" };
  }

  /** @param {unknown} value */
  const result = (value) => ({ content: [{ type: /** @type {const} */ ("text"), text: JSON.stringify(value, null, 2) }] });
  /** @param {ApiResult} response */
  const failure = (response) => {
    const error = response.body?.error;
    const message = error ? `${error.code}: ${error.message}` : `StudioFlow answered HTTP ${response.status}.`;
    return { isError: true, content: [{ type: /** @type {const} */ ("text"), text: message }] };
  };
  /** @param {ApiResult} response */
  const forward = (response) => (response.ok ? result(response.body.data) : failure(response));

  const server = new McpServer({ name: "studioflow-schedule-assistant", version: "1.0.0" }, { instructions: INSTRUCTIONS });
  const read = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };

  server.registerTool("list_projects", {
    description: "List the StudioFlow projects you may read, with canApply when you may also change their schedule.",
    annotations: read,
  }, async () => forward(await call("projects")));

  server.registerTool("get_schedule_context", {
    description: "Read one project's Product Schedule: entries and options, category choices with prefixes, studio template items not yet applied, and whether you may apply changes.",
    inputSchema: { projectId },
    annotations: read,
  }, async (args) => forward(await call(`projects/${encodeURIComponent(args.projectId)}/context`)));

  server.registerTool("search_brands", {
    description: "Search active Master Data Brands by name. Use the returned id as option.brandId.",
    inputSchema: { query: text(80).min(2) },
    annotations: read,
  }, async (args) => forward(await call(`brands?q=${encodeURIComponent(args.query)}`)));

  server.registerTool("search_reusable_options", {
    description: "Search options already specified in other projects, to reuse with a reuse_option operation.",
    inputSchema: { projectId, query: text(80).min(2), section: z.enum(["MATERIAL", "FIXTURE"]).optional() },
    annotations: read,
  }, async (args) => forward(await call(`projects/${encodeURIComponent(args.projectId)}/reusable-options?q=${encodeURIComponent(args.query)}${args.section ? `&section=${args.section}` : ""}`)));

  server.registerTool("preview_schedule_changes", {
    description: "Validate a complete batch and show exactly what StudioFlow would create or change (codes, option labels, categories, Brands). Writes nothing. Returns every problem at once, or an operationId and digest to apply this exact preview after the user approves it.",
    inputSchema: { projectId, operations },
    annotations: read,
  }, async (args) => {
    const response = await call(`projects/${encodeURIComponent(args.projectId)}/preview`, { method: "POST", body: JSON.stringify({ operations: args.operations }) });
    if (!response.ok) return failure(response);
    const preview = response.body.data;
    if (!preview.valid) return result({ ...preview, next: "Fix the issues (ask the user where a choice is needed) and preview again." });
    return result({ ...preview, operationId: randomUUID(), next: "Show this preview to the user and ask for an explicit yes before apply_schedule_changes." });
  });

  server.registerTool("apply_schedule_changes", {
    description: "Apply a preview the user explicitly approved: send its operationId, digest and the same operations. Changes StudioFlow data in one all-or-nothing step, safe to retry with the same arguments, then reads the saved schedule back.",
    inputSchema: { projectId, operationId: id, digest: z.string().regex(/^[a-f0-9]{64}$/), operations },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (args) => {
    const path = `projects/${encodeURIComponent(args.projectId)}`;
    const body = JSON.stringify({ operationId: args.operationId, digest: args.digest, operations: args.operations });
    const applied = await call(`${path}/apply`, { method: "POST", body, idempotencyKey: args.operationId });
    if (!applied.ok) return failure(applied);
    const summary = applied.body.data;
    const touched = new Set((summary.operations ?? []).map((/** @type {{ entryId?: string }} */ item) => item.entryId).filter(Boolean));
    let readBack;
    try {
      const context = await call(`${path}/context`);
      readBack = context.ok
        ? { entries: context.body.data.entries.filter((/** @type {{ id: string }} */ entry) => touched.has(entry.id) || summary.templatesCreated > 0) }
        : { error: "The changes were saved, but reading them back failed. Use get_schedule_context to see them." };
    } catch {
      readBack = { error: "The changes were saved, but reading them back failed. Use get_schedule_context to see them." };
    }
    return result({ applied: summary, replayed: applied.replayed, readBack });
  });

  return server;
}
