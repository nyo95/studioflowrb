"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePrincipalGrants } from "@platform/core/auth";
import { runSafeAction, type ActionResult } from "@platform/core/actions";
import { validationError } from "@platform/core/validation";
import { bqService } from "@/apps/bq/runtime";

const ItemSchema = z.object({
  operation: z.enum(["create", "update", "delete"]),
  type: z.enum(["material", "labor", "material_labor", "custom"]),
  id: z.string().cuid().optional(),
  name: z.string().trim().min(1, "Name is required").max(160),
  purchaseUnit: z.string().trim().min(1, "Purchase unit is required").max(40),
  baseUnit: z.string().trim().max(40).optional(),
  harga: z.string().trim().regex(/^\d+(\.\d+)?$/, "Price must be a valid number").max(32),
  currency: z.string().trim().regex(/^[A-Z]{3}$/, "Currency must be a 3-letter uppercase code"),
  defaultKoefisien: z.string().trim().regex(/^\d+(\.\d+)?$/, "Coefficient must be a valid number").max(32),
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

    if (value.operation === "update" && !value.id) {
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
