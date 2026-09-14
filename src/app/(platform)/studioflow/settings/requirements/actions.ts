"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePrincipalGrants } from "@platform/core/auth";
import { runSafeAction } from "@platform/core/actions";
import type { ActionResult } from "@platform/core/actions";
import { validationError } from "@platform/core/validation";
import { studioFlowService } from "@/apps/studioflow/runtime";

const actorFrom = (p: { userId: string; displayName: string }) => ({
  kind: "USER" as const,
  userId: p.userId,
  label: p.displayName,
});

const TemplateSchema = z.object({
  key: z.string().trim().min(1, "Key is required").max(100),
  scope: z.enum(["GENERAL", "PHASE"]),
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().max(2000).optional().or(z.literal("")),
  phase_template_id: z.string().uuid().optional().or(z.literal("")),
  sort_order: z.coerce.number().int().min(0).optional(),
});

const EditTemplateSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200).optional(),
  description: z.string().max(2000).optional().or(z.literal("")),
  sort_order: z.coerce.number().int().min(0).optional(),
});

export async function createRequirementTemplateAction(
  _prev: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const parsed = TemplateSchema.safeParse({
      key: formData.get("key"),
      scope: formData.get("scope"),
      title: formData.get("title"),
      description: formData.get("description") || undefined,
      phase_template_id: formData.get("phase_template_id") || undefined,
      sort_order: formData.get("sort_order") || undefined,
    });
    if (!parsed.success) throw validationError(parsed.error);
    await studioFlowService.createRequirementTemplate(grants, actorFrom(principal), {
      ...parsed.data,
      description: parsed.data.description || null,
      phase_template_id: parsed.data.phase_template_id || null,
    });
    revalidatePath("/studioflow/settings/requirements");
  });
}

export async function editRequirementTemplateAction(
  templateId: string,
  _prev: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const parsed = EditTemplateSchema.safeParse({
      title: formData.get("title") || undefined,
      description: formData.get("description") || undefined,
      sort_order: formData.get("sort_order") || undefined,
    });
    if (!parsed.success) throw validationError(parsed.error);
    await studioFlowService.editRequirementTemplate(grants, actorFrom(principal), templateId, {
      ...parsed.data,
      description: parsed.data.description || null,
    });
    revalidatePath("/studioflow/settings/requirements");
  });
}

export async function archiveRequirementTemplateAction(templateId: string): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    await studioFlowService.archiveRequirementTemplate(grants, actorFrom(principal), templateId);
    revalidatePath("/studioflow/settings/requirements");
  });
}

export async function restoreRequirementTemplateAction(templateId: string): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    await studioFlowService.restoreRequirementTemplate(grants, actorFrom(principal), templateId);
    revalidatePath("/studioflow/settings/requirements");
  });
}

export async function deleteRequirementTemplateAction(templateId: string): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    await studioFlowService.deleteRequirementTemplate(grants, actorFrom(principal), templateId);
    revalidatePath("/studioflow/settings/requirements");
  });
}
