"use server";

import { revalidatePath } from "next/cache";

import { requirePrincipalGrants } from "@platform/core/auth";
import { runSafeAction } from "@platform/core/actions";
import type { ActionResult } from "@platform/core/actions";
import { studioFlowService } from "@/apps/studioflow/runtime";

const actorFrom = (principal: { userId: string; displayName: string }) => ({
  kind: "USER" as const,
  userId: principal.userId,
  label: principal.displayName,
});

const refresh = (projectId: string) => {
  revalidatePath(`/studioflow/${projectId}/files`);
  revalidatePath(`/studioflow/${projectId}`);
};

export async function linkFileAction(
  projectId: string,
  _prev: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    await studioFlowService.linkFile(grants, actorFrom(principal), {
      project_id: projectId,
      folder_key: String(formData.get("folder_key") ?? "") || null,
      original_filename: String(formData.get("original_filename") ?? ""),
      external_url: String(formData.get("external_url") ?? ""),
    });
    refresh(projectId);
  });
}

export async function recordFileAction(
  projectId: string,
  _prev: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    await studioFlowService.recordFile(grants, actorFrom(principal), {
      project_id: projectId,
      folder_key: String(formData.get("folder_key") ?? "") || null,
      original_filename: String(formData.get("original_filename") ?? ""),
      bytes: Number(formData.get("bytes") ?? 0),
    });
    refresh(projectId);
  });
}

export async function moveFileAction(
  fileId: string,
  projectId: string,
  _prev: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    await studioFlowService.moveFile(
      grants,
      actorFrom(principal),
      fileId,
      String(formData.get("folder_key") ?? "") || null,
    );
    refresh(projectId);
  });
}

export async function supersedeFileAction(
  fileId: string,
  projectId: string,
  _prev: ActionResult<void> | null,
  _formData: FormData,
): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    await studioFlowService.supersedeFile(grants, actorFrom(principal), fileId);
    refresh(projectId);
  });
}
