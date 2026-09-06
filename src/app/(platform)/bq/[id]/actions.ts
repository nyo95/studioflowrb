"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePrincipalGrants } from "@platform/core/auth";
import { runSafeAction, type ActionResult } from "@platform/core/actions";
import { validationError } from "@platform/core/validation";
import { AppError } from "@platform/core/errors";
import { isDecimalString } from "@platform/utilities/decimal";
import { bqPublicRead, bqService, masterDataRead } from "@/apps/bq/runtime";
import type { BqProjectDetail } from "@/apps/bq/public";
import {
  snapshotCustom,
  snapshotFromLibrary,
  snapshotFromMaterialPrice,
  snapshotFromWorkPrice,
  type LineItemCreateInput,
} from "@/apps/bq/lib/snapshot";

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

const ItemSchema = z.object({
  projectId: Id,
  sectionId: Id.optional(),
  subsectionId: Id.optional(),
  name: z.string().trim().min(1).max(160),
  unit: z.string().trim().max(40).optional(),
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
      qty: "1",
      unit: value.unit || "ls",
    });
    return reload(value.projectId);
  });
}

const ITEM_FIELDS = ["name", "qty", "unit", "hargaSnapshot", "koefisien", "markupL1Pct", "notes"] as const;
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
    if (field === "name") {
      if (!value.trim()) throw new AppError("VALIDATION", "bq.item.name-required", "Item name is required");
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

    const patch: Record<string, string | undefined> = {};
    if (field === "name") {
      if (!value.trim()) throw new AppError("VALIDATION", "bq.sub-object.name-required", "Component name is required");
      patch.name = value.trim();
    } else if (field === "qtyPerL1") {
      patch.qtyPerL1 = positiveDecimal(value, "Quantity per item");
    } else if (field === "markupL2Pct") {
      patch.markupL2Pct = percent(value, "Markup");
    } else {
      patch.notes = value.trim() || undefined;
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
      if (!value.sourceRefId) throw new AppError("VALIDATION", "bq.line-item.source-required", "Select a library item");
      const items = await bqPublicRead.listLibraryItems();
      const item = items.find((candidate) => candidate.id === value.sourceRefId);
      if (!item) throw new AppError("NOT_FOUND", "bq.lib-item.not-found", "Library item not found");
      snapshot = snapshotFromLibrary(item);
    } else {
      if (!value.sourceRefId || !value.sourceKind) {
        throw new AppError("VALIDATION", "bq.line-item.source-required", "Select a Master Data price");
      }
      if (value.sourceKind === "material") {
        const options = await masterDataRead.listMaterialPriceOptions({ limit: 200 });
        const option = options.find((candidate) => candidate.id === value.sourceRefId);
        if (!option) throw new AppError("NOT_FOUND", "bq.source.not-found", "That material price is no longer available");
        snapshot = snapshotFromMaterialPrice(option);
      } else {
        const kind = value.sourceKind === "labor" ? "labor" : "material-labor";
        const options = await masterDataRead.listWorkPricesRead({ kind });
        const option = options.find((candidate) => candidate.id === value.sourceRefId);
        if (!option) throw new AppError("NOT_FOUND", "bq.source.not-found", "That work price is no longer available");
        snapshot = snapshotFromWorkPrice(option, kind);
      }
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

    const patch: Record<string, string | undefined> = {};
    if (field === "titleSnapshot") {
      if (!value.trim()) throw new AppError("VALIDATION", "bq.line-item.title-required", "Line name is required");
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
      patch.notes = value.trim() || undefined;
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
    await bqService.lockProject({ grants, actor, id: projectId });
    return reload(projectId);
  });
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

export type LineItemSourceOption = {
  id: string;
  sourceType: "MASTERDATA" | "BQ_LIBRARY";
  sourceKind: "material" | "material-labor" | "labor" | "library";
  title: string;
  detail: string;
  unit: string;
  amount: string;
  currency: string;
  kategori: string;
};

/**
 * Composes the two source catalogues for the picker. Master Data is reached only
 * through its published read contract; the BQ Library is BQ's own.
 */
export async function listLineItemSourcesAction(query: string): Promise<ActionResult<LineItemSourceOption[]>> {
  return runSafeAction(async () => {
    const { grants } = await authorize();
    const search = query.trim();
    const options: LineItemSourceOption[] = [];

    const library = await bqPublicRead.listLibraryItems();
    for (const item of library) {
      if (search && !item.name.toLowerCase().includes(search.toLowerCase())) continue;
      options.push({
        id: item.id,
        sourceType: "BQ_LIBRARY",
        sourceKind: "library",
        title: item.name,
        detail: "BQ Library",
        unit: item.purchaseUnit,
        amount: item.harga,
        currency: item.currency,
        kategori: item.kategori,
      });
    }

    /* Master Data access is a separate grant: an estimator without it still gets
       the Library, rather than an error that hides the half they may use. */
    const { hasPermission } = await import("@platform/core/rbac");
    const { MASTERDATA_PERMISSIONS } = await import("@/apps/masterdata/public");
    if (hasPermission(grants, MASTERDATA_PERMISSIONS.priceMaterialRead)) {
      const materials = await masterDataRead.listMaterialPriceOptions({ search, limit: 50 });
      for (const option of materials) {
        options.push({
          id: option.id,
          sourceType: "MASTERDATA",
          sourceKind: "material",
          title: option.skuName ?? option.skuCode ?? "Material",
          detail: `${option.supplierVendor.name} · Master Data`,
          unit: option.unit.code,
          amount: option.amount,
          currency: option.currency,
          kategori: "MATERIAL",
        });
      }
    }

    if (hasPermission(grants, MASTERDATA_PERMISSIONS.priceWorkRead)) {
      const works = await masterDataRead.listWorkPricesRead();
      for (const option of works) {
        if (search && !option.name.toLowerCase().includes(search.toLowerCase())) continue;
        options.push({
          id: option.id,
          sourceType: "MASTERDATA",
          sourceKind: option.kind,
          title: option.name,
          detail: `${option.vendor.name} · Master Data`,
          unit: option.unit.code,
          amount: option.amount,
          currency: option.currency,
          kategori: option.kind === "labor" ? "UPAH" : "MATERIAL_UPAH",
        });
      }
    }

    return options.slice(0, 80);
  });
}
