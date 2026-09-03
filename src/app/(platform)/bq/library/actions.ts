"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasAnyPermission, requirePermission } from "@platform/core/rbac";
import { runSafeAction, type ActionResult } from "@platform/core/actions";
import { validationError } from "@platform/core/validation";
import { bqService, bqPublicRead } from "@/apps/bq/runtime";
import type { BqAssemblyTemplateDetail } from "@/apps/bq/public";

const ItemSchema = z.object({
  operation: z.enum(["create", "update", "delete"]),
  type: z.enum(["material", "labor", "material_labor", "custom"]),
  id: z.string().cuid().optional(),
  name: z.string().trim().min(1, "Name is required").max(160),
  purchaseUnit: z.string().trim().min(1, "Purchase unit is required").max(40),
  baseUnit: z.string().trim().max(40).optional(),
  harga: z.string().trim().regex(/^\d+(\.\d+)?$/, "Price must be a valid number").max(32),
  currency: z.string().trim().regex(/^[A-Z]{3}$/, "Currency must be a 3-letter uppercase code"),
  // bq-contract §5/K-08: koefisien is strictly greater than zero. A zero
  // default silently prices every line that imports this item at nothing.
  defaultKoefisien: z
    .string()
    .trim()
    .regex(/^\d+(\.\d+)?$/, "Coefficient must be a valid number")
    .max(32)
    .refine((value) => /[1-9]/.test(value), "Coefficient must be greater than zero"),
  kategori: z.enum(["BIAYA_UMUM", "TRANSPORTASI_AKOMODASI", "ALAT"]).optional(),
  notes: z.string().trim().max(2000).optional(),
});

function actor(principal: { userId: string; displayName: string }) {
  return { kind: "USER", userId: principal.userId, label: principal.displayName };
}

function requireId(id: string | undefined): string {
  const parsed = z.string().cuid().safeParse(id);
  if (!parsed.success) throw validationError(parsed.error);
  return parsed.data;
}

export async function libraryItemAction(
  _prev: ActionResult<{ id?: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id?: string }>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const input = Object.fromEntries(formData.entries());
    if (input.id === "") delete input.id;
    const parsed = ItemSchema.safeParse(input);
    if (!parsed.success) throw validationError(parsed.error);
    const value = parsed.data;
    const itemActor = actor(principal);

    if (value.operation === "delete") {
      const id = requireId(value.id);
      if (value.type === "material") await bqService.deleteLibMaterial({ grants, actor: itemActor, id });
      else if (value.type === "labor") await bqService.deleteLibLabor({ grants, actor: itemActor, id });
      else if (value.type === "material_labor") await bqService.deleteLibMaterialLabor({ grants, actor: itemActor, id });
      else await bqService.deleteLibCustomItem({ grants, actor: itemActor, id });
      revalidatePath("/bq/library");
      return {};
    }

    if (value.operation === "update") {
      requireId(value.id);
    }
    const common = {
      grants,
      actor: itemActor,
      name: value.name,
      purchaseUnit: value.purchaseUnit,
      harga: value.harga,
      currency: value.currency,
      defaultKoefisien: value.defaultKoefisien,
      notes: value.notes || undefined,
    };
    let id: string;
    if (value.type === "custom") {
      const parsedCategory = z.enum(["BIAYA_UMUM", "TRANSPORTASI_AKOMODASI", "ALAT"]).safeParse(value.kategori);
      if (!parsedCategory.success) throw validationError(parsedCategory.error);
      const result = value.operation === "create"
        ? await bqService.createLibCustomItem({ ...common, kategori: parsedCategory.data })
        : await bqService.updateLibCustomItem({ ...common, id: value.id!, kategori: parsedCategory.data });
      id = result.id;
    } else {
      const typedCommon = { ...common, baseUnit: value.baseUnit || undefined };
      const result = value.type === "material"
        ? value.operation === "create" ? await bqService.createLibMaterial(typedCommon) : await bqService.updateLibMaterial({ ...typedCommon, id: value.id! })
        : value.type === "labor"
          ? value.operation === "create" ? await bqService.createLibLabor(typedCommon) : await bqService.updateLibLabor({ ...typedCommon, id: value.id! })
          : value.operation === "create" ? await bqService.createLibMaterialLabor(typedCommon) : await bqService.updateLibMaterialLabor({ ...typedCommon, id: value.id! });
      id = result.id;
    }
    revalidatePath("/bq/library");
    return { id };
  });
}

const TemplateSchema = z.object({
  operation: z.enum(["create", "update", "delete", "duplicate"]),
  id: z.string().cuid().optional(),
  name: z.string().trim().min(1, "Template name is required").max(160),
  description: z.string().trim().max(2000).optional(),
});

export async function templateAction(
  _prev: ActionResult<{ id?: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id?: string }>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const input = Object.fromEntries(formData.entries());
    if (input.id === "") delete input.id;
    const parsed = TemplateSchema.safeParse(input);
    if (!parsed.success) throw validationError(parsed.error);
    const value = parsed.data;
    const templateActor = actor(principal);
    if (!value.id && value.operation !== "create") requireId(value.id);
    const result = value.operation === "create"
      ? await bqService.createTemplate({ grants, actor: templateActor, name: value.name, description: value.description || undefined })
      : value.operation === "update"
        ? await bqService.updateTemplate({ grants, actor: templateActor, id: value.id!, name: value.name, description: value.description || undefined })
        : value.operation === "duplicate"
          ? await bqService.duplicateTemplate({ grants, actor: templateActor, id: value.id! })
          : await bqService.deleteTemplate({ grants, actor: templateActor, id: value.id! });
    revalidatePath("/bq/library");
    return { id: result && typeof result === "object" && "id" in result && typeof result.id === "string" ? result.id : value.id };
  });
}

// ─── TEMPLATE STRUCTURE (BQ-F2) ───────────────────────────────

const SectionSchema = z.object({
  templateId: z.string().cuid(),
  name: z.string().trim().min(1, "Section name is required").max(160),
  parentId: z.string().cuid().optional(),
});

/**
 * A template is a Section/Subsection scaffold (bq-contract §8.3/K-12). Without
 * these actions every template stayed empty, so loading one into a new project
 * scaffolded nothing.
 */
export async function addTemplateSectionAction(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const raw = Object.fromEntries(formData.entries());
    if (!raw.parentId) delete raw.parentId;
    const parsed = SectionSchema.safeParse(raw);
    if (!parsed.success) throw validationError(parsed.error);
    const value = parsed.data;
    const section = await bqService.addTemplateSection({
      grants,
      actor: actor(principal),
      templateId: value.templateId,
      name: value.name,
      parentId: value.parentId,
    });
    revalidatePath("/bq/library");
    return { id: section.id };
  });
}

export async function deleteTemplateSectionAction(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const id = requireId(String(formData.get("id") ?? ""));
    await bqService.deleteTemplateSection({ grants, actor: actor(principal), id });
    revalidatePath("/bq/library");
    return { id };
  });
}

const ReorderSchema = z.object({
  templateId: z.string().cuid(),
  orderedIds: z.string().min(1),
});

export async function reorderTemplateSectionsAction(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const parsed = ReorderSchema.safeParse(Object.fromEntries(formData.entries()));
    if (!parsed.success) throw validationError(parsed.error);
    const orderedIds = parsed.data.orderedIds.split(",").filter(Boolean);
    await bqService.reorderTemplateSections({
      grants,
      actor: actor(principal),
      templateId: parsed.data.templateId,
      orderedIds,
    });
    revalidatePath("/bq/library");
    return { id: parsed.data.templateId };
  });
}

const RecommendationSchema = z.object({
  templateSectionId: z.string().cuid(),
  libItemType: z.enum(["material", "labor", "material_labor", "custom"]),
  libItemId: z.string().cuid(),
});

export async function addTemplateRecommendationAction(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const parsed = RecommendationSchema.safeParse(Object.fromEntries(formData.entries()));
    if (!parsed.success) throw validationError(parsed.error);
    const rec = await bqService.addTemplateRecommendation({
      grants,
      actor: actor(principal),
      templateSectionId: parsed.data.templateSectionId,
      libItemType: parsed.data.libItemType,
      libItemId: parsed.data.libItemId,
    });
    revalidatePath("/bq/library");
    return { id: rec.id };
  });
}

export async function removeTemplateRecommendationAction(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const id = requireId(String(formData.get("id") ?? ""));
    await bqService.removeTemplateRecommendation({ grants, actor: actor(principal), id });
    revalidatePath("/bq/library");
    return { id };
  });
}

// ─── PROMOTION (BQ-F5) ────────────────────────────────────────

const PromotionSchema = z.object({
  type: z.enum(["material", "labor", "material_labor"]),
  libItemId: z.string().cuid(),
});

export async function requestPromotionAction(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const parsed = PromotionSchema.safeParse(Object.fromEntries(formData.entries()));
    if (!parsed.success) throw validationError(parsed.error);
    await bqService.requestPromotion({
      grants,
      actor: actor(principal),
      type: parsed.data.type,
      libItemId: parsed.data.libItemId,
    });
    revalidatePath("/bq/library");
    return { id: parsed.data.libItemId };
  });
}

/**
 * bq-contract §9/K-10: promotion carries structure, never price. The Master Data
 * entry is created there by an administrator through the ordinary pricing
 * workflow; approval only records which entry it became.
 */
export async function approvePromotionAction(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const parsed = PromotionSchema.extend({ masterdataRefId: z.string().trim().min(1, "Master Data entry ID is required").max(64) })
      .safeParse(Object.fromEntries(formData.entries()));
    if (!parsed.success) throw validationError(parsed.error);
    await bqService.approvePromotion({
      grants,
      actor: actor(principal),
      type: parsed.data.type,
      libItemId: parsed.data.libItemId,
      masterdataRefId: parsed.data.masterdataRefId,
    });
    revalidatePath("/bq/library");
    return { id: parsed.data.libItemId };
  });
}

export async function rejectPromotionAction(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const parsed = PromotionSchema.extend({ reason: z.string().trim().min(1, "A rejection must state its reason").max(500) })
      .safeParse(Object.fromEntries(formData.entries()));
    if (!parsed.success) throw validationError(parsed.error);
    await bqService.rejectPromotion({
      grants,
      actor: actor(principal),
      type: parsed.data.type,
      libItemId: parsed.data.libItemId,
      reason: parsed.data.reason,
    });
    revalidatePath("/bq/library");
    return { id: parsed.data.libItemId };
  });
}

const AssemblySchema = z.object({ name: z.string().trim().min(1).max(160), description: z.string().trim().max(2000).optional() });
export async function createAssemblyAction(_prev: ActionResult<{ id: string }> | null, formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const parsed = AssemblySchema.safeParse(Object.fromEntries(formData.entries()));
    if (!parsed.success) throw validationError(parsed.error);
    const value = parsed.data;
    const assembly = await bqService.createAssemblyTemplate({ grants, actor: actor(principal), name: value.name, description: value.description || undefined });
    revalidatePath("/bq/library");
    return { id: assembly.id };
  });
}

const AssemblyUpdateSchema = z.object({ id: z.string().cuid(), name: z.string().trim().min(1).max(160).optional(), description: z.string().trim().max(2000).optional() });
export async function updateAssemblyAction(_prev: ActionResult<void> | null, formData: FormData): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const parsed = AssemblyUpdateSchema.safeParse(Object.fromEntries(formData.entries()));
    if (!parsed.success) throw validationError(parsed.error);
    const { id, ...rest } = parsed.data;
    await bqService.updateAssemblyTemplate({ grants, actor: actor(principal), assemblyId: id, ...rest });
    revalidatePath("/bq/library");
  });
}

export async function deleteAssemblyAction(_prev: ActionResult<void> | null, formData: FormData): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const id = requireId(String(formData.get("id") ?? ""));
    await bqService.deleteAssemblyTemplate({ grants, actor: actor(principal), assemblyId: id });
    revalidatePath("/bq/library");
  });
}

const AssemblyLineSchema = z.object({
  assemblyId: z.string().cuid(),
  title: z.string().trim().min(1).max(200),
  purchaseUnit: z.string().trim().min(1).max(40).optional(),
  harga: z.string().trim().regex(/^\d+(\.\d+)?$/).max(32).optional(),
  currency: z.string().trim().regex(/^[A-Z]{3}$/).optional(),
  kategori: z.enum(["MATERIAL", "UPAH", "MATERIAL_UPAH", "BIAYA_UMUM", "TRANSPORTASI_AKOMODASI", "ALAT"]).optional(),
  qty: z.string().trim().regex(/^\d+(\.\d+)?$/).max(32).optional(),
  koefisien: z.string().trim().regex(/^\d+(\.\d+)?$/).max(32).optional(),
});
export async function addAssemblyLineAction(_prev: ActionResult<void> | null, formData: FormData): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const parsed = AssemblyLineSchema.safeParse(Object.fromEntries(formData.entries()));
    if (!parsed.success) throw validationError(parsed.error);
    const { assemblyId, ...rest } = parsed.data;
    await bqService.addAssemblyCustomLine({ grants, actor: actor(principal), assemblyId, ...rest });
    revalidatePath("/bq/library");
  });
}

const AssemblyLineUpdateSchema = z.object({
  lineId: z.string().cuid(),
  title: z.string().trim().min(1).max(200).optional(),
  purchaseUnit: z.string().trim().min(1).max(40).optional(),
  harga: z.string().trim().regex(/^\d+(\.\d+)?$/).max(32).optional(),
  kategori: z.enum(["MATERIAL", "UPAH", "MATERIAL_UPAH", "BIAYA_UMUM", "TRANSPORTASI_AKOMODASI", "ALAT"]).optional(),
  qty: z.string().trim().regex(/^\d+(\.\d+)?$/).max(32).optional(),
  koefisien: z.string().trim().regex(/^\d+(\.\d+)?$/).max(32).optional(),
  notes: z.string().trim().max(2000).optional(),
});
export async function updateAssemblyLineAction(_prev: ActionResult<void> | null, formData: FormData): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const parsed = AssemblyLineUpdateSchema.safeParse(Object.fromEntries(formData.entries()));
    if (!parsed.success) throw validationError(parsed.error);
    const { lineId, ...rest } = parsed.data;
    await bqService.updateAssemblyLine({ grants, actor: actor(principal), lineId, ...rest });
    revalidatePath("/bq/library");
  });
}

export async function deleteAssemblyLineAction(_prev: ActionResult<void> | null, formData: FormData): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const lineId = requireId(String(formData.get("lineId") ?? ""));
    await bqService.deleteAssemblyLine({ grants, actor: actor(principal), lineId });
    revalidatePath("/bq/library");
  });
}

export async function getAssemblyDetailAction(id: string): Promise<BqAssemblyTemplateDetail | null> {
  const { grants } = await requirePrincipalGrants();
  if (!hasAnyPermission(grants, ["bq.library.read", "bq.library.manage"])) requirePermission(grants, "bq.library.read");
  return bqPublicRead.getAssemblyTemplateDetail(requireId(id));
}
