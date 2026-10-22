// @ts-check
import { createHash, randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";

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
  z.object({ op: z.literal("finalize_option"), optionId: id.describe("One existing option id from get_schedule_context.") }).strict().describe("Record the client's final decision: this option becomes final and the item's other options become not used. One operation per named option; never guess, never a whole list from a vague request."),
  z.object({ op: z.literal("set_option_image"), optionId: id.optional(), entryRef: text(80).optional(), imagePath: text(1000).min(1).describe("Absolute path of a picture the user gave you (pasted or dropped into this conversation). PNG, JPEG or WebP, at most 3 MB. Never a URL and never a picture you chose yourself.") }).strict().describe("Attach a photo to an existing option (optionId) or to the first option of a create_entry in this batch (entryRef). Replaces an existing photo."),
  z.object({ op: z.literal("set_option_color"), optionId: id.optional(), entryRef: text(80).optional(), hex: z.string().regex(/^#[0-9a-fA-F]{6}$/).describe("#RRGGBB the user confirmed.") }).strict().describe("A colour placeholder instead of a photo, only after the user agreed to a placeholder and confirmed the colour. StudioFlow draws it."),
]);
const operations = z.array(operation).min(1).max(100);

/** WO-SCHEDULE-ASSISTANT-04: photos the bridge accepts, the same rules StudioFlow applies on the Schedule screen. */
export const MAX_IMAGES = 4;
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

/**
 * Reads one photo from a local path the user gave, checks it by content (not by name) and returns what the operation
 * carries (hash, type, size) plus the bytes the bridge keeps for apply.
 * @param {string} path
 */
export async function readImage(path) {
  let info;
  try {
    info = await stat(path);
  } catch {
    throw new Error(`IMAGE_NOT_FOUND: no file at ${path}. Ask the user for the picture again.`);
  }
  if (!info.isFile()) throw new Error(`IMAGE_NOT_A_FILE: ${path} is not a file.`);
  if (info.size === 0 || info.size > MAX_IMAGE_BYTES) throw new Error(`IMAGE_TOO_LARGE: ${path} is ${(info.size / 1024 / 1024).toFixed(1)} MB; photos must be at most 3 MB. Ask the user to shrink or crop it first.`);
  const bytes = await readFile(path);
  const contentType = sniff(bytes);
  if (!contentType) throw new Error(`IMAGE_TYPE: ${path} is not a PNG, JPEG or WebP picture.`);
  return { image: { sha256: createHash("sha256").update(bytes).digest("hex"), contentType, bytes: bytes.length }, base64: bytes.toString("base64") };
}

/** @param {Buffer} bytes */
function sniff(bytes) {
  if (bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length > 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

/**
 * Replaces every `imagePath` by the photo's descriptor. Returns the operations StudioFlow receives and the photo bytes
 * by hash; refuses more than four photos before anything is sent.
 * @param {Array<Record<string, any>>} list
 */
export async function withImages(list) {
  if (list.filter((item) => item.op === "set_option_image").length > MAX_IMAGES) throw new Error(`IMAGE_LIMIT: at most ${MAX_IMAGES} photos per batch; send the rest in another batch.`);
  /** @type {Record<string, string>} */
  const images = {};
  const sent = [];
  for (const item of list) {
    if (item.op !== "set_option_image") { sent.push(item); continue; }
    const { imagePath, ...rest } = item;
    const read = await readImage(imagePath);
    images[read.image.sha256] = read.base64;
    sent.push({ ...rest, image: read.image });
  }
  return { operations: sent, images };
}
const projectId = id.describe("A project id from list_projects.");

/**
 * The interview every client must follow before it proposes anything (WO-SCHEDULE-ASSISTANT-02, layer 1). It is the
 * server instructions, the `susun_jadwal` prompt and part of the preview/apply descriptions, so a client that reads
 * only one of them still sees it.
 */
export const INTERVIEW_STEPS = [
  "1. Confirm the project: call list_projects; if the user's words match more than one project, or none, ask which one. Never guess.",
  "2. Ask what the user wants: apply the studio templates or not, which categories and items, any Brand or product the client already chose.",
  "3. Ask for missing facts before previewing: quantity and unit for Fixture items (Material items have none); a Brand that search_brands cannot find (offer its suggestions or leaving it empty); which existing item an extra option belongs to.",
  "4. Summarise the plan in plain words and ask whether to prepare the preview.",
  "5. Call preview_schedule_changes, show the result (codes, labels, Brands, every issue and warning), and wait for an explicit yes. A SCHEDULE_CATEGORY_SIMILAR warning means a new category looks like a studio one (for example HPL vs High Pressure Laminate, prefix PL): ask which is meant and preview again with the studio name unless the user really wants the new category.",
  "6. Only then call apply_schedule_changes with that preview's operationId, digest and operations, and show the read-back.",
  "Photos: attach a picture only when the user gave it in this conversation (set_option_image with its file path). For every SCHEDULE_OPTION_NO_IMAGE warning, ask the user for a photo; if there is none, ask whether a colour placeholder should be used and which colour (propose a #RRGGBB and wait for confirmation, never choose it yourself), then preview again. Say when a photo replaces an existing one.",
  "Final decisions (finalize_option) are the client's choice and lock the other options of an item. Use them only when the user names exactly which options are final; list every item code and option you will finalize, say which options become not used, and ask about the final decisions on their own, even if the request already mentioned them. Never infer a final decision. They are applied only after StudioFlow's own confirmation dialog.",
];

const INSTRUCTIONS = [
  "This server composes one StudioFlow project's Product Schedule. Behave like an assistant: ask before you act, one short question at a time, in the user's language.",
  `Required interview: ${INTERVIEW_STEPS.join(" ")}`,
  "Never call apply_schedule_changes without the user's explicit approval of that preview; it refuses a preview this session did not make. If apply answers SCHEDULE_PREVIEW_STALE, preview again and ask again. If the user declines the confirmation dialog, nothing was saved; ask what to change.",
  "StudioFlow decides codes, prefixes, category spelling, option labels and Brand snapshots; new options are never final. Deleting, un-finalizing, removing photos and samples are not available.",
].join(" ");

/** JSON with sorted object keys, so the same operations compare equal however the client ordered their fields. */
function canonical(/** @type {unknown} */ value) {
  return JSON.stringify(value, (_key, item) => (item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : item));
}

/**
 * The plain-language question shown in the bridge's own confirmation dialog.
 * @param {string} projectName
 * @param {Array<{ op: string, effect: string, entryCode?: string, optionLabel?: string, replacesImage?: boolean, color?: string }>} results
 * @param {number} templatesCreated
 * @param {Array<{ code: string, entryCode?: string, optionLabel?: string }>} [warnings]
 */
export function approvalMessage(projectName, results, templatesCreated, warnings = []) {
  const count = (/** @type {string} */ op, /** @type {string} */ effect) => results.filter((item) => item.op === op && item.effect === effect).length;
  const parts = [
    [count("create_entry", "create"), "item baru"],
    [count("create_option", "create") + count("reuse_option", "create"), "opsi baru"],
    [count("update_entry", "update") + count("update_option", "update"), "perubahan"],
    [templatesCreated, "item dari template studio"],
    [count("finalize_option", "update"), "keputusan final"],
    [results.filter((item) => item.op === "set_option_image").length, "foto"],
    [results.filter((item) => item.op === "set_option_color").length, "warna placeholder"],
  ].filter(([n]) => Number(n) > 0).map(([n, label]) => `${n} ${label}`);
  const label = (/** @type {{ entryCode?: string, optionLabel?: string }} */ item) => (item.optionLabel ? `${item.entryCode} ${item.optionLabel}` : item.entryCode);
  const finals = results.filter((item) => item.op === "finalize_option" && item.effect !== "no_change" && item.entryCode);
  const pictures = new Set(["finalize_option", "set_option_image", "set_option_color"]);
  const codes = [...new Set(results.filter((item) => !pictures.has(item.op) && item.effect !== "no_change" && item.entryCode).map(label))];
  const shown = codes.slice(0, 10).join(", ") + (codes.length > 10 ? `, +${codes.length - 10} lagi` : "");
  // Every finalized option is named in full: a final decision locks the item's other options, so the user must see each one.
  const finalText = finals.length > 0 ? ` KEPUTUSAN FINAL (${finals.length}), pilihan lain pada item itu jadi tidak dipakai: ${finals.map(label).join(", ")}.` : "";
  const photos = results.filter((item) => item.op === "set_option_image");
  const colors = results.filter((item) => item.op === "set_option_color");
  const replaced = [...photos, ...colors].filter((item) => item.replacesImage);
  const bare = warnings.filter((item) => item.code === "SCHEDULE_OPTION_NO_IMAGE");
  const pictureText = [
    photos.length > 0 ? ` Foto: ${photos.map(label).join(", ")}.` : "",
    colors.length > 0 ? ` Warna placeholder: ${colors.map((item) => `${label(item)} ${item.color}`).join(", ")}.` : "",
    replaced.length > 0 ? ` FOTO LAMA DIGANTI: ${replaced.map(label).join(", ")}.` : "",
    bare.length > 0 ? ` Tanpa foto: ${bare.map(label).join(", ")}.` : "",
  ].join("");
  return `Terapkan ke Product Schedule "${projectName}": ${parts.join(", ") || "tidak ada perubahan"}.${shown ? ` Kode: ${shown}.` : ""}${finalText}${pictureText} Opsi baru tidak otomatis final.`;
}

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
    // The integration kit sends the human text as `safeMessage`.
    const message = error ? `${error.code}: ${error.safeMessage ?? error.message ?? ""}` : `StudioFlow answered HTTP ${response.status}.`;
    return { isError: true, content: [{ type: /** @type {const} */ ("text"), text: message }] };
  };
  /** @param {ApiResult} response */
  const forward = (response) => (response.ok ? result(response.body.data) : failure(response));

  const server = new McpServer({ name: "studioflow-schedule-assistant", version: "1.3.0" }, { instructions: INSTRUCTIONS });

  /**
   * Layer 2: every valid preview this bridge process returned, by its operationId. Apply accepts only these, for the
   * same project, digest and operations, so an AI cannot invent or reuse a preview the user never saw here.
   * @type {Map<string, { projectId: string, projectName: string, digest: string, operations: string, sent: unknown[], images: Record<string, string>, message: string }>}
   */
  const previews = new Map();
  /** @type {Map<string, string>} */
  const projectNames = new Map();
  async function projectName(/** @type {string} */ id) {
    if (!projectNames.has(id)) {
      const listed = await call("projects");
      // A name only makes the dialog friendlier; an odd answer must never block the preview.
      if (listed.ok && Array.isArray(listed.body.data)) for (const project of listed.body.data) if (project?.id) projectNames.set(project.id, String(project.name ?? ""));
    }
    return projectNames.get(id) || "proyek ini";
  }

  server.registerPrompt("susun_jadwal", {
    title: "Susun Product Schedule",
    description: "Start the guided interview that composes one project's Product Schedule with StudioFlow.",
    argsSchema: { proyek: z.string().max(200).optional().describe("Nama atau kode proyek, kalau sudah tahu."), permintaan: z.string().max(4000).optional().describe("Apa yang ingin disusun atau diubah.") },
  }, (args) => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: [
          "Bantu saya menyusun Product Schedule di StudioFlow dengan alat studioflow-schedule. Bertindaklah seperti asisten: tanya dulu, satu pertanyaan singkat setiap kali, sebelum menyiapkan preview.",
          args.proyek ? `Proyek yang saya maksud: ${args.proyek}. Pastikan dulu proyeknya benar lewat list_projects.` : "Tanyakan dulu proyek yang mana (pakai list_projects).",
          args.permintaan ? `Permintaan saya: ${args.permintaan}` : "Tanyakan apa yang ingin saya susun atau ubah.",
          "Ikuti langkah ini:",
          ...INTERVIEW_STEPS,
        ].join("\n"),
      },
    }],
  }));
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
    description: "Validate a complete batch and show exactly what StudioFlow would create or change (codes, option labels, categories, Brands, photos). Writes nothing. Photos are read from their file paths now and locked to this preview. Call it only after the interview (project confirmed, plan summarised and agreed). Returns every problem at once, or an operationId and digest to apply this exact preview after the user approves it.",
    inputSchema: { projectId, operations },
    annotations: read,
  }, async (args) => {
    let prepared;
    try {
      prepared = await withImages(args.operations);
    } catch (error) {
      return { isError: true, content: [{ type: /** @type {const} */ ("text"), text: error instanceof Error ? error.message : "The photo could not be read." }] };
    }
    const response = await call(`projects/${encodeURIComponent(args.projectId)}/preview`, { method: "POST", body: JSON.stringify({ operations: prepared.operations }) });
    if (!response.ok) return failure(response);
    const preview = response.body.data;
    if (!preview.valid) return result({ ...preview, next: "Fix the issues (ask the user where a choice is needed) and preview again." });
    const operationId = randomUUID();
    const name = await projectName(args.projectId);
    // The photo bytes read now are the ones applied: a file changed after the preview cannot slip in.
    previews.set(operationId, { projectId: args.projectId, projectName: name, digest: preview.digest, operations: canonical(args.operations), sent: prepared.operations, images: prepared.images, message: approvalMessage(name, preview.operations ?? [], preview.templatesCreated ?? 0, preview.warnings ?? []) });
    return result({ ...preview, project: name, operationId, next: "Show this preview to the user and ask for an explicit yes before apply_schedule_changes." });
  });

  server.registerTool("apply_schedule_changes", {
    description: "Apply a preview the user explicitly approved in this conversation: send its operationId, digest and the same operations. Refused for a preview this session did not make. Where the client supports it, StudioFlow asks the user to confirm in its own dialog first. Changes StudioFlow data in one all-or-nothing step, safe to retry with the same arguments, then reads the saved schedule back.",
    inputSchema: { projectId, operationId: id, digest: z.string().regex(/^[a-f0-9]{64}$/), operations },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (args) => {
    const issued = previews.get(args.operationId);
    if (!issued || issued.projectId !== args.projectId || issued.digest !== args.digest || issued.operations !== canonical(args.operations)) {
      return { isError: true, content: [{ type: /** @type {const} */ ("text"), text: "APPLY_NOT_PREVIEWED: this operationId was not issued by a preview in this session for exactly these operations. Prepare the preview with preview_schedule_changes, show it to the user and ask for an explicit yes first." }] };
    }
    // Layer 3: the bridge itself asks the user when the client can show a dialog; otherwise the client's tool approval applies.
    // A final decision locks other options, so it is never left to a client's tool approval (which can be auto-approved).
    const finalizing = args.operations.some((item) => item.op === "finalize_option");
    if (finalizing && !server.server.getClientCapabilities()?.elicitation) {
      return { isError: true, content: [{ type: /** @type {const} */ ("text"), text: "FINAL_NEEDS_CONFIRMATION_DIALOG: this batch records final decisions, which are applied only after StudioFlow's own confirmation dialog, and this client does not support MCP dialogs (elicitation). Nothing was saved. Use a client that supports them, or mark the options final on the Schedule screen." }] };
    }
    if (server.server.getClientCapabilities()?.elicitation) {
      let approved = false;
      try {
        const answer = await server.server.elicitInput({
          message: issued.message,
          requestedSchema: { type: "object", properties: { setuju: { type: "boolean", title: "Ya, terapkan", description: "Centang untuk menyimpan perubahan ini ke StudioFlow." } }, required: ["setuju"] },
        });
        approved = answer.action === "accept" && answer.content?.setuju === true;
      } catch (error) {
        log(`schedule-assistant: confirmation dialog failed: ${error instanceof Error ? error.message : "unknown error"}`);
      }
      if (!approved) return result({ applied: false, reason: "Pengguna tidak menyetujui di dialog konfirmasi. Tidak ada yang disimpan. Tanyakan apa yang ingin diubah." });
    }
    const path = `projects/${encodeURIComponent(args.projectId)}`;
    const hasImages = Object.keys(issued.images).length > 0;
    const body = JSON.stringify({ operationId: args.operationId, digest: args.digest, operations: issued.sent, ...(hasImages ? { images: issued.images } : {}) });
    const applied = await call(`${path}/apply`, { method: "POST", body, idempotencyKey: args.operationId });
    // A stale preview can never succeed again under this key: forget it so a new preview is required.
    if (!applied.ok && applied.body?.error?.code === "SCHEDULE_PREVIEW_STALE") previews.delete(args.operationId);
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
