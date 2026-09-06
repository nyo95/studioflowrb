"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requirePrincipalGrants } from "@platform/core/auth";
import { runSafeAction } from "@platform/core/actions";
import type { ActionResult } from "@platform/core/actions";
import { validationError } from "@platform/core/validation";
import { bqService } from "@/apps/bq/runtime";

const ProjectSchema = z.object({
  id: z.string().cuid().optional(),
  title: z.string().trim().min(1, "Project title is required").max(160),
  clientName: z.string().trim().min(1, "Client name is required").max(160),
  externalRef: z.string().trim().max(160).optional(),
  notes: z.string().trim().max(2_000).optional(),
  // bq-contract §13.2/K-12: a new project may optionally load a Template as its
  // Section/Subsection scaffold. The service supported it; the action dropped it.
  templateId: z.string().cuid().optional(),
});

function projectValues(formData: FormData) {
  const parsed = ProjectSchema.safeParse({
    id: formData.get("id") ? String(formData.get("id")) : undefined,
    title: String(formData.get("title") ?? ""),
    clientName: String(formData.get("clientName") ?? ""),
    externalRef: String(formData.get("externalRef") ?? ""),
    notes: String(formData.get("notes") ?? ""),
    templateId: formData.get("templateId") ? String(formData.get("templateId")) : undefined,
  });
  if (!parsed.success) throw validationError(parsed.error);
  return parsed.data;
}

export async function createProjectAction(_prev: ActionResult<never> | null, formData: FormData): Promise<ActionResult<never>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const value = projectValues(formData);
    const project = await bqService.createProject({
      grants,
      actor: { kind: "USER", userId: principal.userId, label: principal.displayName },
      title: value.title,
      clientName: value.clientName,
      externalRef: value.externalRef || undefined,
      notes: value.notes || undefined,
      templateId: value.templateId || undefined,
    });
    revalidatePath("/bq");
    redirect(`/bq/${project.id}`);
  });
}

export async function updateProjectAction(_prev: ActionResult<never> | null, formData: FormData): Promise<ActionResult<never>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const value = projectValues(formData);
    const id = z.string().cuid().safeParse(value.id);
    if (!id.success) throw validationError(id.error);
    await bqService.updateProject({
      grants,
      actor: { kind: "USER", userId: principal.userId, label: principal.displayName },
      id: id.data,
      title: value.title,
      clientName: value.clientName,
      externalRef: value.externalRef || null,
      notes: value.notes || null,
    });
    revalidatePath("/bq");
    revalidatePath(`/bq/${id.data}`);
    redirect(`/bq/${id.data}`);
  });
}

const SectionSchema = z.object({
  projectId: z.string().cuid(),
  name: z.string().trim().min(1, "Section name is required").max(160),
});

export async function addSectionAction(
  _prev: ActionResult<{ sectionId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ sectionId: string }>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const parsed = SectionSchema.safeParse({
      projectId: String(formData.get("projectId") ?? ""),
      name: String(formData.get("name") ?? ""),
    });
    if (!parsed.success) throw validationError(parsed.error);
    const section = await bqService.addSection({
      grants,
      actor: { kind: "USER", userId: principal.userId, label: principal.displayName },
      projectId: parsed.data.projectId,
      name: parsed.data.name,
    });
    revalidatePath(`/bq/${parsed.data.projectId}`);
    return { sectionId: section.id };
  });
}

const DeletionDecisionSchema = z.object({
  requestId: z.string().cuid(),
  decision: z.enum(["approve", "reject"]),
  reason: z.string().trim().max(500).optional(),
});

export async function decideProjectDeletionAction(formData: FormData): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const parsed = DeletionDecisionSchema.safeParse(Object.fromEntries(formData.entries()));
    if (!parsed.success) throw validationError(parsed.error);
    const actor = { kind: "USER" as const, userId: principal.userId, label: principal.displayName };
    if (parsed.data.decision === "approve") {
      await bqService.approveProjectDeletion({ grants, actor, requestId: parsed.data.requestId });
    } else {
      await bqService.rejectProjectDeletion({
        grants,
        actor,
        requestId: parsed.data.requestId,
        reason: parsed.data.reason ?? "",
      });
    }
    revalidatePath("/bq");
  });
}
