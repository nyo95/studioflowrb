import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import type { TransactionClient } from "@platform/core/db";
import { AppError } from "@platform/core/errors";

import { normalizeExtraFields, normalizeScheduleCategory, scheduleCode } from "../domain/schedule";
import { scheduleFingerprint, sha256Canonical } from "../schedule/fingerprint";
import { createScheduleService, type OptionPatch } from "../schedule/service";
import type { SnapshotInput } from "../schedule/sync";
import {
  hasPermission,
  loadWritableProject,
  P,
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
  /** A Brand named by the brief, only to suggest Master Data Brands; it is never stored. */
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
  | { op: "update_option"; optionId: string; patch: ScheduleComposerOptionPatch };

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
  category?: string;
  prefix?: string;
  newCategory?: boolean;
  brandName?: string | null;
  changes?: Record<string, { from: unknown; to: unknown }>;
  templatesCreated?: Array<{ code: string; category: string; productName: string | null }>;
};

export type ScheduleComposerPreview =
  | { valid: false; issues: ScheduleComposerIssue[] }
  | { valid: true; digest: string; baseFingerprint: string; templatesCreated: number; operations: ScheduleComposerResult[] };

type Ctx = CommandContext & { projectId: string };
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

  async function brandIssue(index: number, op: ScheduleComposerOperation["op"], field: string, option: { brandId?: string | null; brandName?: string | null }): Promise<ScheduleComposerIssue | null> {
    if (filled(option.brandId)) {
      if (await ports.masterData.getBrandLibraryRead(option.brandId)) return null;
      return { index, op, field: `${field}.brandId`, code: "SCHEDULE_BRAND_NOT_FOUND", message: "This Brand is not an active Master Data Brand. Search Brands and choose one, or leave the Brand empty." };
    }
    if (!filled(option.brandName)) return null;
    const matches = await ports.masterData.listBrandLibraryReads({ search: option.brandName.trim() });
    return {
      index,
      op,
      field: `${field}.brandName`,
      code: "SCHEDULE_BRAND_NOT_FOUND",
      message: `"${option.brandName.trim()}" must be chosen from Master Data: send one of the suggested Brand ids, leave the Brand empty, or add the Brand in Master Data first.`,
      suggestions: matches.slice(0, LIMITS.suggestions).map((brand) => ({ id: brand.id, name: brand.name })),
    };
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
    const updatedEntries = new Set<string>();
    const updatedOptions = new Set<string>();
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
      }
    }
    return issues;
  }

  async function snapshotOf(option: ScheduleComposerOption): Promise<SnapshotInput> {
    let brand: { brandId: string | null; brandName: string | null } = { brandId: null, brandName: null };
    if (filled(option.brandId)) {
      const read = await ports.masterData.getBrandLibraryRead(option.brandId);
      if (!read) throw new AppError("VALIDATION", "SCHEDULE_BRAND_NOT_FOUND", "Choose an active Brand.");
      brand = { brandId: read.id, brandName: read.name };
    }
    return { ...brand, productName: option.productName, color: option.color, pattern: option.pattern, finishing: option.finishing, dimension: option.dimension, notes: option.notes, extra: option.extra ?? [], imageKey: null };
  }

  /** Run the batch through the schedule writer. Each failure carries its operation index. */
  async function execute(tx: TransactionClient, ctx: Ctx, operations: readonly ScheduleComposerOperation[], operationId: string): Promise<ScheduleComposerResult[]> {
    const metadata = { via: "schedule-assistant", operationId };
    const before = await tx.sfScheduleEntry.findMany({ where: { project_id: ctx.projectId }, select: { id: true, section: true, category_key: true } });
    const known = new Set([
      ...before.map((entry) => `${entry.section}:${entry.category_key}`),
      ...(await schedule.listCategoryChoices({ grants: ctx.grants })).map((choice) => `${choice.section}:${normalizeScheduleCategory(choice.category).key}`),
    ]);
    const refs = new Map<string, string>();
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
            const facts = await entryFacts(created.entryId);
            const key = `${operation.section}:${normalizeScheduleCategory(operation.category).key}`;
            results.push({ index, op: operation.op, effect: "create", entryId: created.entryId, entryCode: created.code, optionId: created.optionId ?? undefined, optionLabel: created.label ?? undefined, category: facts.category, prefix: facts.prefix, newCategory: !known.has(key), brandName: snapshot?.brandName ?? null });
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
            results.push({ index, op: operation.op, effect: "create", entryId: created.entryId, entryCode: created.code, optionId: created.optionId ?? undefined, optionLabel: created.label ?? undefined, category: facts.category, prefix: facts.prefix, brandName });
            break;
          }
          case "update_option": {
            const { brandName: _brief, ...rest } = operation.patch;
            const patch: OptionPatch = rest;
            const updated = await schedule.writer.patchOption(tx, { actor: ctx.actor, projectId: ctx.projectId, optionId: operation.optionId, patch, metadata });
            const changed = Object.keys(updated.changes).length > 0;
            const facts = await entryFacts(updated.entryId);
            const brandName = (await tx.sfScheduleOption.findUniqueOrThrow({ where: { id: updated.optionId }, select: { brand_name: true } })).brand_name;
            results.push({ index, op: operation.op, effect: changed ? "update" : "no_change", entryId: updated.entryId, entryCode: updated.code, optionId: updated.optionId, optionLabel: updated.label, category: facts.category, prefix: facts.prefix, brandName, ...(changed ? { changes: updated.changes } : {}) });
            break;
          }
        }
      } catch (error) {
        throw new OperationFailure(index, operation.op, error);
      }
    }
    return results;
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
        where: { archived_at: null, ...(manager ? {} : { OR: [{ pic_designer_id: actorId }, { pic_drafter_id: actorId }] }) },
        orderBy: { name: "asc" },
        take: LIMITS.projects,
        select: { id: true, name: true, status: true, archived_at: true, pic_designer_id: true, pic_drafter_id: true },
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
              const operations = (await execute(tx, ctx, ctx.operations, "preview")).map((result) => (result.effect === "create" ? { ...result, entryId: undefined, optionId: undefined } : result));
              outcome = {
                valid: true,
                digest: digestOf(ctx.projectId, ctx.operations, baseFingerprint),
                baseFingerprint,
                templatesCreated: operations.reduce((sum, result) => sum + (result.templatesCreated?.length ?? 0), 0),
                operations,
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
    async applyBatch(tx: TransactionClient, ctx: Ctx & { operationId: string; digest: string; operations: readonly ScheduleComposerOperation[] }) {
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
      let operations: ScheduleComposerResult[];
      try {
        operations = await execute(tx, ctx, ctx.operations, ctx.operationId);
      } catch (error) {
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
