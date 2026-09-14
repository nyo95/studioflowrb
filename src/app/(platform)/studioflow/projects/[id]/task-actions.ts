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
  revalidatePath(`/studioflow/projects/${projectId}`);
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
    const phaseScopeValue = String(formData.get("phase_scope") ?? "");
    await studioFlowService.createTask(grants, actorFrom(principal), {
      project_id: projectId,
      phase_scope: phaseScopeValue || null,
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

export async function updateTaskAction(
  projectId: string,
  taskId: string,
  _prev: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const input: { title?: string; assignee_id?: string | null; due_date?: Date | null } = {};
    if (formData.has("title")) input.title = String(formData.get("title") ?? "");
    if (formData.has("assignee_id")) input.assignee_id = String(formData.get("assignee_id") ?? "") || null;
    if (formData.has("due_date")) {
      const value = String(formData.get("due_date") ?? "");
      input.due_date = value ? new Date(`${value}T00:00:00`) : null;
    }
    await studioFlowService.updateTask(grants, actorFrom(principal), taskId, input);
    refresh(projectId);
  });
}

export async function moveTaskAction(
  projectId: string,
  taskId: string,
  _prev: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const phaseScope = String(formData.get("phase_scope") ?? "");
    await studioFlowService.reorderTask(grants, actorFrom(principal), taskId, {
      phase_scope: phaseScope || null,
      sort_order: Number(formData.get("sort_order") ?? 0),
    });
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
