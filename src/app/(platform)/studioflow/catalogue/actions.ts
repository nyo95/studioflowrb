"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requirePrincipalGrants } from "@platform/core/auth";
import { runSafeAction } from "@platform/core/actions";
import type { ActionResult } from "@platform/core/actions";
import { AppError } from "@platform/core/errors";
import { validationError } from "@platform/core/validation";
import { prisma } from "@/platform/core/db";
import { createMasterDataPublicRead } from "@/apps/masterdata/public";
import { studioFlowService } from "@/apps/studioflow/runtime";

const CatalogueSchema = z.object({
  brand_md_id: z.string().trim().max(200).optional(),
  brand_name: z.string().trim().max(200).optional(),
  product_name: z.string().trim().min(1, "Product name is required").max(200),
  colour: z.string().trim().max(100).optional(),
  finishing: z.string().trim().max(100).optional(),
  dimension_text: z.string().trim().max(200).optional(),
  unit: z.string().trim().max(50).optional(),
  notes: z.string().trim().max(2000).optional(),
});

function optionalText(value: FormDataEntryValue | null): string | undefined {
  const text = String(value ?? "").trim();
  return text ? text : undefined;
}

async function freezeBrand(brandMdId: string | undefined, typedName: string | undefined, frozen?: { id: string | null; name: string | null }) {
  if (!brandMdId) {
    return { brand_md_id: null, brand_name: typedName?.trim() || null };
  }
  const brand = await createMasterDataPublicRead(prisma).getBrandLibraryRead(brandMdId);
  if (!brand) {
    if (frozen?.id === brandMdId && frozen.name) return { brand_md_id: frozen.id, brand_name: frozen.name };
    throw new AppError(
      "VALIDATION",
      "studioflow.catalogue.brand-unavailable",
      "Selected brand is no longer available",
    );
  }
  return { brand_md_id: brand.id, brand_name: brand.name };
}

function parseCatalogue(formData: FormData) {
  const parsed = CatalogueSchema.safeParse({
    brand_md_id: optionalText(formData.get("brand_md_id")),
    brand_name: optionalText(formData.get("brand_name")),
    product_name: String(formData.get("product_name") ?? ""),
    colour: optionalText(formData.get("colour")),
    finishing: optionalText(formData.get("finishing")),
    dimension_text: optionalText(formData.get("dimension_text")),
    unit: optionalText(formData.get("unit")),
    notes: optionalText(formData.get("notes")),
  });
  if (!parsed.success) throw validationError(parsed.error);
  return parsed.data;
}

export async function createCatalogueAction(
  _prev: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const input = parseCatalogue(formData);
    const brand = await freezeBrand(input.brand_md_id, input.brand_name);
    const created = await studioFlowService.createCatalogueProduct(
      grants,
      { kind: "USER", userId: principal.userId, label: principal.displayName },
      {
        ...brand,
        product_name: input.product_name,
        colour: input.colour ?? null,
        finishing: input.finishing ?? null,
        dimension_text: input.dimension_text ?? null,
        unit: input.unit ?? null,
        notes: input.notes ?? null,
      },
    );
    revalidatePath("/studioflow/catalogue");
    redirect(`/studioflow/catalogue/${created.id}`);
  });
}

export async function editCatalogueAction(
  _prev: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const id = String(formData.get("id") ?? "");
    const input = parseCatalogue(formData);
    const existing = await studioFlowService.getCatalogueProduct(grants, id);
    const brand = await freezeBrand(input.brand_md_id, input.brand_name, { id: existing.brand_md_id, name: existing.brand_name });
    await studioFlowService.editCatalogueProduct(
      grants,
      { kind: "USER", userId: principal.userId, label: principal.displayName },
      id,
      {
        ...brand,
        product_name: input.product_name,
        colour: input.colour ?? null,
        finishing: input.finishing ?? null,
        dimension_text: input.dimension_text ?? null,
        unit: input.unit ?? null,
        notes: input.notes ?? null,
      },
    );
    revalidatePath("/studioflow/catalogue");
    revalidatePath(`/studioflow/catalogue/${id}`);
  });
}

export async function archiveCatalogueAction(
  _prev: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const id = String(formData.get("id") ?? "");
    await studioFlowService.archiveCatalogueProduct(
      grants,
      { kind: "USER", userId: principal.userId, label: principal.displayName },
      id,
    );
    revalidatePath("/studioflow/catalogue");
    revalidatePath(`/studioflow/catalogue/${id}`);
  });
}

export async function restoreCatalogueAction(
  _prev: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const id = String(formData.get("id") ?? "");
    await studioFlowService.restoreCatalogueProduct(
      grants,
      { kind: "USER", userId: principal.userId, label: principal.displayName },
      id,
    );
    revalidatePath("/studioflow/catalogue");
    revalidatePath(`/studioflow/catalogue/${id}`);
  });
}
