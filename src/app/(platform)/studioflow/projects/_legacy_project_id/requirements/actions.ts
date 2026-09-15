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

const CreateRequirementSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().max(2000).optional().or(z.literal("")),
  phase_id: z.string().uuid().optional().or(z.literal("")),
  sort_order: z.coerce.number().int().min(0).optional(),
});

const EditRequirementSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200).optional(),
  description: z.string().max(2000).optional().or(z.literal("")),
  sort_order: z.coerce.number().int().min(0).optional(),
});

const SatisfySchema = z.object({
  satisfaction_note: z.string().trim().min(1, "Note is required").max(500),
});

const ReasonSchema = z.object({
  reason: z.string().trim().min(1, "Reason is required").max(500),
});

const EvidenceSchema = z.object({
  file_id: z.string().uuid("Select a valid file"),
});

export async function createProjectRequirementAction(
  projectId: string,
  _prev: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const parsed = CreateRequirementSchema.safeParse({
      title: formData.get("title"),
      description: formData.get("description") || undefined,
      phase_id: formData.get("phase_id") || undefined,
      sort_order: formData.get("sort_order") || undefined,
    });
    if (!parsed.success) throw validationError(parsed.error);
    await studioFlowService.createProjectRequirement(grants, actorFrom(principal), {
      project_id: projectId,
      ...parsed.data,
      description: parsed.data.description || null,
      phase_id: parsed.data.phase_id || null,
    });
    revalidatePath(`/studioflow/projects/${projectId}`);
    revalidatePath(`/studioflow/projects/${projectId}/requirements`);
    revalidatePath(`/studioflow/projects/${projectId}/phases`, "layout");
  });
}

export async function editProjectRequirementAction(
  projectId: string,
  requirementId: string,
  _prev: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const parsed = EditRequirementSchema.safeParse({
      title: formData.get("title") || undefined,
      description: formData.get("description") || undefined,
      sort_order: formData.get("sort_order") || undefined,
    });
    if (!parsed.success) throw validationError(parsed.error);
    await studioFlowService.editProjectRequirement(grants, actorFrom(principal), requirementId, {
      ...parsed.data,
      description: parsed.data.description || null,
    });
    revalidatePath(`/studioflow/projects/${projectId}`);
    revalidatePath(`/studioflow/projects/${projectId}/requirements`);
    revalidatePath(`/studioflow/projects/${projectId}/phases`, "layout");
  });
}

export async function satisfyRequirementAction(
  projectId: string,
  requirementId: string,
  _prev: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const parsed = SatisfySchema.safeParse({ satisfaction_note: formData.get("satisfaction_note") });
    if (!parsed.success) throw validationError(parsed.error);
    await studioFlowService.satisfyRequirement(grants, actorFrom(principal), requirementId, parsed.data);
    revalidatePath(`/studioflow/projects/${projectId}`);
    revalidatePath(`/studioflow/projects/${projectId}/requirements`);
    revalidatePath(`/studioflow/projects/${projectId}/phases`, "layout");
  });
}

export async function reopenRequirementAction(
  projectId: string,
  requirementId: string,
  _prev: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const parsed = ReasonSchema.safeParse({ reason: formData.get("reason") });
    if (!parsed.success) throw validationError(parsed.error);
    await studioFlowService.reopenRequirement(grants, actorFrom(principal), requirementId, { reopen_reason: parsed.data.reason });
    revalidatePath(`/studioflow/projects/${projectId}`);
    revalidatePath(`/studioflow/projects/${projectId}/requirements`);
    revalidatePath(`/studioflow/projects/${projectId}/phases`, "layout");
  });
}

export async function archiveRequirementAction(
  projectId: string,
  requirementId: string,
  _prev: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const parsed = ReasonSchema.safeParse({ reason: formData.get("reason") });
    if (!parsed.success) throw validationError(parsed.error);
    await studioFlowService.archiveRequirement(grants, actorFrom(principal), requirementId, parsed.data);
    revalidatePath(`/studioflow/projects/${projectId}`);
    revalidatePath(`/studioflow/projects/${projectId}/requirements`);
    revalidatePath(`/studioflow/projects/${projectId}/phases`, "layout");
  });
}

export async function restoreRequirementAction(
  projectId: string,
  requirementId: string,
  _prev: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const parsed = ReasonSchema.safeParse({ reason: formData.get("reason") });
    if (!parsed.success) throw validationError(parsed.error);
    await studioFlowService.restoreRequirement(grants, actorFrom(principal), requirementId, parsed.data);
    revalidatePath(`/studioflow/projects/${projectId}`);
    revalidatePath(`/studioflow/projects/${projectId}/requirements`);
    revalidatePath(`/studioflow/projects/${projectId}/phases`, "layout");
  });
}

export async function linkEvidenceAction(
  projectId: string,
  requirementId: string,
  _prev: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const parsed = EvidenceSchema.safeParse({ file_id: formData.get("file_id") });
    if (!parsed.success) throw validationError(parsed.error);
    await studioFlowService.linkEvidence(grants, actorFrom(principal), requirementId, parsed.data);
    revalidatePath(`/studioflow/projects/${projectId}`);
    revalidatePath(`/studioflow/projects/${projectId}/requirements`);
    revalidatePath(`/studioflow/projects/${projectId}/phases`, "layout");
  });
}

export async function unlinkEvidenceAction(
  projectId: string,
  requirementId: string,
  evidenceId: string,
  _prev: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const parsed = ReasonSchema.safeParse({ reason: formData.get("reason") });
    if (!parsed.success) throw validationError(parsed.error);
    await studioFlowService.unlinkEvidence(grants, actorFrom(principal), requirementId, evidenceId, parsed.data);
    revalidatePath(`/studioflow/projects/${projectId}`);
    revalidatePath(`/studioflow/projects/${projectId}/requirements`);
    revalidatePath(`/studioflow/projects/${projectId}/phases`, "layout");
  });
}
