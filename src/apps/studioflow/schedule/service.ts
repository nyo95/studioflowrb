import { discardObjects, removeUnreferenced as removeUnreferencedAssets } from "../asset-cleanup";
import { Prisma } from "@/generated/prisma/client";

import { createPrivateObjectKey } from "@platform/core/storage";
import { buildImportTemplate, parseCsvText, readTabularGrid, type FileResult, type ImportFormat, type TableColumn } from "@platform/utilities/tabular";

import { STUDIOFLOW_IMAGE_TYPES, sniffImage } from "../domain/images";
import {
  SCHEDULE_IMAGE_BYTES,
  SCHEDULE_SECTIONS,
  compareOptionLabels,
  fallbackPrefix,
  isPermutation,
  nextOptionLabel,
  isScheduleCardFieldKey,
  normalizeExtraFields,
  normalizeScheduleCategory,
  normalizeSchedulePrefix,
  orderCardFields,
  parseLegacyScheduleCsv,
  parseLegacyScheduleSheet,
  parseScheduleCode,
  lowestFreeNumber,
  scheduleCode,
  type ScheduleSection,
} from "../domain/schedule";
import {
  P,
  conflict,
  hasPermission,
  invalid,
  loadWritableProject,
  notFound,
  nowOf,
  optionalText,
  requireCommand,
  requireProjectAccess,
  requireRead,
  writeAudit,
  type CommandContext,
  type Db,
  type ReadContext,
  type StudioFlowPorts,
  type TxClient,
} from "../shared";

import { allocateIncrement, categoryPrefix, cleanSnapshot, createEntryWithOptionalOption, optionData, seedScheduleFromTemplates, type SnapshotInput } from "./sync";

/** `card_fields` is JSON on the row: null = no override, array = explicit (possibly empty). */
function cardFieldsOf(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return orderCardFields(value.filter((key): key is string => typeof key === "string" && isScheduleCardFieldKey(key)));
}

const ENTRY_ENTITY = "schedule-entry";
const OPTION_ENTITY = "schedule-option";
const TEMPLATE_ENTITY = "schedule-template";
const SIGNED_URL_SECONDS = 15 * 60;

export type ScheduleImageUpload = { body: Uint8Array; contentType: string };

/** Template item fields an operator may edit; the photo is managed by its own command. */
export type TemplateItemInput = {
  snapshot: SnapshotInput;
  qty?: string | null;
  unit?: string | null;
  location?: string | null;
};

function sectionOf(value: string): ScheduleSection {
  if (!(SCHEDULE_SECTIONS as readonly string[]).includes(value)) throw invalid("SCHEDULE_SECTION_INVALID", "Choose Material or Fixture.");
  return value as ScheduleSection;
}

function categoryOf(value: string): { label: string; key: string } {
  const category = normalizeScheduleCategory(value);
  if (!category.label) throw invalid("SCHEDULE_CATEGORY_REQUIRED", "Category is required.");
  if (category.label.length > 80) throw invalid("SCHEDULE_CATEGORY_TOO_LONG", "Category is too long.");
  return category;
}

function prefixOf(value: string, category: string): string {
  const prefix = normalizeSchedulePrefix(value || fallbackPrefix(category));
  if (!prefix) throw invalid("SCHEDULE_PREFIX_REQUIRED", "Prefix is required.");
  return prefix;
}

function decimalText(value: string | null | undefined): string | null {
  const text = optionalText(value, 20);
  if (!text) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw invalid("SCHEDULE_QTY_INVALID", "Quantity must be a positive number with up to two decimals.");
  return text;
}

function templateItemData(snapshot: ReturnType<typeof cleanSnapshot>) {
  return {
    brand_id: snapshot.brandId,
    brand_name: snapshot.brandName,
    product_name: snapshot.productName,
    color: snapshot.color,
    pattern: snapshot.pattern,
    finishing: snapshot.finishing,
    dimension: snapshot.dimension,
    notes: snapshot.notes,
    extra: snapshot.extra,
    image_key: snapshot.imageKey,
  };
}

async function brandSnapshot(ports: StudioFlowPorts, brandId?: string | null): Promise<{ brandId: string | null; brandName: string | null }> {
  const id = optionalText(brandId, 80);
  if (!id) return { brandId: null, brandName: null };
  const brand = await ports.masterData.getBrandLibraryRead(id);
  if (!brand) throw invalid("SCHEDULE_BRAND_NOT_FOUND", "Choose an active Brand.");
  return { brandId: brand.id, brandName: brand.name };
}

function scopeError() {
  return notFound("schedule item");
}

const SIMPLE_IMPORT_COLUMNS: TableColumn[] = [
  { key: "category", header: "Category", required: true, example: "Tile", note: "Product category of the item." },
  { key: "brand", header: "Brand", example: "Roman" },
  { key: "product", header: "Product", required: true, example: "Granitio", note: "Rows without a product are skipped." },
  { key: "sku", header: "SKU", example: "GR-1" },
  { key: "color", header: "Color", example: "Ivory" },
  { key: "pattern", header: "Pattern" },
  { key: "finishing", header: "Finishing" },
  { key: "dimension", header: "Dimension", example: "60x60" },
  { key: "qty", header: "Qty", type: "number", example: "12", note: "Fixture items only." },
  { key: "unit", header: "Unit", example: "m2" },
  { key: "location", header: "Location", example: "Lobby" },
  { key: "notes", header: "Notes" },
];

export function createScheduleService(db: Db, ports: StudioFlowPorts) {
  const { runTransaction, storage } = ports;

  async function scheduleGrid(input: { csv?: string; file?: { name: string; data: Buffer } }): Promise<string[][]> {
    if (input.file) return readTabularGrid({ data: input.file.data, filename: input.file.name });
    if (typeof input.csv === "string") return parseCsvText(input.csv);
    throw invalid("SCHEDULE_CSV_EMPTY", "Choose a file or paste the sheet first.");
  }

  async function requireScheduleCommand(input: CommandContext & { projectId: string }): Promise<string> {
    const userId = requireCommand(input, P.scheduleManage);
    await requireProjectAccess(db, { grants: input.grants, actorId: userId, projectId: input.projectId, kind: "document" });
    return userId;
  }

  async function signedUrl(key: string | null): Promise<string | null> {
    if (!key) return null;
    try {
      return await storage.createSignedReadUrl(key, SIGNED_URL_SECONDS);
    } catch {
      return null;
    }
  }

  /**
   * Reused and template-seeded options share one stored object, so an object is
   * removed only after commit and only when no option or template row still
   * points at it. A failure leaves an orphan object, never a broken row.
   */
  async function removeUnreferenced(keys: readonly (string | null | undefined)[]) {
    await removeUnreferencedAssets(db, storage, keys);
  }

  function validateImage(file: ScheduleImageUpload): string {
    const extension = STUDIOFLOW_IMAGE_TYPES[file.contentType];
    if (!extension) throw invalid("SCHEDULE_IMAGE_TYPE", "Use a PNG, JPEG, or WebP image.");
    const bytes = file.body.byteLength;
    if (bytes === 0 || bytes > SCHEDULE_IMAGE_BYTES) throw invalid("SCHEDULE_IMAGE_SIZE", "Photos must be smaller than 3 MB after cropping.");
    if (!sniffImage(file.body, file.contentType)) throw invalid("SCHEDULE_IMAGE_TYPE", "This file is not a valid image.");
    return extension;
  }

  async function insertTemplateItem(tx: TxClient, input: { actor: CommandContext["actor"]; templateCategoryId?: string | null; section: ScheduleSection; category: { label: string; key: string }; snapshot: ReturnType<typeof cleanSnapshot>; qty: string | null; unit: string | null; location: string | null; cardFields?: string[] | null; metadata?: Record<string, unknown> }) {
    const { section, category } = input;
    const parent = input.templateCategoryId
      ? await tx.sfScheduleTemplateCategory.findUnique({ where: { id: input.templateCategoryId } })
      : await tx.sfScheduleTemplateCategory.findUnique({ where: { section_category_key: { section, category_key: category.key } } });
    if (input.templateCategoryId && !parent) throw notFound("schedule template");
    // Items always hang under a category row so settings can list and manage them.
    const categoryMaxSortOrder = await tx.sfScheduleTemplateCategory.aggregate({ where: { section }, _max: { sort_order: true } });
    const categoryRow = parent ?? await tx.sfScheduleTemplateCategory.create({
      data: { section, category: category.label, category_key: category.key, sort_order: (categoryMaxSortOrder._max.sort_order ?? 0) + 1 },
    });
    const itemMaxSortOrder = await tx.sfScheduleTemplateItem.aggregate({ where: { section, category_key: category.key }, _max: { sort_order: true } });
    const sortOrder = (itemMaxSortOrder._max.sort_order ?? -1) + 1;
    const item = await tx.sfScheduleTemplateItem.create({
      data: {
        template_category_id: categoryRow.id,
        section,
        category: category.label,
        category_key: category.key,
        ...templateItemData(input.snapshot),
        qty: input.qty,
        unit: input.unit,
        location: input.location,
        card_fields: input.cardFields ?? undefined,
        sort_order: sortOrder + 1,
      },
    });
    await writeAudit(ports, tx, { action: "studioflow.schedule.template-item-created", entityType: TEMPLATE_ENTITY, entityId: item.id, actor: input.actor, metadata: { section, category: category.label, ...input.metadata } });
    return item;
  }

  async function codeGroup(tx: TxClient, projectId: string, section: ScheduleSection, prefix: string) {
    return tx.sfScheduleEntry.findMany({
      where: { project_id: projectId, section, prefix },
      orderBy: [{ increment: "asc" }, { created_at: "asc" }],
      select: { id: true, category_key: true },
    });
  }

  /**
   * The full code-group order after reordering one category inside it. New categories never share a
   * prefix (`categoryPrefix`), but projects created before that rule may hold two categories under one
   * prefix; the screen reorders one category at a time, so its rows take back the code slots they held
   * and the other category's rows keep theirs. Null when the ids are not exactly one category's rows.
   */
  function mergeCategoryOrder(group: Array<{ id: string; category_key: string }>, orderedIds: readonly string[]): string[] | null {
    if (isPermutation(group.map((row) => row.id), orderedIds)) return [...orderedIds];
    const key = group.find((row) => row.id === orderedIds[0])?.category_key;
    if (key === undefined) return null;
    const own = group.filter((row) => row.category_key === key).map((row) => row.id);
    if (!isPermutation(own, orderedIds)) return null;
    let next = 0;
    return group.map((row) => (row.category_key === key ? orderedIds[next++] : row.id));
  }

  /**
   * Reorder a code group by handing its existing numbers out again in the new order. The set of numbers
   * never changes (owner, 2026-10-07: codes are stable): a gap left by a deleted row stays a gap, and only
   * the rows that actually moved get a different code.
   */
  async function reassignCodes(tx: TxClient, projectId: string, section: ScheduleSection, prefix: string, orderedIds: readonly string[]) {
    const rows = await tx.sfScheduleEntry.findMany({ where: { project_id: projectId, section, prefix }, select: { id: true, increment: true } });
    const slots = rows.map((row) => row.increment).sort((a, b) => a - b);
    const temporaryBase = (slots.at(-1) ?? 0) + 1_000;
    for (const [index, id] of orderedIds.entries()) {
      await tx.sfScheduleEntry.update({ where: { id }, data: { increment: temporaryBase + index } });
    }
    for (const [index, id] of orderedIds.entries()) {
      await tx.sfScheduleEntry.update({ where: { id }, data: { increment: slots[index], sort_order: slots[index] } });
    }
  }

  async function loadEntry(tx: TxClient, projectId: string, entryId: string, write: boolean) {
    const entry = await tx.sfScheduleEntry.findUnique({ where: { id: entryId } });
    if (!entry || entry.project_id !== projectId) throw scopeError();
    if (write) await loadWritableProject(tx, projectId);
    return entry;
  }

  async function loadOption(tx: TxClient, projectId: string, optionId: string, write: boolean) {
    const option = await tx.sfScheduleOption.findUnique({ where: { id: optionId }, include: { entry: true } });
    if (!option || option.entry.project_id !== projectId) throw scopeError();
    if (write) await loadWritableProject(tx, projectId);
    return option;
  }

  async function loadSampleRequest(tx: TxClient, projectId: string, requestId: string, write: boolean) {
    const request = await tx.sfScheduleSampleRequest.findUnique({ where: { id: requestId }, include: { option: { include: { entry: true } } } });
    if (!request || request.option.entry.project_id !== projectId) throw scopeError();
    if (write) await loadWritableProject(tx, projectId);
    return request;
  }

  async function nextLabel(tx: TxClient, entryId: string) {
    const rows = await tx.sfScheduleOption.findMany({ where: { entry_id: entryId }, select: { label: true } });
    return nextOptionLabel(rows.map((row) => row.label));
  }

  async function orderedOptions(tx: TxClient, entryId: string) {
    const rows = await tx.sfScheduleOption.findMany({ where: { entry_id: entryId } });
    return rows.sort((a, b) => compareOptionLabels(a.label, b.label) || a.created_at.getTime() - b.created_at.getTime());
  }

  /** Keep `active_index` pointing at the final option (legacy smart delete / approve). */
  async function syncActiveIndex(tx: TxClient, entryId: string) {
    const options = await orderedOptions(tx, entryId);
    const index = options.findIndex((row) => row.is_final);
    await tx.sfScheduleEntry.update({ where: { id: entryId }, data: { active_index: Math.max(index, 0) } });
  }

  /** No final any more: the row is undecided again, so no option reads as "Not used" (owner, 2026-10-07). */
  async function clearDecision(tx: TxClient, entryId: string) {
    await tx.sfScheduleOption.updateMany({ where: { entry_id: entryId }, data: { is_final: false, status: "DRAFT" } });
    await syncActiveIndex(tx, entryId);
  }

  /**
   * The one place a live schedule row or option is created (WO-SF-IDEAS-01). The schedule commands below and
   * StudioFlow callers that hold their own transaction (Ideas) share it, so codes, option labels and the
   * "a new option is never final" rule have a single home. Callers check access first (`requireAccess`) and
   * resolve the brand themselves; `metadata` is added to the audit row.
   */
  const writer = {
    requireAccess: requireScheduleCommand,

    async createEntry(tx: TxClient, input: { actor: CommandContext["actor"]; projectId: string; section: string; category: string; qty?: string | null; unit?: string | null; location?: string | null; snapshot?: SnapshotInput | null; metadata?: Record<string, unknown> }) {
      const section = sectionOf(input.section);
      const category = categoryOf(input.category);
      await loadWritableProject(tx, input.projectId);
      const entry = await createEntryWithOptionalOption(tx, {
        projectId: input.projectId,
        section,
        category: category.label,
        categoryKey: category.key,
        // A Material line is specified, not counted: qty and unit belong to Fixture only.
        qty: section === "FIXTURE" ? decimalText(input.qty) : null,
        unit: section === "FIXTURE" ? optionalText(input.unit, 40) : null,
        location: optionalText(input.location, 160),
        snapshot: input.snapshot ?? null,
      });
      const code = scheduleCode(entry.prefix, entry.increment);
      await writeAudit(ports, tx, { action: "studioflow.schedule.entry-created", entityType: ENTRY_ENTITY, entityId: entry.id, actor: input.actor, metadata: { projectId: input.projectId, code, ...input.metadata } });
      const option = input.snapshot ? await tx.sfScheduleOption.findFirst({ where: { entry_id: entry.id }, select: { id: true, label: true } }) : null;
      return { entryId: entry.id, code, optionId: option?.id ?? null, label: option?.label ?? null };
    },

    async createOption(tx: TxClient, input: { actor: CommandContext["actor"]; projectId: string; entryId: string; snapshot: SnapshotInput; metadata?: Record<string, unknown> }) {
      const snapshot = cleanSnapshot(input.snapshot);
      const entry = await loadEntry(tx, input.projectId, input.entryId, true);
      const label = await nextLabel(tx, entry.id);
      const option = await tx.sfScheduleOption.create({ data: { entry_id: entry.id, label, ...optionData(snapshot) } });
      await writeAudit(ports, tx, { action: "studioflow.schedule.option-created", entityType: OPTION_ENTITY, entityId: option.id, actor: input.actor, metadata: { projectId: input.projectId, entryId: entry.id, label, ...input.metadata } });
      return { entryId: entry.id, code: scheduleCode(entry.prefix, entry.increment), optionId: option.id, label };
    },
  };

  return {
    writer,

    canManage(grants: ReadContext["grants"]) {
      return hasPermission(grants, P.access) && hasPermission(grants, P.scheduleManage);
    },

    async listSchedule(input: ReadContext & { projectId: string; section?: string }) {
      requireRead(input.grants);
      const section = input.section ? sectionOf(input.section) : undefined;
      const [unordered, templateCategories] = await Promise.all([
        db.sfScheduleEntry.findMany({
          where: { project_id: input.projectId, ...(section ? { section } : {}) },
          orderBy: [{ section: "asc" }, { category_key: "asc" }, { increment: "asc" }],
          include: { options: { include: { sample_requests: { orderBy: { created_at: "desc" }, take: 1 } } } },
        }),
        db.sfScheduleTemplateCategory.findMany({ select: { section: true, category_key: true, sort_order: true } }),
      ]);
      // The number the next new row of each code group will get (the same rule as allocateIncrement).
      const usedByGroup = new Map<string, number[]>();
      for (const entry of unordered) {
        const key = `${entry.section}:${entry.prefix}`;
        usedByGroup.set(key, [...(usedByGroup.get(key) ?? []), entry.increment]);
      }
      const nextByGroup = new Map([...usedByGroup].map(([key, used]) => [key, lowestFreeNumber(used)] as const));
      // Categories follow the studio template order; categories the templates do not know come after, A to Z.
      const templateOrder = new Map(templateCategories.map((row) => [`${row.section}:${row.category_key}`, row.sort_order]));
      const rankOf = (entry: { section: string; category_key: string }) => templateOrder.get(`${entry.section}:${entry.category_key}`) ?? Number.MAX_SAFE_INTEGER;
      const sectionRank = (value: string) => (SCHEDULE_SECTIONS as readonly string[]).indexOf(value);
      const rows = [...unordered].sort((a, b) => sectionRank(a.section) - sectionRank(b.section) || rankOf(a) - rankOf(b) || a.category_key.localeCompare(b.category_key) || a.increment - b.increment);
      const keys = [...new Set(rows.flatMap((entry) => entry.options.map((option) => option.image_key)).filter((key): key is string => !!key))];
      const urls = new Map(await Promise.all(keys.map(async (key) => [key, await signedUrl(key)] as const)));
      return rows.map((entry) => ({
        id: entry.id,
        projectId: entry.project_id,
        section: entry.section,
        category: entry.category,
        prefix: entry.prefix,
        increment: entry.increment,
        code: scheduleCode(entry.prefix, entry.increment),
        nextNumber: nextByGroup.get(`${entry.section}:${entry.prefix}`) ?? 1,
        qty: entry.qty?.toString() ?? null,
        unit: entry.unit,
        location: entry.location,
        cardFields: cardFieldsOf(entry.card_fields),
        versionLocked: entry.version_locked,
        templateItemId: entry.template_item_id,
        options: [...entry.options].sort((a, b) => compareOptionLabels(a.label, b.label)).map((option) => ({
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
          imageUrl: option.image_key ? urls.get(option.image_key) ?? null : null,
          sampleRequest: option.sample_requests[0] ? {
            id: option.sample_requests[0].id,
            status: option.sample_requests[0].status,
            requestedFrom: option.sample_requests[0].requested_from,
            note: option.sample_requests[0].note,
            requestedByName: option.sample_requests[0].requested_by_name,
            requestedAt: option.sample_requests[0].requested_at,
            receivedByName: option.sample_requests[0].received_by_name,
            receivedAt: option.sample_requests[0].received_at,
            receivedNote: option.sample_requests[0].received_note,
          } : null,
        })),
      }));
    },

    async listPrefixes(input: ReadContext) {
      requireRead(input.grants);
      return db.sfSchedulePrefix.findMany({ orderBy: [{ section: "asc" }, { category_key: "asc" }] });
    },

    /**
     * Categories the studio already knows, per section, for the category pickers: template categories
     * in their settings order, then prefix-dictionary categories A to Z. `prefix` is the dictionary's when set.
     */
    async listCategoryChoices(input: ReadContext): Promise<Array<{ section: ScheduleSection; category: string; prefix: string | null }>> {
      requireRead(input.grants);
      const [templates, prefixes] = await Promise.all([
        db.sfScheduleTemplateCategory.findMany({ orderBy: [{ sort_order: "asc" }, { category_key: "asc" }], select: { section: true, category: true, category_key: true } }),
        db.sfSchedulePrefix.findMany({ orderBy: { category_key: "asc" }, select: { section: true, category: true, category_key: true, prefix: true } }),
      ]);
      const prefixOf = new Map(prefixes.map((row) => [`${row.section}:${row.category_key}`, row.prefix]));
      const seen = new Set<string>();
      const choices: Array<{ section: ScheduleSection; category: string; prefix: string | null }> = [];
      for (const row of [...templates, ...prefixes]) {
        const key = `${row.section}:${row.category_key}`;
        if (seen.has(key)) continue;
        seen.add(key);
        choices.push({ section: row.section, category: row.category, prefix: prefixOf.get(key) ?? null });
      }
      return choices;
    },

    async listBrandChoices(input: ReadContext & { search?: string }) {
      requireRead(input.grants);
      const brands = await ports.masterData.listBrandLibraryReads({ search: input.search });
      return brands.map((brand) => ({ id: brand.id, name: brand.name }));
    },

    async upsertPrefix(input: CommandContext & { section: string; category: string; prefix: string }) {
      requireCommand(input, P.settingsManage);
      const section = sectionOf(input.section);
      const category = categoryOf(input.category);
      const prefix = prefixOf(input.prefix, category.label);
      return runTransaction(async (tx) => {
        // One prefix names one category: a shared prefix would merge two categories into one code sequence.
        const clash = await tx.sfSchedulePrefix.findFirst({ where: { section, prefix, category_key: { not: category.key } }, select: { category: true } });
        if (clash) throw conflict("SCHEDULE_PREFIX_IN_USE", `${prefix} is already the prefix of ${clash.category}. Choose another prefix.`);
        const row = await tx.sfSchedulePrefix.upsert({
          where: { section_category_key: { section, category_key: category.key } },
          update: { category: category.label, prefix },
          create: { section, category: category.label, category_key: category.key, prefix },
        });
        await writeAudit(ports, tx, { action: "studioflow.schedule.prefix-upserted", entityType: TEMPLATE_ENTITY, entityId: row.id, actor: input.actor, metadata: { section, category: category.label, prefix } });
        return { prefixId: row.id };
      });
    },

    async listTemplates(input: ReadContext) {
      requireRead(input.grants);
      return db.sfScheduleTemplateCategory.findMany({
        orderBy: [{ section: "asc" }, { sort_order: "asc" }, { category_key: "asc" }],
        include: { items: { orderBy: [{ sort_order: "asc" }, { created_at: "asc" }] } },
      });
    },

    async createTemplateItem(input: CommandContext & TemplateItemInput & { templateCategoryId?: string | null; section: string; category: string }) {
      requireCommand(input, P.settingsManage);
      const section = sectionOf(input.section);
      const category = categoryOf(input.category);
      const brand = await brandSnapshot(ports, input.snapshot.brandId);
      const snapshot = cleanSnapshot({ ...input.snapshot, ...brand, imageKey: null }, { requireProductName: false });
      return runTransaction(async (tx) => {
        const item = await insertTemplateItem(tx, {
          actor: input.actor,
          templateCategoryId: input.templateCategoryId,
          section,
          category,
          snapshot,
          qty: decimalText(input.qty),
          unit: optionalText(input.unit, 40),
          location: optionalText(input.location, 160),
        });
        return { templateItemId: item.id };
      });
    },

    /** Edit a template item's snapshot and default quantities. Existing project rows keep their own snapshot. */
    async updateTemplateItem(input: CommandContext & TemplateItemInput & { templateItemId: string }) {
      requireCommand(input, P.settingsManage);
      const current = await db.sfScheduleTemplateItem.findUnique({ where: { id: input.templateItemId } });
      if (!current) throw notFound("schedule template");
      const brand = input.snapshot.brandId && input.snapshot.brandId === current.brand_id
        ? { brandId: current.brand_id, brandName: current.brand_name }
        : input.snapshot.brandId
          ? await brandSnapshot(ports, input.snapshot.brandId)
          : { brandId: null, brandName: input.snapshot.brandName ?? null };
      const snapshot = cleanSnapshot({ ...input.snapshot, ...brand, imageKey: current.image_key }, { requireProductName: false });
      const next = {
        ...templateItemData(snapshot),
        qty: decimalText(input.qty),
        unit: optionalText(input.unit, 40),
        location: optionalText(input.location, 160),
      };
      return runTransaction(async (tx) => {
        const item = await tx.sfScheduleTemplateItem.findUnique({ where: { id: input.templateItemId } });
        if (!item) throw notFound("schedule template");
        const before: Record<string, unknown> = { ...item, qty: item.qty?.toString() ?? null };
        const changes: Record<string, { from: unknown; to: unknown }> = {};
        for (const key of Object.keys(next) as (keyof typeof next)[]) {
          const from = before[key] ?? null;
          const to = next[key] ?? null;
          const same = key === "qty" && from !== null && to !== null ? Number(from) === Number(to) : from === to;
          if (!same) changes[key] = { from, to };
        }
        if (Object.keys(changes).length === 0) return { templateItemId: item.id };
        await tx.sfScheduleTemplateItem.update({ where: { id: item.id }, data: next });
        await writeAudit(ports, tx, { action: "studioflow.schedule.template-item-updated", entityType: TEMPLATE_ENTITY, entityId: item.id, actor: input.actor, changes, metadata: { section: item.section, category: item.category } });
        return { templateItemId: item.id };
      });
    },

    /**
     * Legacy "set as default template item": the row's final option (or its
     * only option) becomes a template item in the same section/category,
     * keeping its photo and the row's qty/unit/location.
     */
    async saveEntryAsTemplate(input: CommandContext & { projectId: string; entryId: string }) {
      requireCommand(input, P.settingsManage);
      return runTransaction(async (tx) => {
        const entry = await loadEntry(tx, input.projectId, input.entryId, false);
        const options = await orderedOptions(tx, entry.id);
        const source = options.find((row) => row.is_final) ?? (options.length === 1 ? options[0] : null);
        if (!source) throw invalid("SCHEDULE_TEMPLATE_SOURCE_REQUIRED", "Choose a final option before saving this item as a template.");
        const snapshot = cleanSnapshot({
          brandId: source.brand_id,
          brandName: source.brand_name,
          productName: source.product_name,
          color: source.color,
          pattern: source.pattern,
          finishing: source.finishing,
          dimension: source.dimension,
          notes: source.notes,
          extra: normalizeExtraFields(source.extra),
          imageKey: source.image_key,
        });
        const item = await insertTemplateItem(tx, {
          actor: input.actor,
          section: entry.section,
          category: { label: entry.category, key: entry.category_key },
          snapshot,
          qty: entry.qty?.toString() ?? null,
          unit: entry.unit,
          location: entry.location,
          cardFields: cardFieldsOf(entry.card_fields),
          metadata: { projectId: input.projectId, entryId: entry.id, optionId: source.id },
        });
        return { templateItemId: item.id };
      });
    },

    async setTemplateItemActive(input: CommandContext & { templateItemId: string; isActive: boolean }) {
      requireCommand(input, P.settingsManage);
      return runTransaction(async (tx) => {
        const item = await tx.sfScheduleTemplateItem.findUnique({ where: { id: input.templateItemId } });
        if (!item) throw notFound("schedule template");
        if (item.is_active === input.isActive) return { templateItemId: item.id };
        await tx.sfScheduleTemplateItem.update({ where: { id: item.id }, data: { is_active: input.isActive } });
        await writeAudit(ports, tx, { action: "studioflow.schedule.template-item-updated", entityType: TEMPLATE_ENTITY, entityId: item.id, actor: input.actor, changes: { isActive: { from: item.is_active, to: input.isActive } } });
        return { templateItemId: item.id };
      });
    },

    /** Project rows created from the item keep their snapshot; only the link is cleared (FK SetNull). */
    async deleteTemplateItem(input: CommandContext & { templateItemId: string }) {
      requireCommand(input, P.settingsManage);
      const result = await runTransaction(async (tx) => {
        const item = await tx.sfScheduleTemplateItem.findUnique({ where: { id: input.templateItemId }, include: { _count: { select: { entries: true } } } });
        if (!item) throw notFound("schedule template");
        await tx.sfScheduleTemplateItem.delete({ where: { id: item.id } });
        await writeAudit(ports, tx, { action: "studioflow.schedule.template-item-deleted", entityType: TEMPLATE_ENTITY, entityId: item.id, actor: input.actor, metadata: { section: item.section, category: item.category, productName: item.product_name, detachedRows: item._count.entries } });
        return { templateItemId: item.id, imageKey: item.image_key };
      });
      await removeUnreferenced([result.imageKey]);
      return { templateItemId: result.templateItemId };
    },

    async deletePrefix(input: CommandContext & { prefixId: string }) {
      requireCommand(input, P.settingsManage);
      return runTransaction(async (tx) => {
        const row = await tx.sfSchedulePrefix.findUnique({ where: { id: input.prefixId } });
        if (!row) throw notFound("schedule prefix");
        await tx.sfSchedulePrefix.delete({ where: { id: row.id } });
        await writeAudit(ports, tx, { action: "studioflow.schedule.prefix-deleted", entityType: TEMPLATE_ENTITY, entityId: row.id, actor: input.actor, metadata: { section: row.section, category: row.category, prefix: row.prefix } });
        return { prefixId: row.id };
      });
    },

    async applyTemplates(input: CommandContext & { projectId: string }) {
      await requireScheduleCommand(input);
      return runTransaction(async (tx) => {
        await loadWritableProject(tx, input.projectId);
        const created = await seedScheduleFromTemplates(tx, input.projectId);
        if (created > 0) await writeAudit(ports, tx, { action: "studioflow.schedule.templates-applied", entityType: "project", entityId: input.projectId, actor: input.actor, metadata: { projectId: input.projectId, created } });
        return { created };
      });
    },

    async createEntry(input: CommandContext & { projectId: string; section: string; category: string; qty?: string | null; unit?: string | null; location?: string | null; snapshot?: SnapshotInput | null }) {
      await requireScheduleCommand(input);
      sectionOf(input.section);
      categoryOf(input.category);
      const brand = input.snapshot ? await brandSnapshot(ports, input.snapshot.brandId) : { brandId: null, brandName: null };
      return runTransaction(async (tx) => {
        const created = await writer.createEntry(tx, { ...input, snapshot: input.snapshot ? { ...input.snapshot, ...brand, imageKey: null } : null });
        return { entryId: created.entryId };
      });
    },

    async updateEntry(input: CommandContext & { projectId: string; entryId: string; qty?: string | null; unit?: string | null; location?: string | null }) {
      await requireScheduleCommand(input);
      return runTransaction(async (tx) => {
        const entry = await loadEntry(tx, input.projectId, input.entryId, true);
        // Only the fields that were sent change; omitted fields keep their value.
        const data: { qty?: string | null; unit?: string | null; location?: string | null } = {};
        // Qty and unit exist for Fixture only; a Material line ignores them.
        if (entry.section !== "MATERIAL" && input.qty !== undefined) data.qty = decimalText(input.qty);
        if (entry.section !== "MATERIAL" && input.unit !== undefined) data.unit = optionalText(input.unit, 40);
        if (input.location !== undefined) data.location = optionalText(input.location, 160);
        const changes: Record<string, { from: unknown; to: unknown }> = {};
        const before = { qty: entry.qty?.toString() ?? null, unit: entry.unit, location: entry.location };
        const same = (key: keyof typeof data, a: string | null, b: string | null) =>
          key === "qty" && a !== null && b !== null ? Number(a) === Number(b) : a === b;
        for (const key of Object.keys(data) as (keyof typeof data)[]) {
          const to = data[key] ?? null;
          if (!same(key, before[key], to)) changes[key] = { from: before[key], to };
        }
        if (Object.keys(changes).length === 0) return { entryId: entry.id };
        await tx.sfScheduleEntry.update({ where: { id: entry.id }, data });
        await writeAudit(ports, tx, { action: "studioflow.schedule.entry-updated", entityType: ENTRY_ENTITY, entityId: entry.id, actor: input.actor, changes, metadata: { projectId: input.projectId, code: scheduleCode(entry.prefix, entry.increment) } });
        return { entryId: entry.id };
      });
    },

    /**
     * Board-card field choice. `fields: null` clears the override so the card
     * falls back to SCHEDULE_DEFAULT_CARD_FIELDS; an array is an explicit
     * choice and may be empty (photo, code and title only).
     */
    async updateEntryCardFields(input: CommandContext & { projectId: string; entryId: string; fields: string[] | null }) {
      await requireScheduleCommand(input);
      const fields = input.fields === null
        ? null
        : orderCardFields([...new Set(input.fields)].filter((key) => isScheduleCardFieldKey(key)));
      return runTransaction(async (tx) => {
        const entry = await loadEntry(tx, input.projectId, input.entryId, true);
        const before = cardFieldsOf(entry.card_fields);
        if (JSON.stringify(before) === JSON.stringify(fields)) return { entryId: entry.id };
        await tx.sfScheduleEntry.update({ where: { id: entry.id }, data: { card_fields: fields ?? Prisma.DbNull } });
        await writeAudit(ports, tx, { action: "studioflow.schedule.entry-card-fields-updated", entityType: ENTRY_ENTITY, entityId: entry.id, actor: input.actor, changes: { cardFields: { from: before, to: fields } }, metadata: { projectId: input.projectId, code: scheduleCode(entry.prefix, entry.increment), usesDefault: fields === null } });
        return { entryId: entry.id };
      });
    },

    async deleteEntry(input: CommandContext & { projectId: string; entryId: string }) {
      await requireScheduleCommand(input);
      const result = await runTransaction(async (tx) => {
        const entry = await loadEntry(tx, input.projectId, input.entryId, true);
        const images = await tx.sfScheduleOption.findMany({ where: { entry_id: entry.id }, select: { image_key: true } });
        // Later codes keep their number: the deleted code is left empty, never shifted into.
        await tx.sfScheduleEntry.delete({ where: { id: entry.id } });
        await writeAudit(ports, tx, { action: "studioflow.schedule.entry-deleted", entityType: ENTRY_ENTITY, entityId: entry.id, actor: input.actor, metadata: { projectId: input.projectId, code: scheduleCode(entry.prefix, entry.increment) } });
        return { entryId: entry.id, imageKeys: images.map((row) => row.image_key) };
      });
      await removeUnreferenced(result.imageKeys);
      return { entryId: result.entryId };
    },

    async reorderEntries(input: CommandContext & { projectId: string; section: string; prefix: string; orderedIds: string[] }) {
      await requireScheduleCommand(input);
      const section = sectionOf(input.section);
      const prefix = prefixOf(input.prefix, "Item");
      return runTransaction(async (tx) => {
        await loadWritableProject(tx, input.projectId);
        const merged = mergeCategoryOrder(await codeGroup(tx, input.projectId, section, prefix), input.orderedIds);
        if (!merged) throw invalid("SCHEDULE_REORDER_INVALID", "The schedule changed. Refresh and try again.");
        await reassignCodes(tx, input.projectId, section, prefix, merged);
        await writeAudit(ports, tx, { action: "studioflow.schedule.entries-reordered", entityType: "project", entityId: input.projectId, actor: input.actor, metadata: { section, prefix, count: input.orderedIds.length } });
        return { count: input.orderedIds.length };
      });
    },

    /** Move one row up/down inside its code group; codes stay gapless. */
    async moveEntry(input: CommandContext & { projectId: string; entryId: string; direction: "up" | "down" }) {
      await requireScheduleCommand(input);
      return runTransaction(async (tx) => {
        const entry = await loadEntry(tx, input.projectId, input.entryId, true);
        const group = await codeGroup(tx, input.projectId, entry.section, entry.prefix);
        // Up/down moves within the row's own category, even where an older project shares the prefix.
        const own = group.filter((row) => row.category_key === entry.category_key).map((row) => row.id);
        const index = own.indexOf(entry.id);
        const target = input.direction === "up" ? index - 1 : index + 1;
        if (index < 0 || target < 0 || target >= own.length) return { entryId: entry.id };
        [own[index], own[target]] = [own[target], own[index]];
        const ids = mergeCategoryOrder(group, own)!;
        await reassignCodes(tx, input.projectId, entry.section, entry.prefix, ids);
        await writeAudit(ports, tx, { action: "studioflow.schedule.entries-reordered", entityType: "project", entityId: input.projectId, actor: input.actor, metadata: { projectId: input.projectId, section: entry.section, prefix: entry.prefix, count: ids.length } });
        return { entryId: entry.id };
      });
    },

    /** Legacy "move to category": the row takes the target category's prefix and the next free number there. */
    async moveEntryToCategory(input: CommandContext & { projectId: string; entryId: string; category: string }) {
      await requireScheduleCommand(input);
      const category = categoryOf(input.category);
      return runTransaction(async (tx) => {
        const entry = await loadEntry(tx, input.projectId, input.entryId, true);
        if (entry.category_key === category.key) return { entryId: entry.id };
        // Reuse the spelling already used for that category (project rows first, then the prefix dictionary).
        const known = await tx.sfSchedulePrefix.findUnique({ where: { section_category_key: { section: entry.section, category_key: category.key } }, select: { category: true } });
        if (known) category.label = known.category;
        // The same rule as adding a row: the project's spelling and prefix for that category, else a prefix no
        // other category of the project numbers under.
        const target = await categoryPrefix(tx, { projectId: input.projectId, section: entry.section, category: category.label, categoryKey: category.key, excludeEntryId: entry.id });
        category.label = target.label;
        const prefix = target.prefix;
        const fromCode = scheduleCode(entry.prefix, entry.increment);
        if (prefix === entry.prefix) {
          await tx.sfScheduleEntry.update({ where: { id: entry.id }, data: { category: category.label, category_key: category.key } });
        } else {
          const increment = await allocateIncrement(tx, { projectId: input.projectId, section: entry.section, prefix });
          // The old code is left empty in its group; nothing there shifts.
          await tx.sfScheduleEntry.update({ where: { id: entry.id }, data: { category: category.label, category_key: category.key, prefix, increment, sort_order: increment } });
        }
        const moved = await tx.sfScheduleEntry.findUniqueOrThrow({ where: { id: entry.id } });
        await writeAudit(ports, tx, { action: "studioflow.schedule.entry-moved", entityType: ENTRY_ENTITY, entityId: entry.id, actor: input.actor, changes: { category: { from: entry.category, to: category.label }, code: { from: fromCode, to: scheduleCode(moved.prefix, moved.increment) } }, metadata: { projectId: input.projectId } });
        return { entryId: entry.id, code: scheduleCode(moved.prefix, moved.increment) };
      });
    },

    /** Edit an option's snapshot (legacy inspector `updateScheduleOptionSnapshot`). */
    async updateOption(input: CommandContext & { projectId: string; optionId: string; snapshot: SnapshotInput }) {
      await requireScheduleCommand(input);
      return runTransaction(async (tx) => {
        const option = await loadOption(tx, input.projectId, input.optionId, true);
        // Keep the stored brand when the same Master Data brand is sent again (it may have been archived since).
        const brand = input.snapshot.brandId && input.snapshot.brandId === option.brand_id
          ? { brandId: option.brand_id, brandName: option.brand_name }
          : input.snapshot.brandId
            ? await brandSnapshot(ports, input.snapshot.brandId)
            : { brandId: null, brandName: input.snapshot.brandName ?? null };
        const snapshot = cleanSnapshot({ ...input.snapshot, ...brand, imageKey: option.image_key });
        const next = optionData(snapshot);
        const changes: Record<string, { from: unknown; to: unknown }> = {};
        for (const key of Object.keys(next) as (keyof typeof next)[]) {
          if (key === "search_key") continue;
          if ((option[key] ?? null) !== (next[key] ?? null)) changes[key] = { from: option[key] ?? null, to: next[key] ?? null };
        }
        if (Object.keys(changes).length === 0) return { optionId: option.id };
        await tx.sfScheduleOption.update({ where: { id: option.id }, data: next });
        await writeAudit(ports, tx, { action: "studioflow.schedule.option-updated", entityType: OPTION_ENTITY, entityId: option.id, actor: input.actor, changes, metadata: { projectId: input.projectId, entryId: option.entry_id, label: option.label } });
        return { optionId: option.id };
      });
    },

    async createOption(input: CommandContext & { projectId: string; entryId: string; snapshot: SnapshotInput }) {
      await requireScheduleCommand(input);
      const brand = await brandSnapshot(ports, input.snapshot.brandId);
      const snapshot = { ...input.snapshot, ...brand, imageKey: null };
      cleanSnapshot(snapshot);
      return runTransaction(async (tx) => {
        const created = await writer.createOption(tx, { actor: input.actor, projectId: input.projectId, entryId: input.entryId, snapshot });
        return { optionId: created.optionId };
      });
    },

    async markFinal(input: CommandContext & { projectId: string; optionId: string }) {
      await requireScheduleCommand(input);
      return runTransaction(async (tx) => {
        const option = await loadOption(tx, input.projectId, input.optionId, true);
        await tx.sfScheduleOption.updateMany({ where: { entry_id: option.entry_id }, data: { is_final: false, status: "NOT_USED" } });
        await tx.sfScheduleOption.update({ where: { id: option.id }, data: { is_final: true, status: "APPROVED" } });
        await syncActiveIndex(tx, option.entry_id);
        await writeAudit(ports, tx, { action: "studioflow.schedule.option-finalized", entityType: OPTION_ENTITY, entityId: option.id, actor: input.actor, metadata: { projectId: input.projectId, entryId: option.entry_id } });
        return { optionId: option.id };
      });
    },

    /** Undo a decision: the client changed their mind and the row needs a decision again. */
    async unmarkFinal(input: CommandContext & { projectId: string; optionId: string }) {
      await requireScheduleCommand(input);
      return runTransaction(async (tx) => {
        const option = await loadOption(tx, input.projectId, input.optionId, true);
        if (!option.is_final) return { optionId: option.id };
        await clearDecision(tx, option.entry_id);
        await writeAudit(ports, tx, { action: "studioflow.schedule.option-unfinalized", entityType: OPTION_ENTITY, entityId: option.id, actor: input.actor, metadata: { projectId: input.projectId, entryId: option.entry_id } });
        return { optionId: option.id };
      });
    },

    async deleteOption(input: CommandContext & { projectId: string; optionId: string }) {
      await requireScheduleCommand(input);
      const result = await runTransaction(async (tx) => {
        const option = await loadOption(tx, input.projectId, input.optionId, true);
        const wasFinal = option.is_final;
        await tx.sfScheduleOption.delete({ where: { id: option.id } });
        // Deleting the final option never picks a replacement the client did not choose.
        if (wasFinal) await clearDecision(tx, option.entry_id);
        else await syncActiveIndex(tx, option.entry_id);
        await writeAudit(ports, tx, { action: "studioflow.schedule.option-deleted", entityType: OPTION_ENTITY, entityId: option.id, actor: input.actor, metadata: { projectId: input.projectId, entryId: option.entry_id, wasFinal } });
        return { optionId: option.id, imageKey: option.image_key };
      });
      await removeUnreferenced([result.imageKey]);
      return { optionId: result.optionId };
    },

    /** Put the object first, then record it; the replaced object is released after commit. */
    async setOptionImage(input: CommandContext & { projectId: string; optionId: string; file: ScheduleImageUpload }) {
      await requireScheduleCommand(input);
      const extension = validateImage(input.file);
      // Scope check before touching storage.
      const precheck = await db.sfScheduleOption.findUnique({ where: { id: input.optionId }, include: { entry: { select: { project_id: true } } } });
      if (!precheck || precheck.entry.project_id !== input.projectId) throw scopeError();

      const key = createPrivateObjectKey(`studioflow/schedule/${input.projectId}`, extension);
      await storage.put({ key, contentType: input.file.contentType, bytes: input.file.body.byteLength, body: input.file.body });
      try {
        const result = await runTransaction(async (tx) => {
          const option = await loadOption(tx, input.projectId, input.optionId, true);
          await tx.sfScheduleOption.update({ where: { id: option.id }, data: { image_key: key } });
          await writeAudit(ports, tx, {
            action: option.image_key ? "studioflow.schedule.option-image-replaced" : "studioflow.schedule.option-image-added",
            entityType: OPTION_ENTITY, entityId: option.id, actor: input.actor,
            metadata: { projectId: input.projectId, entryId: option.entry_id, label: option.label, bytes: input.file.body.byteLength },
          });
          return { optionId: option.id, previousKey: option.image_key };
        });
        await removeUnreferenced([result.previousKey]);
        return { optionId: result.optionId };
      } catch (error) {
        await discardObjects(db, storage, [key]);
        throw error;
      }
    },

    async removeOptionImage(input: CommandContext & { projectId: string; optionId: string }) {
      await requireScheduleCommand(input);
      const result = await runTransaction(async (tx) => {
        const option = await loadOption(tx, input.projectId, input.optionId, true);
        if (!option.image_key) return { optionId: option.id, previousKey: null };
        await tx.sfScheduleOption.update({ where: { id: option.id }, data: { image_key: null } });
        await writeAudit(ports, tx, { action: "studioflow.schedule.option-image-removed", entityType: OPTION_ENTITY, entityId: option.id, actor: input.actor, metadata: { projectId: input.projectId, entryId: option.entry_id, label: option.label } });
        return { optionId: option.id, previousKey: option.image_key };
      });
      await removeUnreferenced([result.previousKey]);
      return { optionId: result.optionId };
    },

    /** A childless-of-vendor-data option can have at most one open (REQUESTED) sample request at a time. */
    async requestSample(input: CommandContext & { projectId: string; optionId: string; requestedFrom?: string | null; note?: string | null }) {
      const userId = await requireScheduleCommand(input);
      // Optional: a designer often does not know which supplier to ask. Blank means Master Data finds one.
      const requestedFrom = optionalText(input.requestedFrom, 200) ?? "";
      const note = optionalText(input.note, 500);
      return runTransaction(async (tx) => {
        const option = await loadOption(tx, input.projectId, input.optionId, true);
        const pending = await tx.sfScheduleSampleRequest.findFirst({ where: { option_id: option.id, status: "REQUESTED" } });
        if (pending) throw conflict("SAMPLE_ALREADY_REQUESTED", "A sample is already requested for this option.");
        const request = await tx.sfScheduleSampleRequest.create({
          data: { option_id: option.id, requested_from: requestedFrom, note, requested_by_id: userId, requested_by_name: input.actor.label },
        });
        const project = await tx.sfProject.findUnique({ where: { id: input.projectId }, select: { name: true } });
        await ports.sampleRequestNotifier?.requested(tx, {
          requestId: request.id,
          projectId: input.projectId,
          projectName: project?.name ?? "",
          productName: option.product_name,
          requestedFrom,
          requestedById: userId,
          requestedByName: input.actor.label,
        });
        await writeAudit(ports, tx, { action: "studioflow.schedule.sample-requested", entityType: OPTION_ENTITY, entityId: option.id, actor: input.actor, metadata: { projectId: input.projectId, entryId: option.entry_id, label: option.label, requestedFrom } });
        return { requestId: request.id };
      });
    },

    /** Marks the sample received; does not touch Master Data — a Master Data user enters the SKU/price themselves. */
    async receiveSample(input: CommandContext & { projectId: string; requestId: string; note?: string | null }) {
      const userId = await requireScheduleCommand(input);
      const receivedNote = optionalText(input.note, 500);
      return runTransaction(async (tx) => {
        const request = await loadSampleRequest(tx, input.projectId, input.requestId, true);
        if (request.status !== "REQUESTED") throw conflict("SAMPLE_NOT_PENDING", "This sample request was already resolved.");
        await tx.sfScheduleSampleRequest.update({
          where: { id: request.id },
          data: { status: "RECEIVED", received_by_id: userId, received_by_name: input.actor.label, received_at: nowOf(ports), received_note: receivedNote },
        });
        await writeAudit(ports, tx, { action: "studioflow.schedule.sample-received", entityType: OPTION_ENTITY, entityId: request.option_id, actor: input.actor, metadata: { projectId: input.projectId, entryId: request.option.entry_id, label: request.option.label } });
        return { requestId: request.id };
      });
    },

    /** Undoes a mistaken request before anyone acts on it — a hard delete, not a status. Once RECEIVED the
     *  physical sample is a real-world fact and cannot be cancelled here. */
    async cancelSample(input: CommandContext & { projectId: string; requestId: string }) {
      await requireScheduleCommand(input);
      return runTransaction(async (tx) => {
        const request = await loadSampleRequest(tx, input.projectId, input.requestId, true);
        if (request.status !== "REQUESTED") throw conflict("SAMPLE_NOT_PENDING", "This sample request was already resolved.");
        await tx.sfScheduleSampleRequest.delete({ where: { id: request.id } });
        await writeAudit(ports, tx, { action: "studioflow.schedule.sample-request-cancelled", entityType: OPTION_ENTITY, entityId: request.option_id, actor: input.actor, metadata: { projectId: input.projectId, entryId: request.option.entry_id, label: request.option.label, requestedFrom: request.requested_from } });
        return { requestId: request.id };
      });
    },

    async searchReusableOptions(input: ReadContext & { projectId: string; query: string; section?: string; limit?: number }) {
      requireRead(input.grants);
      const query = input.query.trim().toLocaleLowerCase("id-ID");
      if (query.length < 2) return [];
      const rows = await db.sfScheduleOption.findMany({
        where: {
          search_key: { contains: query },
          entry: { project_id: { not: input.projectId }, ...(input.section ? { section: sectionOf(input.section) } : {}) },
        },
        include: { entry: { select: { project_id: true, section: true, category: true, project: { select: { name: true } } } } },
        orderBy: { created_at: "desc" },
        take: Math.min(Math.max(input.limit ?? 20, 1), 80),
      });
      return rows.map((row) => ({
        optionId: row.id,
        sourceProjectId: row.entry.project_id,
        sourceProjectName: row.entry.project.name,
        isFinal: row.is_final,
        section: row.entry.section,
        category: row.entry.category,
        brandName: row.brand_name,
        productName: row.product_name,
        color: row.color,
        pattern: row.pattern,
        finishing: row.finishing,
        dimension: row.dimension,
        extra: normalizeExtraFields(row.extra),
      }));
    },

    async copyReusableOption(input: CommandContext & { projectId: string; entryId: string; sourceOptionId: string }) {
      await requireScheduleCommand(input);
      return runTransaction(async (tx) => {
        const entry = await loadEntry(tx, input.projectId, input.entryId, true);
        const source = await tx.sfScheduleOption.findUnique({ where: { id: input.sourceOptionId }, include: { entry: true } });
        if (!source || source.entry.project_id === input.projectId) throw notFound("reusable option");
        const label = await nextLabel(tx, entry.id);
        const option = await tx.sfScheduleOption.create({
          data: {
            entry_id: entry.id,
            label,
            brand_id: source.brand_id,
            brand_name: source.brand_name,
            product_name: source.product_name,
            color: source.color,
            pattern: source.pattern,
            finishing: source.finishing,
            dimension: source.dimension,
            notes: source.notes,
            extra: normalizeExtraFields(source.extra),
            image_key: source.image_key,
            search_key: source.search_key,
          },
        });
        await writeAudit(ports, tx, { action: "studioflow.schedule.option-reused", entityType: OPTION_ENTITY, entityId: option.id, actor: input.actor, metadata: { projectId: input.projectId, sourceOptionId: source.id } });
        return { optionId: option.id };
      });
    },

    /** A blank sheet in the plain `category, brand, product, …` layout that the import reads. */
    async importTemplate(input: CommandContext & { projectId: string; format?: ImportFormat }): Promise<FileResult> {
      await requireScheduleCommand(input);
      return buildImportTemplate({ format: input.format ?? "xlsx", filename: "schedule-import-template", sheetName: "Schedule", columns: SIMPLE_IMPORT_COLUMNS, includeExample: true, notes: ["Rows are added as new schedule items. The Google Sheets export (with a Code column) also imports; it updates items that share a code."] });
    },

    /**
     * CSV import. The legacy Google Sheets export (header row starting with
     * `code`, columns `product category` / `ex` / `type` …) is the primary
     * format: a code that already exists updates the brand, type and notes of
     * the option the card shows (its other specs, photo and decision stay) and
     * the quantities; a new code adds a row under that same code when it is
     * free, so importing the sheet again finds the same rows. A simple
     * `category,brand,product,…` sheet is accepted as a fallback.
     */
    async importCsv(input: CommandContext & { projectId: string; section: string; csv?: string; file?: { name: string; data: Buffer } }) {
      await requireScheduleCommand(input);
      const section = sectionOf(input.section);
      const grid = await scheduleGrid(input);
      const sheet = parseLegacyScheduleSheet(grid, section);
      if (sheet) {
        if (sheet.length === 0) throw invalid("SCHEDULE_CSV_EMPTY", "The sheet has a header but no rows.");
        return runTransaction(async (tx) => {
          await loadWritableProject(tx, input.projectId);
          let created = 0;
          let updated = 0;
          for (const row of sheet) {
            const code = parseScheduleCode(row.code);
            const notes = [
              row.initialsType ? `Initials type: ${row.initialsType}` : null,
              row.contact ? `Contact: ${row.contact}` : null,
              row.imageUrl ? `Image: ${row.imageUrl}` : null,
            ].filter(Boolean).join("\n") || null;
            const snapshot: SnapshotInput = { brandName: row.brand, productName: row.product || "Imported", notes };
            // Qty and unit belong to Fixture only, as everywhere else.
            const quantities = {
              ...(section === "FIXTURE" && row.qty !== null ? { qty: decimalText(row.qty.replace(",", ".")) } : {}),
              ...(section === "FIXTURE" && row.unit !== null ? { unit: optionalText(row.unit, 40) } : {}),
              ...(row.location !== null ? { location: optionalText(row.location, 160) } : {}),
            };
            const existing = code
              ? await tx.sfScheduleEntry.findUnique({ where: { project_id_section_prefix_increment: { project_id: input.projectId, section, prefix: code.prefix, increment: code.increment } } })
              : null;
            if (existing) {
              const options = await orderedOptions(tx, existing.id);
              const target = options.find((option) => option.is_final) ?? options[0];
              if (target) {
                // The sheet only carries brand, type and notes: those are updated, everything the sheet has no
                // column for (colour, pattern, finishing, size, extra specs, photo) is kept, and so is the decision.
                const brandChanged = row.brand !== null && row.brand !== target.brand_name;
                const merged = cleanSnapshot({
                  brandId: brandChanged ? null : target.brand_id,
                  brandName: row.brand ?? target.brand_name,
                  productName: row.product ?? target.product_name,
                  color: target.color,
                  pattern: target.pattern,
                  finishing: target.finishing,
                  dimension: target.dimension,
                  extra: normalizeExtraFields(target.extra),
                  notes: notes ?? target.notes,
                  imageKey: target.image_key,
                });
                await tx.sfScheduleOption.update({ where: { id: target.id }, data: optionData(merged) });
              } else {
                await tx.sfScheduleOption.create({ data: { entry_id: existing.id, label: "A", ...optionData(cleanSnapshot(snapshot)) } });
              }
              if (Object.keys(quantities).length > 0) await tx.sfScheduleEntry.update({ where: { id: existing.id }, data: quantities });
              updated += 1;
              continue;
            }
            let categoryLabel = row.category?.trim() || null;
            if (categoryLabel && categoryLabel.toLowerCase() === "general") {
              throw invalid("SCHEDULE_CSV_CATEGORY", `Row ${row.code}: "General" is not a valid category.`);
            }
            if (!categoryLabel && code) {
              const matches = await tx.sfSchedulePrefix.findMany({ where: { section, prefix: code.prefix } });
              if (matches.length > 1) throw invalid("SCHEDULE_CSV_CATEGORY", `Row ${row.code}: prefix ${code.prefix} matches several categories (${matches.map((m) => m.category).join(", ")}).`);
              categoryLabel = matches[0]?.category ?? null;
            }
            if (!categoryLabel) throw invalid("SCHEDULE_CSV_CATEGORY", `Row ${row.code}: the category cannot be determined. Add a product category or a prefix in Studio Settings.`);
            const category = categoryOf(categoryLabel);
            // A category seen for the first time keeps the sheet's prefix, so imported codes stay recognisable.
            if (code) {
              const known = await tx.sfSchedulePrefix.findUnique({ where: { section_category_key: { section, category_key: category.key } } });
              const clash = known ? null : await tx.sfSchedulePrefix.findFirst({ where: { section, prefix: code.prefix }, select: { id: true } });
              if (!known && !clash) await tx.sfSchedulePrefix.create({ data: { section, category: category.label, category_key: category.key, prefix: code.prefix } });
            }
            await createEntryWithOptionalOption(tx, {
              projectId: input.projectId,
              section,
              category: category.label,
              categoryKey: category.key,
              qty: quantities.qty ?? null,
              unit: quantities.unit ?? null,
              location: quantities.location ?? null,
              snapshot,
              // Keep the sheet's own code, so the next import of the same sheet finds this row again.
              code,
            });
            created += 1;
          }
          await writeAudit(ports, tx, { action: "studioflow.schedule.csv-imported", entityType: "project", entityId: input.projectId, actor: input.actor, metadata: { projectId: input.projectId, section, format: "gsheets", created, updated } });
          return { created, updated };
        });
      }

      const rows = parseLegacyScheduleCsv(grid);
      if (rows.length === 0) throw invalid("SCHEDULE_CSV_EMPTY", "The CSV has no rows.");
      return runTransaction(async (tx) => {
        await loadWritableProject(tx, input.projectId);
        let created = 0;
        for (const row of rows) {
          const category = categoryOf(row.category || row.schedule_category || row.kategori || "Imported");
          const brandName = row.brand || row.catalog_brand || null;
          const productName = row.product || row.product_name || row.catalog_product_name || row.item || "";
          if (!productName.trim()) continue;
          await createEntryWithOptionalOption(tx, {
            projectId: input.projectId,
            section,
            category: category.label,
            categoryKey: category.key,
            qty: section === "FIXTURE" ? decimalText(row.qty || row.quantity || null) : null,
            unit: section === "FIXTURE" ? optionalText(row.unit || null, 40) : null,
            location: optionalText(row.location || row.area || null, 160),
            snapshot: {
              brandName,
              // Legacy "Item No" is the same designation as Type, so an
              // article code column is appended to it rather than stored twice.
              productName: [productName, row.sku || row.catalog_sku || ""].map((part) => part.trim()).filter(Boolean).join(" - "),
              color: row.color || row.catalog_color || null,
              pattern: row.pattern || row.motif || row.catalog_motif || null,
              finishing: row.finishing || row.catalog_finishing || null,
              dimension: row.dimension || row.dimensi || null,
              notes: row.notes || row.note || null,
            },
          });
          created += 1;
        }
        if (created === 0) throw invalid("SCHEDULE_CSV_EMPTY", "No usable schedule rows were found. Use the Google Sheets export (with a Code column) or category, brand, product columns.");
        await writeAudit(ports, tx, { action: "studioflow.schedule.csv-imported", entityType: "project", entityId: input.projectId, actor: input.actor, metadata: { projectId: input.projectId, section, format: "simple", created } });
        return { created, updated: 0 };
      });
    },
  };
}

export type ScheduleService = ReturnType<typeof createScheduleService>;
