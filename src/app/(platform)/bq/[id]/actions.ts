"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePrincipalGrants } from "@platform/core/auth";
import { runSafeAction, type ActionResult } from "@platform/core/actions";
import { validationError } from "@platform/core/validation";
import { AppError } from "@platform/core/errors";
import { addDecimals, isDecimalString, toDecimalString } from "@platform/utilities/decimal";
import { bqPublicRead, bqService, masterDataRead } from "@/apps/bq/runtime";
import { BQ_PRICE_MODES, QUOTATION_TERMS_MAX, type BqProjectDetail } from "@/apps/bq/public";
import {
  snapshotCustom,
  snapshotFromLibrary,
  type LineItemCreateInput,
} from "@/apps/bq/lib/snapshot";
import { snapshotFromMasterData } from "@/apps/bq/lib/master-data-source";

/**
 * Project structure actions.
 *
 * Every mutation returns the recomputed project. bq-contract §2 forbids
 * calculating in the client and §13.1 requires totals to move without a reload;
 * returning the server's own recomputation satisfies both, where a client-side
 * total would satisfy only the second.
 */

const Id = z.string().cuid();

/* Decimal shapes are app-owned policy, not a shared scalar: BQ decides that a
   quantity may be zero and a coefficient may not. */
function decimal(value: string, field: string): string {
  const parsed = value.trim();
  if (!isDecimalString(parsed) || parsed.startsWith("-")) {
    throw new AppError("VALIDATION", "bq.decimal.invalid", `${field} must be a canonical non-negative decimal number`);
  }
  return parsed;
}

function positiveDecimal(value: string, field: string): string {
  const parsed = decimal(value, field);
  // bq-contract §5/K-08: koefisien is strictly greater than zero. A zero
  // coefficient silently prices the whole line at nothing.
  if (!/[1-9]/.test(parsed)) {
    throw new AppError("VALIDATION", "bq.decimal.not-positive", `${field} must be greater than zero`);
  }
  return parsed;
}

function percent(value: string, field: string): string {
  if (!/^-?\d+(\.\d+)?$/.test(value.trim())) {
    throw new AppError("VALIDATION", "bq.percent.invalid", `${field} must be a decimal percentage`);
  }
  return value.trim();
}

async function authorize() {
  const { principal, grants } = await requirePrincipalGrants();
  return {
    grants,
    actor: { kind: "USER" as const, userId: principal.userId, label: principal.displayName },
  };
}

async function reload(projectId: string): Promise<BqProjectDetail> {
  const detail = await bqPublicRead.getProjectDetail(projectId);
  if (!detail) throw new AppError("NOT_FOUND", "bq.project.not-found", "Project not found");
  revalidatePath(`/bq/${projectId}`);
  revalidatePath("/bq");
  return detail;
}

function parse<T extends z.ZodType>(schema: T, formData: FormData): z.infer<T> {
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw validationError(parsed.error);
  return parsed.data;
}

// ─── STRUCTURE ────────────────────────────────────────────────

const SubsectionSchema = z.object({ projectId: Id, sectionId: Id, name: z.string().trim().min(1).max(160) });

export async function addSubsectionAction(
  _prev: ActionResult<BqProjectDetail> | null,
  formData: FormData,
): Promise<ActionResult<BqProjectDetail>> {
  return runSafeAction(async () => {
    const { grants, actor } = await authorize();
    const value = parse(SubsectionSchema, formData);
    await bqService.addSubsection({ grants, actor, sectionId: value.sectionId, name: value.name });
    return reload(value.projectId);
  });
}

const SectionNameSchema = z.object({
  projectId: Id,
  id: Id,
  name: z.string().trim().min(1, "Section name is required").max(160),
});

export async function updateSectionAction(
  _prev: ActionResult<BqProjectDetail> | null,
  formData: FormData,
): Promise<ActionResult<BqProjectDetail>> {
  return runSafeAction(async () => {
    const { grants, actor } = await authorize();
    const { projectId, id, name } = parse(SectionNameSchema, formData);
    await bqService.updateSection({ grants, actor, id, name });
    return reload(projectId);
  });
}

const SubsectionNameSchema = z.object({
  projectId: Id,
  id: Id,
  name: z.string().trim().min(1, "Subsection name is required").max(160),
});

export async function updateSubsectionAction(
  _prev: ActionResult<BqProjectDetail> | null,
  formData: FormData,
): Promise<ActionResult<BqProjectDetail>> {
  return runSafeAction(async () => {
    const { grants, actor } = await authorize();
    const { projectId, id, name } = parse(SubsectionNameSchema, formData);
    await bqService.updateSubsection({ grants, actor, id, name });
    return reload(projectId);
  });
}

const LineItemMoveTargetSchema = z.union([
  z.strictObject({ direct: z.literal(true) }),
  z.strictObject({ subObjectId: Id }),
]);
const NewGroupValuesSchema = z.strictObject({ qtyPerL1: z.string().trim().optional(), markupL2Pct: z.string().trim().optional() });
const PreviewLineItemMoveSchema = z.strictObject({
  projectId: Id,
  itemId: Id,
  lineItemIds: z.array(Id).min(1),
  target: z.union([LineItemMoveTargetSchema, z.strictObject({ newGroup: NewGroupValuesSchema })]),
});
const MoveLineItemsSchema = PreviewLineItemMoveSchema.extend({ target: LineItemMoveTargetSchema });
const GroupLineItemsSchema = z.strictObject({
  projectId: Id, itemId: Id, lineItemIds: z.array(Id).min(1), name: z.string().trim().min(1).max(160),
  qtyPerL1: z.string().trim().optional(), markupL2Pct: z.string().trim().optional(),
});

function moveFormValues(formData: FormData) {
  const fields = formData.getAll("lineItemIds");
  let lineItemIds: unknown = fields;
  if (fields.length === 1 && typeof fields[0] === "string" && fields[0].trim().startsWith("[")) {
    lineItemIds = parseMoveJson(fields[0]);
  }
  return { projectId: formData.get("projectId"), itemId: formData.get("itemId"), lineItemIds };
}

function parseMoveJson(value: FormDataEntryValue | null): unknown {
  if (typeof value !== "string") throw new AppError("VALIDATION", "bq.line-item.move-invalid", "Invalid move request");
  try { return JSON.parse(value); }
  catch { throw new AppError("VALIDATION", "bq.line-item.move-invalid", "Invalid move request"); }
}

type LineItemMovePreview = {
  changes: boolean;
  beforeRate: string;
  afterRate: string;
  beforeTotal: string;
  afterTotal: string;
  totalDifference: string;
};

export async function previewLineItemMoveAction(
  _prev: ActionResult<LineItemMovePreview> | null,
  formData: FormData,
): Promise<ActionResult<LineItemMovePreview>> {
  return runSafeAction(async () => {
    const { grants } = await authorize();
    const parsed = PreviewLineItemMoveSchema.safeParse({ ...moveFormValues(formData), target: parseMoveJson(formData.get("target")) });
    if (!parsed.success) throw validationError(parsed.error);
    const { itemId, lineItemIds, target } = parsed.data;
    const preview = await bqService.previewLineItemMove({ grants, itemId, lineItemIds, target });
    const totalDifference = addDecimals(preview.after.total, toDecimalString(`-${preview.before.total}`));
    return {
      changes: preview.changes,
      beforeRate: preview.before.rate,
      afterRate: preview.after.rate,
      beforeTotal: preview.before.total,
      afterTotal: preview.after.total,
      totalDifference,
    };
  });
}

export async function moveLineItemsAction(
  _prev: ActionResult<BqProjectDetail> | null,
  formData: FormData,
): Promise<ActionResult<BqProjectDetail>> {
  return runSafeAction(async () => {
    const { grants, actor } = await authorize();
    const parsed = MoveLineItemsSchema.safeParse({ ...moveFormValues(formData), target: parseMoveJson(formData.get("target")) });
    if (!parsed.success) throw validationError(parsed.error);
    const { projectId, ...value } = parsed.data;
    await bqService.moveLineItems({ grants, actor, ...value });
    return reload(projectId);
  });
}

export async function groupLineItemsAction(
  _prev: ActionResult<BqProjectDetail> | null,
  formData: FormData,
): Promise<ActionResult<BqProjectDetail>> {
  return runSafeAction(async () => {
    const { grants, actor } = await authorize();
    const parsed = GroupLineItemsSchema.safeParse({
      ...moveFormValues(formData), name: formData.get("name"),
      qtyPerL1: formData.get("qtyPerL1") || undefined, markupL2Pct: formData.get("markupL2Pct") || undefined,
    });
    if (!parsed.success) throw validationError(parsed.error);
    const { projectId, ...value } = parsed.data;
    await bqService.groupLineItems({ grants, actor, ...value });
    return reload(projectId);
  });
}

const ReorderSiblingsSchema = z.object({
  projectId: Id,
  sectionId: Id.optional(),
  orderedIds: z.array(Id),
});

/**
 * Sections of the project (no `sectionId`) or Subsections of one Section (`sectionId`) in a new order, from Struktur
 * (owner 2026-10-14). `orderedIds` is a JSON list.
 */
export async function reorderSectionsAction(
  _prev: ActionResult<BqProjectDetail> | null,
  formData: FormData,
): Promise<ActionResult<BqProjectDetail>> {
  return runSafeAction(async () => {
    const { grants, actor } = await authorize();
    let orderedIds: unknown;
    try {
      orderedIds = JSON.parse(String(formData.get("orderedIds") ?? ""));
    } catch {
      throw new AppError("VALIDATION", "bq.section.reorder-invalid", "Invalid Section list");
    }
    const parsed = ReorderSiblingsSchema.safeParse({
      projectId: formData.get("projectId"),
      sectionId: formData.get("sectionId") || undefined,
      orderedIds,
    });
    if (!parsed.success) throw validationError(parsed.error);
    const { projectId, sectionId, orderedIds: ids } = parsed.data;
    if (sectionId) await bqService.reorderSubsections({ grants, actor, sectionId, orderedIds: ids });
    else await bqService.reorderSections({ grants, actor, projectId, orderedIds: ids });
    return reload(projectId);
  });
}

const ReorderItemsSchema = z.object({
  projectId: Id,
  sectionId: Id.optional(),
  subsectionId: Id.optional(),
  orderedIds: z.array(Id),
}).refine((value) => Boolean(value.sectionId) !== Boolean(value.subsectionId), {
  message: "Exactly one Section or Subsection is required",
});

export async function reorderItemsAction(
  _prev: ActionResult<BqProjectDetail> | null,
  formData: FormData,
): Promise<ActionResult<BqProjectDetail>> {
  return runSafeAction(async () => {
    const { grants, actor } = await authorize();
    const fields = formData.getAll("orderedIds");
    let orderedIds: unknown = fields;
    if (fields.length === 1 && typeof fields[0] === "string" && fields[0].trim().startsWith("[")) {
      try {
        orderedIds = JSON.parse(fields[0]);
      } catch {
        throw new AppError("VALIDATION", "bq.item.reorder-invalid", "Invalid Work Item list");
      }
    }
    const parsed = ReorderItemsSchema.safeParse({
      projectId: formData.get("projectId"),
      sectionId: formData.get("sectionId") || undefined,
      subsectionId: formData.get("subsectionId") || undefined,
      orderedIds,
    });
    if (!parsed.success) throw validationError(parsed.error);
    const { projectId, ...value } = parsed.data;
    await bqService.reorderItems({ grants, actor, ...value });
    return reload(projectId);
  });
}

const ItemSchema = z.object({
  projectId: Id,
  sectionId: Id.optional(),
  subsectionId: Id.optional(),
  name: z.string().trim().min(1).max(160),
  qty: z.string().trim().optional(),
  unit: z.string().trim().max(40).optional(),
  specification: z.string().trim().max(1000).optional(),
  hargaSnapshot: z.string().trim().max(40).optional(),
  priceMode: z.enum(BQ_PRICE_MODES).optional(),
});

export async function addItemAction(
  _prev: ActionResult<BqProjectDetail> | null,
  formData: FormData,
): Promise<ActionResult<BqProjectDetail>> {
  return runSafeAction(async () => {
    const { grants, actor } = await authorize();
    const raw = Object.fromEntries(formData.entries());
    if (!raw.sectionId) delete raw.sectionId;
    if (!raw.subsectionId) delete raw.subsectionId;
    const parsed = ItemSchema.safeParse(raw);
    if (!parsed.success) throw validationError(parsed.error);
    const value = parsed.data;
    await bqService.addItem({
      grants,
      actor,
      sectionId: value.sectionId,
      subsectionId: value.subsectionId,
      name: value.name,
      qty: value.qty ? positiveDecimal(value.qty, "Quantity") : "1",
      unit: value.unit || "ls",
      // The quick entry row (owner 2026-10-14) sends the price and specification with the row; empty price = TBC.
      specification: value.specification || null,
      priceMode: value.priceMode,
      ...(value.hargaSnapshot ? { hargaSnapshot: decimal(value.hargaSnapshot, "Unit price") } : {}),
    });
    return reload(value.projectId);
  });
}

const ITEM_FIELDS = ["name", "qty", "unit", "hargaSnapshot", "koefisien", "markupL1Pct", "priceMode", "notes", "specification"] as const;
const ItemFieldSchema = z.object({
  projectId: Id,
  id: Id,
  field: z.enum(ITEM_FIELDS),
  value: z.string().max(2000),
});

export async function updateItemAction(
  _prev: ActionResult<BqProjectDetail> | null,
  formData: FormData,
): Promise<ActionResult<BqProjectDetail>> {
  return runSafeAction(async () => {
    const { grants, actor } = await authorize();
    const { projectId, id, field, value } = parse(ItemFieldSchema, formData);

    const patch: Record<string, string | null> = {};
    if (field === "priceMode") {
      const mode = z.enum(BQ_PRICE_MODES).safeParse(value);
      if (!mode.success) throw validationError(mode.error);
      await bqService.updateItem({ grants, actor, id, priceMode: mode.data });
      return reload(projectId);
    }
    if (field === "name") {
      if (!value.trim()) throw new AppError("VALIDATION", "bq.item.name-required", "Work Item name is required");
      patch.name = value.trim();
    } else if (field === "unit") {
      patch.unit = value.trim() || "ls";
    } else if (field === "qty") {
      patch.qty = decimal(value, "Quantity");
    } else if (field === "koefisien") {
      patch.koefisien = positiveDecimal(value, "Coefficient");
    } else if (field === "markupL1Pct") {
      patch.markupL1Pct = percent(value, "Markup");
    } else if (field === "hargaSnapshot") {
      patch.hargaSnapshot = value.trim() ? decimal(value, "Unit price") : null;
    } else if (field === "specification") {
      patch.specification = value.trim() || null;
    } else {
      patch.notes = value.trim() || null;
    }

    await bqService.updateItem({ grants, actor, id, ...patch });
    return reload(projectId);
  });
}

const TargetSchema = z.object({ projectId: Id, id: Id });

export async function deleteItemAction(
  _prev: ActionResult<BqProjectDetail> | null,
  formData: FormData,
): Promise<ActionResult<BqProjectDetail>> {
  return runSafeAction(async () => {
    const { grants, actor } = await authorize();
    const { projectId, id } = parse(TargetSchema, formData);
    await bqService.deleteItem({ grants, actor, id });
    return reload(projectId);
  });
}

const SubObjectSchema = z.object({ projectId: Id, itemId: Id, name: z.string().trim().min(1).max(160) });

export async function addSubObjectAction(
  _prev: ActionResult<BqProjectDetail> | null,
  formData: FormData,
): Promise<ActionResult<BqProjectDetail>> {
  return runSafeAction(async () => {
    const { grants, actor } = await authorize();
    const value = parse(SubObjectSchema, formData);
    await bqService.addSubObject({ grants, actor, itemId: value.itemId, name: value.name, qtyPerL1: "1" });
    return reload(value.projectId);
  });
}

const SUB_OBJECT_FIELDS = ["name", "qtyPerL1", "markupL2Pct", "notes"] as const;
const SubObjectFieldSchema = z.object({
  projectId: Id,
  id: Id,
  field: z.enum(SUB_OBJECT_FIELDS),
  value: z.string().max(2000),
});

export async function updateSubObjectAction(
  _prev: ActionResult<BqProjectDetail> | null,
  formData: FormData,
): Promise<ActionResult<BqProjectDetail>> {
  return runSafeAction(async () => {
    const { grants, actor } = await authorize();
    const { projectId, id, field, value } = parse(SubObjectFieldSchema, formData);

    const patch: Record<string, string | null | undefined> = {};
    if (field === "name") {
      if (!value.trim()) throw new AppError("VALIDATION", "bq.sub-object.name-required", "Component Group name is required");
      patch.name = value.trim();
    } else if (field === "qtyPerL1") {
      patch.qtyPerL1 = positiveDecimal(value, "Quantity per item");
    } else if (field === "markupL2Pct") {
      patch.markupL2Pct = percent(value, "Markup");
    } else {
      patch.notes = value.trim() || null;
    }

    await bqService.updateSubObject({ grants, actor, id, ...patch });
    return reload(projectId);
  });
}

export async function deleteSubObjectAction(
  _prev: ActionResult<BqProjectDetail> | null,
  formData: FormData,
): Promise<ActionResult<BqProjectDetail>> {
  return runSafeAction(async () => {
    const { grants, actor } = await authorize();
    const { projectId, id } = parse(TargetSchema, formData);
    await bqService.deleteSubObject({ grants, actor, id });
    return reload(projectId);
  });
}

const SaveItemAsAssemblySchema = z.object({ projectId: Id, itemId: Id, name: z.string().trim().min(1).max(160) });

/** Copies a Work Item's own Cost Components into a new assembly; the Work Item stays as it is. */
export async function saveItemAsAssemblyAction(
  _prev: ActionResult<BqProjectDetail> | null,
  formData: FormData,
): Promise<ActionResult<BqProjectDetail>> {
  return runSafeAction(async () => {
    const { grants, actor } = await authorize();
    const parsed = SaveItemAsAssemblySchema.safeParse(Object.fromEntries(formData.entries()));
    if (!parsed.success) throw validationError(parsed.error);
    await bqService.saveItemAsAssembly({ grants, actor, itemId: parsed.data.itemId, name: parsed.data.name });
    return reload(parsed.data.projectId);
  });
}

const ApplyAssemblySchema = z.object({ projectId: Id, itemId: Id, assemblyId: Id, qtyPerL1: z.string().trim().optional() });

/** Copies an Assembly Template into project-owned L2/L3 rows. No live link is retained. */
export async function applyAssemblyAction(
  _prev: ActionResult<BqProjectDetail> | null,
  formData: FormData,
): Promise<ActionResult<BqProjectDetail>> {
  return runSafeAction(async () => {
    const { grants, actor } = await authorize();
    const value = parse(ApplyAssemblySchema, formData);
    await bqService.applyAssemblyTemplate({ grants, actor, itemId: value.itemId, assemblyId: value.assemblyId, qtyPerL1: value.qtyPerL1 ? positiveDecimal(value.qtyPerL1, "Assembly quantity") : undefined });
    return reload(value.projectId);
  });
}

const AddItemAndApplyAssemblySchema = z.object({
  projectId: Id,
  sectionId: Id.optional(),
  subsectionId: Id.optional(),
  assemblyId: Id,
  name: z.string().trim().max(160).optional(),
  qty: z.string().trim().optional(),
  unit: z.string().trim().max(40).optional(),
});

/** Creates a Work Item at the selected footer with the assembly's lines under it, in the same transaction. */
export async function addItemAndApplyAssemblyAction(
  _prev: ActionResult<BqProjectDetail> | null,
  formData: FormData,
): Promise<ActionResult<BqProjectDetail>> {
  return runSafeAction(async () => {
    const { grants, actor } = await authorize();
    const raw = Object.fromEntries(formData.entries());
    if (!raw.sectionId) delete raw.sectionId;
    if (!raw.subsectionId) delete raw.subsectionId;
    const parsed = AddItemAndApplyAssemblySchema.safeParse(raw);
    if (!parsed.success) throw validationError(parsed.error);
    const value = parsed.data;
    if ((value.sectionId === undefined) === (value.subsectionId === undefined)) {
      throw new AppError("VALIDATION", "bq.assembly.invalid-parent", "Assembly must be added to one section or subsection");
    }
    await bqService.addItemAndApplyAssembly({
      grants,
      actor,
      sectionId: value.sectionId,
      subsectionId: value.subsectionId,
      assemblyId: value.assemblyId,
      name: value.name || undefined,
      qty: value.qty ? positiveDecimal(value.qty, "Quantity") : undefined,
      unit: value.unit || undefined,
    });
    return reload(value.projectId);
  });
}

// ─── L3 ───────────────────────────────────────────────────────

const KATEGORI = ["MATERIAL", "UPAH", "MATERIAL_UPAH", "BIAYA_UMUM", "TRANSPORTASI_AKOMODASI", "ALAT"] as const;

const AddLineItemSchema = z.object({
  projectId: Id,
  subObjectId: Id.optional(),
  itemId: Id.optional(),
  sourceType: z.enum(["MASTERDATA", "BQ_LIBRARY", "CUSTOM"]),
  sourceRefId: z.string().max(64).optional(),
  sourceKind: z.enum(["material", "material-labor", "labor", "library"]).optional(),
  kategori: z.enum(KATEGORI).optional(),
  /** Transient add row: caller supplies initial name for CUSTOM rows. */
  title: z.string().trim().max(200).optional(),
});

/**
 * Adds one L3. A CUSTOM row starts blank and is filled in the table; an imported
 * row is snapshotted here from the owning contract and is then equally editable,
 * because bq-contract K-05 makes every snapshot field overrideable per line.
 */
export async function addLineItemAction(
  _prev: ActionResult<BqProjectDetail> | null,
  formData: FormData,
): Promise<ActionResult<BqProjectDetail>> {
  return runSafeAction(async () => {
    const { grants, actor } = await authorize();
    const raw = Object.fromEntries(formData.entries());
    for (const key of ["subObjectId", "itemId", "sourceRefId", "sourceKind", "kategori"]) {
      if (!raw[key]) delete raw[key];
    }
    const parsed = AddLineItemSchema.safeParse(raw);
    if (!parsed.success) throw validationError(parsed.error);
    const value = parsed.data;

    let snapshot: LineItemCreateInput;

    if (value.sourceType === "CUSTOM") {
      snapshot = snapshotCustom({
        title: value.title?.trim() || "New line",
        purchaseUnit: "ls",
        harga: "0",
        currency: "IDR",
        kategori: value.kategori ?? "MATERIAL",
        qty: "1",
        koefisien: "1",
      });
    } else if (value.sourceType === "BQ_LIBRARY") {
      if (!value.sourceRefId) throw new AppError("VALIDATION", "bq.line-item.source-required", "Select a BQ Library item");
      const items = await bqPublicRead.listLibraryItems();
      const item = items.find((candidate) => candidate.id === value.sourceRefId);
      if (!item) throw new AppError("NOT_FOUND", "bq.lib-item.not-found", "Library item not found");
      snapshot = snapshotFromLibrary(item);
    } else {
      if (!value.sourceRefId || !value.sourceKind) {
        throw new AppError("VALIDATION", "bq.line-item.source-required", "Select a Master Data price");
      }
        if (value.sourceKind === "library") throw new AppError("VALIDATION", "bq.line-item.source-required", "Select a Master Data price");
        snapshot = await snapshotFromMasterData({ grants, sourceKind: value.sourceKind, sourceRefId: value.sourceRefId, read: masterDataRead });
    }

    await bqService.addLineItem({
      grants,
      actor,
      subObjectId: value.subObjectId,
      itemId: value.itemId,
      sourceType: snapshot.sourceType,
      sourceRefId: snapshot.sourceRefId ?? undefined,
      sourceImportedAt: snapshot.sourceImportedAt ?? undefined,
      titleSnapshot: snapshot.titleSnapshot,
      purchaseUnitSnapshot: snapshot.purchaseUnitSnapshot,
      baseUnitSnapshot: snapshot.baseUnitSnapshot ?? undefined,
      purchaseToBaseFactorSnapshot: snapshot.purchaseToBaseFactorSnapshot ?? undefined,
      hargaSnapshot: snapshot.hargaSnapshot,
      currencySnapshot: snapshot.currencySnapshot,
      kategori: snapshot.kategori,
      qty: snapshot.qty,
      koefisien: snapshot.koefisien,
      notes: snapshot.notes ?? undefined,
    });

    return reload(value.projectId);
  });
}

const LINE_ITEM_FIELDS = [
  "titleSnapshot",
  "purchaseUnitSnapshot",
  "hargaSnapshot",
  "qty",
  "koefisien",
  "kategori",
  "notes",
] as const;
const LineItemFieldSchema = z.object({
  projectId: Id,
  id: Id,
  field: z.enum(LINE_ITEM_FIELDS),
  value: z.string().max(2000),
});

export async function updateLineItemAction(
  _prev: ActionResult<BqProjectDetail> | null,
  formData: FormData,
): Promise<ActionResult<BqProjectDetail>> {
  return runSafeAction(async () => {
    const { grants, actor } = await authorize();
    const { projectId, id, field, value } = parse(LineItemFieldSchema, formData);

    const patch: Record<string, string | null | undefined> = {};
    if (field === "titleSnapshot") {
      if (!value.trim()) throw new AppError("VALIDATION", "bq.line-item.title-required", "Cost Component name is required");
      patch.titleSnapshot = value.trim();
    } else if (field === "purchaseUnitSnapshot") {
      patch.purchaseUnitSnapshot = value.trim() || "ls";
    } else if (field === "hargaSnapshot") {
      patch.hargaSnapshot = decimal(value, "Price");
    } else if (field === "qty") {
      patch.qty = decimal(value, "Quantity");
    } else if (field === "koefisien") {
      patch.koefisien = positiveDecimal(value, "Coefficient");
    } else if (field === "kategori") {
      const kategori = z.enum(KATEGORI).safeParse(value.trim());
      if (!kategori.success) throw validationError(kategori.error);
      patch.kategori = kategori.data;
    } else {
      patch.notes = value.trim() || null;
    }

    await bqService.updateLineItem({ grants, actor, id, ...patch });
    return reload(projectId);
  });
}

export async function deleteLineItemAction(
  _prev: ActionResult<BqProjectDetail> | null,
  formData: FormData,
): Promise<ActionResult<BqProjectDetail>> {
  return runSafeAction(async () => {
    const { grants, actor } = await authorize();
    const { projectId, id } = parse(TargetSchema, formData);
    await bqService.deleteLineItem({ grants, actor, id });
    return reload(projectId);
  });
}

// ─── PROJECT ──────────────────────────────────────────────────

export async function lockProjectAction(
  _prev: ActionResult<BqProjectDetail> | null,
  formData: FormData,
): Promise<ActionResult<BqProjectDetail>> {
  return runSafeAction(async () => {
    const { grants, actor } = await authorize();
    const { projectId } = parse(z.object({ projectId: Id }), formData);
    await bqService.lockProject({ grants, actor, id: projectId, acknowledgeZeroPrices: formData.get("acknowledgeZeroPrices") === "true" });
    return reload(projectId);
  });
}

const QuotationSchema = z.object({
  projectId: Id,
  number: z.string().trim().max(80),
  date: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date")]),
  terms: z.string().max(QUOTATION_TERMS_MAX),
  useStandardTerms: z.enum(["true", "false"]),
  // The letter (owner 2026-10-14); an empty field clears it (and prints the default where there is one).
  clientContact: z.string().max(200).default(""),
  clientAddress: z.string().max(2000).default(""),
  area: z.string().max(200).default(""),
  location: z.string().max(200).default(""),
  validUntil: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date")]).default(""),
  schedule: z.string().max(2000).default(""),
  paymentTerms: z.string().max(2000).default(""),
  ppnPct: z.string().max(12).default(""),
  rounding: z.string().max(40).default(""),
});

/** Quotation details stay editable on a LOCKED project; the service refuses an archived one. */
export async function updateQuotationAction(
  _prev: ActionResult<BqProjectDetail> | null,
  formData: FormData,
): Promise<ActionResult<BqProjectDetail>> {
  return runSafeAction(async () => {
    const { grants, actor } = await authorize();
    const value = parse(QuotationSchema, formData);
    await bqService.updateQuotation({
      grants,
      actor,
      id: value.projectId,
      number: value.number || null,
      date: value.date || null,
      terms: value.useStandardTerms === "true" || !value.terms.trim() ? null : value.terms.trim(),
      letter: {
        clientContact: value.clientContact || null,
        clientAddress: value.clientAddress || null,
        area: value.area || null,
        location: value.location || null,
        validUntil: value.validUntil || null,
        schedule: value.schedule || null,
        paymentTerms: value.paymentTerms || null,
        ppnPct: value.ppnPct.trim() || null,
        rounding: value.rounding.replace(/[.\s]/g, "").replace(",", ".") || null,
      },
    });
    revalidatePath(`/bq/print/${value.projectId}/quotation`);
    return reload(value.projectId);
  });
}

async function projectLifecycleAction(
  formData: FormData,
  operation: "unlock" | "archive" | "restore" | "requestDeletion",
): Promise<ActionResult<BqProjectDetail>> {
  return runSafeAction(async () => {
    const { grants, actor } = await authorize();
    const { projectId } = parse(z.object({ projectId: Id }), formData);
    if (operation === "unlock") await bqService.unlockProject({ grants, actor, id: projectId });
    else if (operation === "archive") await bqService.archiveProject({ grants, actor, id: projectId });
    else if (operation === "restore") await bqService.restoreProject({ grants, actor, id: projectId });
    else await bqService.requestProjectDeletion({ grants, actor, id: projectId });
    return reload(projectId);
  });
}

export async function unlockProjectAction(_prev: ActionResult<BqProjectDetail> | null, formData: FormData) {
  return projectLifecycleAction(formData, "unlock");
}

export async function archiveProjectAction(_prev: ActionResult<BqProjectDetail> | null, formData: FormData) {
  return projectLifecycleAction(formData, "archive");
}

export async function restoreProjectAction(_prev: ActionResult<BqProjectDetail> | null, formData: FormData) {
  return projectLifecycleAction(formData, "restore");
}

export async function requestProjectDeletionAction(_prev: ActionResult<BqProjectDetail> | null, formData: FormData) {
  return projectLifecycleAction(formData, "requestDeletion");
}

// ─── SOURCE PICKER ────────────────────────────────────────────

export async function revertLineItemPriceAction(
  _prev: ActionResult<BqProjectDetail> | null,
  formData: FormData,
): Promise<ActionResult<BqProjectDetail>> {
  return runSafeAction(async () => {
    const { grants, actor } = await authorize();
    const { projectId, id } = parse(TargetSchema, formData);
    await bqService.revertLineItemPrice({ grants, actor, id });
    return reload(projectId);
  });
}
