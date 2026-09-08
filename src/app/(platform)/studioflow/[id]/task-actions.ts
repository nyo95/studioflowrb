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
  revalidatePath(`/studioflow/${projectId}`);
};

// ── Task actions (SF-F4) ─────────────────────────────────────────────────────

export async function createTaskAction(
  projectId: string,
  _prev: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const title = String(formData.get("title") ?? "").trim();
    await studioFlowService.createTask(grants, actorFrom(principal), {
      project_id: projectId,
      phase_scope: null,
      title,
    });
    refresh(projectId);
  });
}

export async function setTaskCompletionAction(
  projectId: string,
  taskId: string,
  done: boolean,
  _prev: ActionResult<void> | null,
  _formData: FormData,
): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    await studioFlowService.setTaskCompletion(
      grants,
      actorFrom(principal),
      taskId,
      { done },
    );
    refresh(projectId);
  });
}

export async function deleteTaskAction(
  projectId: string,
  taskId: string,
  _prev: ActionResult<void> | null,
  _formData: FormData,
): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    await studioFlowService.deleteTask(grants, actorFrom(principal), taskId);
    refresh(projectId);
  });
}
