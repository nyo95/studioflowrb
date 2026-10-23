import "server-only";

import { createHash } from "node:crypto";

import type { PrismaClient } from "@/generated/prisma/client";
import type { TransactionClient } from "@platform/core/db";
import { AppError } from "@platform/core/errors";

import { STUDIOFLOW_IMAGE_TYPES } from "../domain/images";
import { normalizeExtraFields, normalizeScheduleCategory, SCHEDULE_IMAGE_BYTES, scheduleCode, similarScheduleCategories } from "../domain/schedule";
import { SCHEDULE_COLOR_HEX, solidColorPng } from "../schedule/color-image";
import { scheduleFingerprint, sha256Canonical } from "../schedule/fingerprint";
import { createScheduleService, type OptionPatch } from "../schedule/service";
import type { SnapshotInput } from "../schedule/sync";
import {
  hasPermission,
  loadWritableProject,
  P,
  bookMemberFact,
  projectAccessFromFacts,
  requireCommand,
  requireProjectAccess,
  requireProjectDetailAccess,
  requireRead,
  type CommandContext,
  type StudioFlowPorts,
} from "../shared";

/**
 * StudioFlow's Product Schedule composer door (WO-SCHEDULE-ASSISTANT-01). An outside composer (the Schedule Assistant
 * module) reads a bounded schedule context, previews a batch as a rolled-back dry run, and applies an approved batch
 * inside the caller's transaction. Codes, prefixes, category spelling, option labels, Brand snapshots and the
 * Material/Fixture rules all come from the schedule writer; no Prisma row, storage key or signed URL leaves this door.
 */

export type ScheduleComposerOption = {
  brandId?: string | null;
  /** A typed Brand, resolved to an exact Master Data name when possible or stored as typed. */
  brandName?: string | null;
  productName: string;
  color?: string | null;
  pattern?: string | null;
  finishing?: string | null;
  dimension?: string | null;
  notes?: string | null;
  extra?: Array<{ label: string; value: string }>;
};
export type ScheduleComposerOptionPatch = Partial<ScheduleComposerOption>;

export type ScheduleComposerOperation =
  | { op: "apply_templates" }
  | { op: "create_entry"; ref?: string; section: "MATERIAL" | "FIXTURE"; category: string; qty?: string | null; unit?: string | null; location?: string | null; option?: ScheduleComposerOption }
  | { op: "update_entry"; entryId: string; qty?: string | null; unit?: string | null; location?: string | null }
  | { op: "create_option"; entryId?: string; entryRef?: string; option: ScheduleComposerOption }
  | { op: "reuse_option"; entryId?: string; entryRef?: string; sourceOptionId: string }
  | { op: "update_option"; optionId: string; patch: ScheduleComposerOptionPatch }
  | { op: "finalize_option"; optionId: string }
  /** A photo the caller sends as bytes at apply; the operation carries only its hash, so the digest pins the file. */
  | { op: "set_option_image"; optionId?: string; entryRef?: string; image: ScheduleComposerImage }
  /** A colour placeholder: StudioFlow draws a solid 4:5 picture. */
  | { op: "set_option_color"; optionId?: string; entryRef?: string; hex: string };

export type ScheduleComposerImage = { sha256: string; contentType: string; bytes: number };

/** At most this many photos travel in one batch (the apply body carries their bytes). */
export const SCHEDULE_COMPOSER_MAX_IMAGES = 4;

export type ScheduleComposerIssue = {
  index: number;
  op: ScheduleComposerOperation["op"];
  field?: string;
  code: string;
  message: string;
  suggestions?: Array<{ id: string; name: string }>;
};

export type ScheduleComposerResult = {
  index: number;
  op: ScheduleComposerOperation["op"];
  effect: "create" | "update" | "no_change";
  entryId?: string;
  entryCode?: string;
  optionId?: string;
  optionLabel?: string;
  /** finalize_option: the option's product, and the other options of its item that become "not used". */
  productName?: string;
  displacedOptions?: string[];
  /** set_option_image / set_option_color: where the picture comes from and whether it replaces one. */
  imageSource?: "file" | "color";
  color?: string;
  replacesImage?: boolean;
  category?: string;
  prefix?: string;
  newCategory?: boolean;
  brandName?: string | null;
  brandId?: string | null;
  brandResolvedFromName?: boolean;
  changes?: Record<string, { from: unknown; to: unknown }>;
  templatesCreated?: Array<{ code: string; category: string; productName: string | null }>;
};

/** Not blocking: something the user should confirm before applying, e.g. a new category that looks like a studio one. */
export type ScheduleComposerWarning =
  | { index: number; code: "SCHEDULE_CATEGORY_SIMILAR"; message: string; suggestions: Array<{ category: string; prefix: string | null }> }
  | { index: number; code: "SCHEDULE_BRAND_NOT_IN_MASTER_DATA"; message: string; suggestions: Array<{ id: string; name: string }> }
  /** WO-SCHEDULE-ASSISTANT-04: an option this batch creates ends without a photo or colour; ask the user first. */
  | { index: number; code: "SCHEDULE_OPTION_NO_IMAGE"; message: string; entryCode?: string; optionLabel?: string };

export type ScheduleComposerPreview =
  | { valid: false; issues: ScheduleComposerIssue[] }
  | { valid: true; digest: string; baseFingerprint: string; templatesCreated: number; operations: ScheduleComposerResult[]; warnings: ScheduleComposerWarning[] };

/** `via` names the outside door in audit metadata (the Schedule Assistant unless a caller says otherwise). */
type Ctx = CommandContext & { projectId: string; via?: string };
/** The stored object for a photo (by hash) or a colour (by hex); preview never stores anything. */
type PictureKeys = (picture: { image: string } | { color: string }) => { key: string; bytes: number };
const PREVIEW_PICTURES: PictureKeys = () => ({ key: "preview", bytes: 0 });
const QTY = /^\d+(\.\d{1,2})?$/;
const DIGEST_VERSION = 1;
const LIMITS = { projects: 200, brands: 20, reusable: 20, suggestions: 5 } as const;

/** A failure of one batch operation, with its position, so preview can report it and apply can name it. */
class OperationFailure {
  constructor(readonly index: number, readonly op: ScheduleComposerOperation["op"], readonly error: unknown) {}
}

function actorIdOf(ctx: CommandContext): string {
  if (ctx.actor.kind !== "USER" || !ctx.actor.userId) throw new AppError("UNAUTHENTICATED", "ACTOR_REQUIRED", "An authenticated staff member is required.");
  return ctx.actor.userId;
}

function filled(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function digestOf(projectId: string, operations: readonly ScheduleComposerOperation[], baseFingerprint: string): string {
  return sha256Canonical({ v: DIGEST_VERSION, projectId, operations, baseFingerprint });
}

export type StudioFlowScheduleComposer = ReturnType<typeof createStudioFlowScheduleComposer>;

export function createStudioFlowScheduleComposer(db: PrismaClient, ports: StudioFlowPorts) {
  const schedule = createScheduleService(db, ports);

  function canApply(grants: CommandContext["grants"], facts: { status: string; archived_at: Date | null; pic_designer_id: string | null; pic_drafter_id: string | null }, actorId: string): boolean {
    return hasPermission(grants, P.scheduleManage) && facts.archived_at === null && projectAccessFromFacts({ ...facts, phases: [] }, { grants, actorId }).canEditDocuments;
  }

  /** The Schedule screen's write rule, checked on the batch's own transaction. */
  async function requireApply(tx: TransactionClient, ctx: Ctx): Promise<void> {
    const actorId = requireCommand(ctx, P.scheduleManage);
    await requireProjectDetailAccess(tx, { grants: ctx.grants, actorId, projectId: ctx.projectId });
    await requireProjectAccess(tx, { grants: ctx.grants, actorId, projectId: ctx.projectId, kind: "document" });
    await loadWritableProject(tx, ctx.projectId);
  }

  async function brandIssue(index: number, op: ScheduleComposerOperation["op"], field: string, option: { brandId?: string | null }): Promise<ScheduleComposerIssue | null> {
    if (!filled(option.brandId) || await ports.masterData.getBrandLibraryRead(option.brandId)) return null;
    return { index, op, field: `${field}.brandId`, code: "SCHEDULE_BRAND_NOT_FOUND", message: "This Brand is not an active Master Data Brand. Search Brands and choose one, or send a typed Brand name." };
  }

  async function resolveBrand(option: { brandId?: string | null; brandName?: string | null }) {
    if (filled(option.brandId)) {
      const read = await ports.masterData.getBrandLibraryRead(option.brandId);
      if (!read) throw new AppError("VALIDATION", "SCHEDULE_BRAND_NOT_FOUND", "Choose an active Brand.");
      return { brandId: read.id, brandName: read.name, brandResolvedFromName: false, suggestions: [] as Array<{ id: string; name: string }> };
    }
    if (!filled(option.brandName)) return { brandId: null, brandName: null, brandResolvedFromName: false, suggestions: [] as Array<{ id: string; name: string }> };
    const name = option.brandName.trim();
    const matches = await ports.masterData.listBrandLibraryReads({ search: name });
    const exact = matches.filter((brand) => brand.name.trim().toLowerCase() === name.toLowerCase());
    if (exact.length === 1) return { brandId: exact[0].id, brandName: exact[0].name, brandResolvedFromName: true, suggestions: [] as Array<{ id: string; name: string }> };
    return { brandId: null, brandName: name, brandResolvedFromName: false, suggestions: matches.slice(0, LIMITS.suggestions).map((brand) => ({ id: brand.id, name: brand.name })) };
  }

  function qtyIssues(index: number, op: ScheduleComposerOperation["op"], section: string, input: { qty?: string | null; unit?: string | null }): ScheduleComposerIssue[] {
    if (section === "MATERIAL") {
      return filled(input.qty) || filled(input.unit)
        ? [{ index, op, field: filled(input.qty) ? "qty" : "unit", code: "SCHEDULE_QTY_NOT_FOR_MATERIAL", message: "A Material line is specified, not counted: quantity and unit belong to Fixture items only." }]
        : [];
    }
    return filled(input.qty) && !QTY.test(input.qty.trim())
      ? [{ index, op, field: "qty", code: "SCHEDULE_QTY_INVALID", message: "Quantity must be a positive number with up to two decimals." }]
      : [];
  }

  /** Every problem of a batch at once, read from the batch's transaction before anything is written. */
  async function validate(tx: TransactionClient, ctx: Ctx, operations: readonly ScheduleComposerOperation[]): Promise<ScheduleComposerIssue[]> {
    const entries = await tx.sfScheduleEntry.findMany({ where: { project_id: ctx.projectId }, select: { id: true, section: true, options: { select: { id: true } } } });
    const sectionOf = new Map(entries.map((entry) => [entry.id, entry.section] as const));
    const optionIds = new Set(entries.flatMap((entry) => entry.options.map((option) => option.id)));
    const refs = new Map<string, string>();
    const refsWithOption = new Set<string>();
    const pictured = new Set<string>();
    let images = 0;
    const updatedEntries = new Set<string>();
    const updatedOptions = new Set<string>();
    const finalizedOptions = new Set<string>();
    const issues: ScheduleComposerIssue[] = [];

    const target = (index: number, op: ScheduleComposerOperation["op"], input: { entryId?: string; entryRef?: string }) => {
      if (input.entryRef !== undefined) {
        if (!refs.has(input.entryRef)) issues.push({ index, op, field: "entryRef", code: "SCHEDULE_ENTRY_REF_INVALID", message: "entryRef must name the ref of an earlier create_entry operation in this batch." });
      } else if (!input.entryId || !sectionOf.has(input.entryId)) {
        issues.push({ index, op, field: "entryId", code: "SCHEDULE_ENTRY_NOT_FOUND", message: "This schedule item is not in the project." });
      }
    };

    for (const [index, operation] of operations.entries()) {
      const { op } = operation;
      switch (operation.op) {
        case "apply_templates":
          if (index !== 0) issues.push({ index, op, code: "SCHEDULE_TEMPLATES_FIRST", message: "apply_templates may appear once, as the first operation." });
          break;
        case "create_entry": {
          if (!normalizeScheduleCategory(operation.category).label) issues.push({ index, op, field: "category", code: "SCHEDULE_CATEGORY_REQUIRED", message: "Category is required." });
          if (operation.ref !== undefined) {
            if (refs.has(operation.ref)) issues.push({ index, op, field: "ref", code: "SCHEDULE_ENTRY_REF_DUPLICATE", message: "Each create_entry ref must be unique in the batch." });
            else refs.set(operation.ref, operation.section);
            if (operation.option) refsWithOption.add(operation.ref);
          }
          issues.push(...qtyIssues(index, op, operation.section, operation));
          if (operation.option) {
            if (!filled(operation.option.productName)) issues.push({ index, op, field: "option.productName", code: "SCHEDULE_PRODUCT_REQUIRED", message: "Type is required." });
            const brand = await brandIssue(index, op, "option", operation.option);
            if (brand) issues.push(brand);
          }
          break;
        }
        case "update_entry": {
          const section = sectionOf.get(operation.entryId);
          if (!section) { issues.push({ index, op, field: "entryId", code: "SCHEDULE_ENTRY_NOT_FOUND", message: "This schedule item is not in the project." }); break; }
          if (updatedEntries.has(operation.entryId)) issues.push({ index, op, field: "entryId", code: "SCHEDULE_DUPLICATE_UPDATE", message: "An item may be updated only once per batch." });
          updatedEntries.add(operation.entryId);
          issues.push(...qtyIssues(index, op, section, operation));
          break;
        }
        case "create_option": {
          target(index, op, operation);
          if (!filled(operation.option.productName)) issues.push({ index, op, field: "option.productName", code: "SCHEDULE_PRODUCT_REQUIRED", message: "Type is required." });
          const brand = await brandIssue(index, op, "option", operation.option);
          if (brand) issues.push(brand);
          break;
        }
        case "reuse_option": {
          target(index, op, operation);
          const source = await tx.sfScheduleOption.findUnique({ where: { id: operation.sourceOptionId }, select: { entry: { select: { project_id: true } } } });
          if (!source || source.entry.project_id === ctx.projectId) issues.push({ index, op, field: "sourceOptionId", code: "SCHEDULE_REUSE_SOURCE_INVALID", message: "Choose an option from another project (search_reusable_options)." });
          break;
        }
        case "update_option": {
          if (!optionIds.has(operation.optionId)) { issues.push({ index, op, field: "optionId", code: "SCHEDULE_OPTION_NOT_FOUND", message: "This option is not in the project." }); break; }
          if (updatedOptions.has(operation.optionId)) issues.push({ index, op, field: "optionId", code: "SCHEDULE_DUPLICATE_UPDATE", message: "An option may be updated only once per batch." });
          updatedOptions.add(operation.optionId);
          if (operation.patch.productName !== undefined && !filled(operation.patch.productName)) issues.push({ index, op, field: "patch.productName", code: "SCHEDULE_PRODUCT_REQUIRED", message: "Type cannot be cleared." });
          const brand = await brandIssue(index, op, "patch", operation.patch);
          if (brand) issues.push(brand);
          break;
        }
        case "finalize_option": {
          if (!optionIds.has(operation.optionId)) { issues.push({ index, op, field: "optionId", code: "SCHEDULE_OPTION_NOT_FOUND", message: "This option is not in the project." }); break; }
          if (finalizedOptions.has(operation.optionId)) issues.push({ index, op, field: "optionId", code: "SCHEDULE_DUPLICATE_UPDATE", message: "An option may be finalized only once per batch." });
          finalizedOptions.add(operation.optionId);
          break;
        }
        case "set_option_image":
        case "set_option_color": {
          let target: string;
          if (operation.entryRef !== undefined) {
            if (!refsWithOption.has(operation.entryRef)) { issues.push({ index, op, field: "entryRef", code: "SCHEDULE_ENTRY_REF_INVALID", message: "entryRef must name an earlier create_entry of this batch that creates an option." }); break; }
            target = `ref:${operation.entryRef}`;
          } else {
            if (!operation.optionId || !optionIds.has(operation.optionId)) { issues.push({ index, op, field: "optionId", code: "SCHEDULE_OPTION_NOT_FOUND", message: "This option is not in the project." }); break; }
            target = operation.optionId;
          }
          if (pictured.has(target)) issues.push({ index, op, code: "SCHEDULE_DUPLICATE_UPDATE", message: "An option may get one photo or colour per batch." });
          pictured.add(target);
          if (operation.op === "set_option_color") {
            if (!SCHEDULE_COLOR_HEX.test(operation.hex)) issues.push({ index, op, field: "hex", code: "SCHEDULE_COLOR_INVALID", message: "Colour must be #RRGGBB, for example #D8C8A8." });
          } else {
            images += 1;
            if (images === SCHEDULE_COMPOSER_MAX_IMAGES + 1) issues.push({ index, op, code: "SCHEDULE_IMAGE_LIMIT", message: `At most ${SCHEDULE_COMPOSER_MAX_IMAGES} photos per batch; send the rest in another batch.` });
            if (!STUDIOFLOW_IMAGE_TYPES[operation.image.contentType]) issues.push({ index, op, field: "image.contentType", code: "SCHEDULE_IMAGE_TYPE", message: "Use a PNG, JPEG, or WebP image." });
            if (operation.image.bytes <= 0 || operation.image.bytes > SCHEDULE_IMAGE_BYTES) issues.push({ index, op, field: "image.bytes", code: "SCHEDULE_IMAGE_SIZE", message: "Photos must be smaller than 3 MB; shrink or crop it first." });
          }
          break;
        }
      }
    }
    return issues;
  }

  async function snapshotOf(option: ScheduleComposerOption): Promise<SnapshotInput & { brandResolvedFromName: boolean }> {
    const brand = await resolveBrand(option);
    return { ...brand, productName: option.productName, color: option.color, pattern: option.pattern, finishing: option.finishing, dimension: option.dimension, notes: option.notes, extra: option.extra ?? [], imageKey: null };
  }

  /** Run the batch through the schedule writer. Each failure carries its operation index. */
  async function execute(tx: TransactionClient, ctx: Ctx, operations: readonly ScheduleComposerOperation[], operationId: string, pictures: PictureKeys = PREVIEW_PICTURES): Promise<ScheduleComposerResult[]> {
    const metadata = { via: ctx.via ?? "schedule-assistant", operationId };
    const before = await tx.sfScheduleEntry.findMany({ where: { project_id: ctx.projectId }, select: { id: true, section: true, category_key: true } });
    const known = new Set([
      ...before.map((entry) => `${entry.section}:${entry.category_key}`),
      ...(await schedule.listCategoryChoices({ grants: ctx.grants })).map((choice) => `${choice.section}:${normalizeScheduleCategory(choice.category).key}`),
    ]);
    const refs = new Map<string, string>();
    const refOptions = new Map<string, string>();
    const results: ScheduleComposerResult[] = [];
    const entryFacts = async (entryId: string) => tx.sfScheduleEntry.findUniqueOrThrow({ where: { id: entryId }, select: { category: true, prefix: true } });

    for (const [index, operation] of operations.entries()) {
      try {
        switch (operation.op) {
          case "apply_templates": {
            const existing = new Set((await tx.sfScheduleEntry.findMany({ where: { project_id: ctx.projectId }, select: { id: true } })).map((entry) => entry.id));
            const { created } = await schedule.writer.applyTemplates(tx, { actor: ctx.actor, projectId: ctx.projectId, metadata });
            const rows = created === 0 ? [] : await tx.sfScheduleEntry.findMany({
              where: { project_id: ctx.projectId, id: { notIn: [...existing] } },
              orderBy: [{ section: "asc" }, { category_key: "asc" }, { increment: "asc" }],
              select: { category: true, prefix: true, increment: true, options: { select: { product_name: true }, take: 1 } },
            });
            results.push({ index, op: operation.op, effect: created > 0 ? "create" : "no_change", templatesCreated: rows.map((row) => ({ code: scheduleCode(row.prefix, row.increment), category: row.category, productName: row.options[0]?.product_name ?? null })) });
            break;
          }
          case "create_entry": {
            const snapshot = operation.option ? await snapshotOf(operation.option) : null;
            const created = await schedule.writer.createEntry(tx, { actor: ctx.actor, projectId: ctx.projectId, section: operation.section, category: operation.category, qty: operation.qty, unit: operation.unit, location: operation.location, snapshot, metadata });
            if (operation.ref !== undefined) refs.set(operation.ref, created.entryId);
            if (operation.ref !== undefined && created.optionId) refOptions.set(operation.ref, created.optionId);
            const facts = await entryFacts(created.entryId);
            const key = `${operation.section}:${normalizeScheduleCategory(operation.category).key}`;
            results.push({ index, op: operation.op, effect: "create", entryId: created.entryId, entryCode: created.code, optionId: created.optionId ?? undefined, optionLabel: created.label ?? undefined, category: facts.category, prefix: facts.prefix, newCategory: !known.has(key), brandName: snapshot?.brandName ?? null, ...(snapshot?.brandResolvedFromName ? { brandId: snapshot.brandId, brandResolvedFromName: true } : {}) });
            known.add(key);
            break;
          }
          case "update_entry": {
            const updated = await schedule.writer.updateEntry(tx, { actor: ctx.actor, projectId: ctx.projectId, entryId: operation.entryId, qty: operation.qty, unit: operation.unit, location: operation.location, metadata });
            const facts = await entryFacts(updated.entryId);
            const changed = Object.keys(updated.changes).length > 0;
            results.push({ index, op: operation.op, effect: changed ? "update" : "no_change", entryId: updated.entryId, entryCode: updated.code, category: facts.category, prefix: facts.prefix, ...(changed ? { changes: updated.changes } : {}) });
            break;
          }
          case "create_option":
          case "reuse_option": {
            const entryId = operation.entryRef !== undefined ? refs.get(operation.entryRef) : operation.entryId;
            if (!entryId) throw new AppError("VALIDATION", "SCHEDULE_ENTRY_REF_INVALID", "entryRef must name the ref of an earlier create_entry operation in this batch.");
            const snapshot = operation.op === "create_option" ? await snapshotOf(operation.option) : null;
            const created = operation.op === "create_option"
              ? await schedule.writer.createOption(tx, { actor: ctx.actor, projectId: ctx.projectId, entryId, snapshot: snapshot!, metadata })
              : await schedule.writer.reuseOption(tx, { actor: ctx.actor, projectId: ctx.projectId, entryId, sourceOptionId: operation.sourceOptionId, metadata });
            const facts = await entryFacts(created.entryId);
            const brandName = snapshot ? snapshot.brandName : (await tx.sfScheduleOption.findUniqueOrThrow({ where: { id: created.optionId! }, select: { brand_name: true } })).brand_name;
            results.push({ index, op: operation.op, effect: "create", entryId: created.entryId, entryCode: created.code, optionId: created.optionId ?? undefined, optionLabel: created.label ?? undefined, category: facts.category, prefix: facts.prefix, brandName, ...(snapshot?.brandResolvedFromName ? { brandId: snapshot.brandId, brandResolvedFromName: true } : {}) });
            break;
          }
          case "update_option": {
            const resolved = operation.patch.brandId !== undefined || operation.patch.brandName !== undefined ? await resolveBrand(operation.patch) : null;
            const patch: OptionPatch = resolved ? { ...operation.patch, brandId: resolved.brandId, brandName: resolved.brandName } : operation.patch;
            const updated = await schedule.writer.patchOption(tx, { actor: ctx.actor, projectId: ctx.projectId, optionId: operation.optionId, patch, metadata });
            const changed = Object.keys(updated.changes).length > 0;
            const facts = await entryFacts(updated.entryId);
            const brandName = (await tx.sfScheduleOption.findUniqueOrThrow({ where: { id: updated.optionId }, select: { brand_name: true } })).brand_name;
            results.push({ index, op: operation.op, effect: changed ? "update" : "no_change", entryId: updated.entryId, entryCode: updated.code, optionId: updated.optionId, optionLabel: updated.label, category: facts.category, prefix: facts.prefix, brandName, ...(resolved?.brandResolvedFromName ? { brandId: resolved.brandId, brandResolvedFromName: true } : {}), ...(changed ? { changes: updated.changes } : {}) });
            break;
          }
          case "finalize_option": {
            const done = await schedule.writer.markFinal(tx, { actor: ctx.actor, projectId: ctx.projectId, optionId: operation.optionId, skipIfFinal: true, metadata });
            const facts = await entryFacts(done.entryId);
            results.push({ index, op: operation.op, effect: done.changed ? "update" : "no_change", entryId: done.entryId, entryCode: done.code, optionId: done.optionId, optionLabel: done.label, productName: done.productName, category: facts.category, prefix: facts.prefix, ...(done.changed ? { changes: { isFinal: { from: false, to: true } }, displacedOptions: done.displacedLabels } : {}) });
            break;
          }
          case "set_option_image":
          case "set_option_color": {
            const optionId = operation.entryRef !== undefined ? refOptions.get(operation.entryRef) : operation.optionId;
            if (!optionId) throw new AppError("VALIDATION", "SCHEDULE_ENTRY_REF_INVALID", "entryRef must name an earlier create_entry of this batch that creates an option.");
            const color = operation.op === "set_option_color" ? operation.hex.toLowerCase() : undefined;
            const picture = pictures(operation.op === "set_option_image" ? { image: operation.image.sha256 } : { color: color! });
            const done = await schedule.writer.attachOptionImage(tx, { actor: ctx.actor, projectId: ctx.projectId, optionId, key: picture.key, bytes: picture.bytes, metadata: { ...metadata, source: color ? "color" : "file", ...(color ? { color } : {}) } });
            const facts = await entryFacts(done.entryId);
            results.push({ index, op: operation.op, effect: "update", entryId: done.entryId, entryCode: done.code, optionId: done.optionId, optionLabel: done.label, category: facts.category, prefix: facts.prefix, imageSource: color ? "color" : "file", ...(color ? { color } : {}), replacesImage: done.replaced });
            break;
          }
        }
      } catch (error) {
        throw new OperationFailure(index, operation.op, error);
      }
    }
    return results;
  }

  /**
   * Check every photo the batch names against the bytes sent with apply (same hash, size and type), then store photos
   * and drawn colours before the writes. `stored` collects the keys so a failed batch can remove them.
   */
  async function storePictures(ctx: Ctx & { operations: readonly ScheduleComposerOperation[]; images?: Readonly<Record<string, string>> }, stored: string[]): Promise<PictureKeys> {
    const sent = ctx.images ?? {};
    const named = new Map<string, ScheduleComposerImage>();
    const colors = new Set<string>();
    for (const operation of ctx.operations) {
      if (operation.op === "set_option_image") named.set(operation.image.sha256, operation.image);
      if (operation.op === "set_option_color") colors.add(operation.hex.toLowerCase());
    }
    for (const hash of Object.keys(sent)) if (!named.has(hash)) throw new AppError("VALIDATION", "SCHEDULE_IMAGE_UNUSED", "A photo was sent that no operation of this batch names.");
    const keys = new Map<string, { key: string; bytes: number }>();
    for (const [hash, image] of named) {
      const base64 = sent[hash];
      if (!base64) throw new AppError("VALIDATION", "SCHEDULE_IMAGE_MISSING", "A photo named by the batch was not sent with apply.");
      const body = new Uint8Array(Buffer.from(base64, "base64"));
      if (body.byteLength !== image.bytes || createHash("sha256").update(body).digest("hex") !== hash) {
        throw new AppError("VALIDATION", "SCHEDULE_IMAGE_MISMATCH", "A photo differs from the one previewed. Preview again.");
      }
      const key = await schedule.writer.storeOptionImage(ctx.projectId, { body, contentType: image.contentType });
      stored.push(key);
      keys.set(`image:${hash}`, { key, bytes: body.byteLength });
    }
    for (const color of colors) {
      const png = solidColorPng(color);
      const key = await schedule.writer.storeOptionImage(ctx.projectId, png);
      stored.push(key);
      keys.set(`color:${color}`, { key, bytes: png.body.byteLength });
    }
    return (picture) => {
      const found = keys.get("image" in picture ? `image:${picture.image}` : `color:${picture.color}`);
      if (!found) throw new AppError("INVARIANT", "SCHEDULE_IMAGE_NOT_STORED", "A picture of the batch was not stored.");
      return found;
    };
  }

  /** Validation-type failures become preview issues; access, conflicts and server faults stay errors. */
  function issueFromFailure(failure: OperationFailure): ScheduleComposerIssue | null {
    const { error } = failure;
    if (!(error instanceof AppError) || (error.kind !== "VALIDATION" && error.kind !== "NOT_FOUND")) return null;
    return { index: failure.index, op: failure.op, code: error.code, message: error.safeMessage };
  }

  function namedError(failure: OperationFailure): unknown {
    const { error } = failure;
    if (!(error instanceof AppError)) return error;
    return new AppError(error.kind, error.code, `Operation ${failure.index + 1} (${failure.op}): ${error.safeMessage}`, { details: { index: failure.index }, cause: error });
  }

  return {
    /** Projects the caller may read (assigned team or StudioFlow Manager), with whether they may apply changes. */
    async listProjects(ctx: CommandContext) {
      requireRead(ctx.grants);
      const actorId = actorIdOf(ctx);
      const manager = hasPermission(ctx.grants, P.projectManage);
      const projects = await db.sfProject.findMany({
        where: { archived_at: null, ...(manager ? {} : { OR: [{ pic_designer_id: actorId }, { pic_drafter_id: actorId }, { book_members: { some: { user_id: actorId } } }] }) },
        orderBy: { name: "asc" },
        take: LIMITS.projects,
        select: { id: true, name: true, status: true, archived_at: true, pic_designer_id: true, pic_drafter_id: true, book_members: bookMemberFact(actorId) },
      });
      return projects
        .filter((project) => projectAccessFromFacts({ ...project, phases: [] }, { grants: ctx.grants, actorId }).canSeeWorkSections)
        .map((project) => ({ id: project.id, name: project.name, status: project.status, canApply: canApply(ctx.grants, project, actorId) }));
    },

    /** The bounded schedule context of one project: no storage keys, signed URLs, samples or other project sections. */
    async readContext(ctx: Ctx) {
      const actorId = actorIdOf(ctx);
      await requireProjectDetailAccess(db, { grants: ctx.grants, actorId, projectId: ctx.projectId });
      const [project, entries, templates, categoryChoices, baseFingerprint] = await Promise.all([
        db.sfProject.findUniqueOrThrow({ where: { id: ctx.projectId }, select: { id: true, name: true, status: true, archived_at: true, pic_designer_id: true, pic_drafter_id: true } }),
        db.sfScheduleEntry.findMany({
          where: { project_id: ctx.projectId },
          orderBy: [{ section: "asc" }, { category_key: "asc" }, { increment: "asc" }],
          include: { options: { orderBy: { label: "asc" } } },
        }),
        db.sfScheduleTemplateItem.findMany({ where: { is_active: true }, orderBy: [{ section: "asc" }, { sort_order: "asc" }], select: { id: true, section: true, category: true, product_name: true, brand_name: true } }),
        schedule.listCategoryChoices({ grants: ctx.grants }),
        scheduleFingerprint(db, ctx.projectId),
      ]);
      const applied = new Set(entries.map((entry) => entry.template_item_id).filter((id): id is string => !!id));
      return {
        project: { id: project.id, name: project.name, status: project.status, archived: project.archived_at !== null, canApply: canApply(ctx.grants, project, actorId) },
        baseFingerprint,
        entries: entries.map((entry) => ({
          id: entry.id,
          section: entry.section,
          category: entry.category,
          prefix: entry.prefix,
          code: scheduleCode(entry.prefix, entry.increment),
          qty: entry.qty?.toString() ?? null,
          unit: entry.unit,
          location: entry.location,
          options: entry.options.map((option) => ({
            id: option.id,
            label: option.label,
            isFinal: option.is_final,
            status: option.status,
            brandId: option.brand_id,
            brandName: option.brand_name,
            productName: option.product_name,
            color: option.color,
            pattern: option.pattern,
            finishing: option.finishing,
            dimension: option.dimension,
            notes: option.notes,
            extra: normalizeExtraFields(option.extra),
            hasImage: option.image_key !== null,
          })),
        })),
        categoryChoices,
        templatesNotApplied: templates.filter((item) => !applied.has(item.id)).map((item) => ({ section: item.section, category: item.category, productName: item.product_name || null, brandName: item.brand_name })),
      };
    },

    async searchBrands(ctx: CommandContext & { query: string }) {
      requireRead(ctx.grants);
      return (await schedule.listBrandChoices({ grants: ctx.grants, search: ctx.query })).slice(0, LIMITS.brands);
    },

    async searchReusableOptions(ctx: Ctx & { query: string; section?: string }) {
      await requireProjectDetailAccess(db, { grants: ctx.grants, actorId: actorIdOf(ctx), projectId: ctx.projectId });
      return schedule.searchReusableOptions({ grants: ctx.grants, projectId: ctx.projectId, query: ctx.query, section: ctx.section, limit: LIMITS.reusable });
    },

    /**
     * Validate, then dry-run the batch through the real writer in a transaction that is always rolled back, so the
     * projected codes and labels are exactly what apply produces against the same schedule. Nothing is written.
     */
    async previewBatch(ctx: Ctx & { operations: readonly ScheduleComposerOperation[] }): Promise<ScheduleComposerPreview> {
      const rollback = Symbol("schedule-preview-rollback");
      let outcome: ScheduleComposerPreview | undefined;
      try {
        await ports.runTransaction(async (tx) => {
          await requireApply(tx, ctx);
          const baseFingerprint = await scheduleFingerprint(tx, ctx.projectId);
          const issues = await validate(tx, ctx, ctx.operations);
          if (issues.length > 0) {
            outcome = { valid: false, issues };
          } else {
            try {
              const executed = await execute(tx, ctx, ctx.operations, "preview");
              const created = executed.filter((result) => (result.op === "create_entry" || result.op === "create_option") && result.optionId);
              const bare = new Set((await tx.sfScheduleOption.findMany({ where: { id: { in: created.map((result) => result.optionId!) }, image_key: null }, select: { id: true } })).map((row) => row.id));
              const operations = executed.map((result) => (result.effect === "create" ? { ...result, entryId: undefined, optionId: undefined } : result));
              // WO-SF-CATEGORY-SIMILAR-01: a brand-new category that looks like a studio one is worth a question.
              const studio = await schedule.listCategoryChoices({ grants: ctx.grants });
              const warnings: ScheduleComposerWarning[] = [];
              for (const result of operations) {
                const operation = ctx.operations[result.index];
                if (!result.newCategory || operation?.op !== "create_entry") continue;
                const suggestions = similarScheduleCategories(operation.category, studio.filter((choice) => choice.section === operation.section));
                if (suggestions.length === 0) continue;
                warnings.push({
                  index: result.index,
                  code: "SCHEDULE_CATEGORY_SIMILAR",
                  message: `"${operation.category}" is a new category and would be coded ${result.prefix}; it looks like ${suggestions.map((choice) => `${choice.category}${choice.prefix ? ` (${choice.prefix})` : ""}`).join(" or ")}. Ask the user which one is meant.`,
                  suggestions: suggestions.map(({ category, prefix }) => ({ category, prefix })),
                });
              }
              for (const [index, operation] of ctx.operations.entries()) {
                const option = operation.op === "create_entry" || operation.op === "create_option" ? operation.option : operation.op === "update_option" ? operation.patch : undefined;
                if (!option || filled(option.brandId) || !filled(option.brandName)) continue;
                const brand = await resolveBrand(option);
                if (brand.brandId) continue;
                warnings.push({
                  index,
                  code: "SCHEDULE_BRAND_NOT_IN_MASTER_DATA",
                  message: `"${brand.brandName}" is not an exact Master Data Brand. Ask whether to use a suggested Brand or keep this typed name, then preview again with that choice.`,
                  suggestions: brand.suggestions,
                });
              }
              // WO-SCHEDULE-ASSISTANT-04: every new option without a photo or colour is a question for the user.
              for (const result of created) {
                if (!bare.has(result.optionId!)) continue;
                warnings.push({ index: result.index, code: "SCHEDULE_OPTION_NO_IMAGE", entryCode: result.entryCode, optionLabel: result.optionLabel, message: `${result.entryCode} ${result.optionLabel ?? ""} has no photo. Ask the user for one; if there is none, ask whether a colour placeholder should be used and which colour (#RRGGBB), then preview again.` });
              }
              outcome = {
                valid: true,
                digest: digestOf(ctx.projectId, ctx.operations, baseFingerprint),
                baseFingerprint,
                templatesCreated: operations.reduce((sum, result) => sum + (result.templatesCreated?.length ?? 0), 0),
                operations,
                warnings,
              };
            } catch (error) {
              const issue = error instanceof OperationFailure ? issueFromFailure(error) : null;
              if (!issue) throw error instanceof OperationFailure ? error.error : error;
              outcome = { valid: false, issues: [issue] };
            }
          }
          throw rollback;
        });
      } catch (error) {
        if (error !== rollback) throw error;
      }
      if (!outcome) throw new AppError("INTERNAL", "SCHEDULE_PREVIEW_FAILED", "The preview could not be prepared.");
      return JSON.parse(JSON.stringify(outcome)) as ScheduleComposerPreview;
    },

    /**
     * Apply an approved preview inside the caller's transaction (the integration kit's, which also holds the
     * idempotency record). A schedule that changed since the preview is refused before anything is written; any failed
     * operation fails the whole batch.
     */
    async applyBatch(tx: TransactionClient, ctx: Ctx & { operationId: string; digest: string; operations: readonly ScheduleComposerOperation[]; images?: Readonly<Record<string, string>> }) {
      await requireApply(tx, ctx);
      const baseFingerprint = await scheduleFingerprint(tx, ctx.projectId);
      if (digestOf(ctx.projectId, ctx.operations, baseFingerprint) !== ctx.digest) {
        throw new AppError("CONFLICT", "SCHEDULE_PREVIEW_STALE", "The schedule changed since the preview, or the batch differs from it. Preview again.");
      }
      const issues = await validate(tx, ctx, ctx.operations);
      if (issues.length > 0) {
        const [first] = issues;
        throw new AppError("VALIDATION", first.code, `Operation ${first.index + 1} (${first.op}): ${first.message}`, { details: { issues } });
      }
      const stored: string[] = [];
      let operations: ScheduleComposerResult[];
      try {
        const pictures = await storePictures(ctx, stored);
        operations = await execute(tx, ctx, ctx.operations, ctx.operationId, pictures);
      } catch (error) {
        // Put first, record after: a batch that does not commit must not leave its objects behind.
        await schedule.writer.discardStoredImages(stored);
        throw error instanceof OperationFailure ? namedError(error) : error;
      }
      return {
        operationId: ctx.operationId,
        applied: true as const,
        templatesCreated: operations.reduce((sum, result) => sum + (result.templatesCreated?.length ?? 0), 0),
        operations: operations.map(({ templatesCreated: _list, ...result }) => result),
      };
    },
  };
}
