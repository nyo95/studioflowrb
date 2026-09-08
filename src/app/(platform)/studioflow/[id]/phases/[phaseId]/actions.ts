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

const refresh = (projectId: string, phaseId: string) => {
  revalidatePath(`/studioflow/${projectId}/phases/${phaseId}`);
  revalidatePath(`/studioflow/${projectId}`);
};

// ── Phase lifecycle ───────────────────────────────────────────────────────────

export async function finishPhaseAction(
  phaseId: string,
  projectId: string,
  _prev: ActionResult<void> | null,
  _formData: FormData,
): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    await studioFlowService.finishPhase(grants, actorFrom(principal), phaseId);
    refresh(projectId, phaseId);
  });
}

export async function reopenPhaseAction(
  phaseId: string,
  projectId: string,
  _prev: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    await studioFlowService.reopenPhase(grants, actorFrom(principal), phaseId, String(formData.get("reason") ?? ""));
    refresh(projectId, phaseId);
  });
}

export async function closePhaseByExceptionAction(
  phaseId: string,
  projectId: string,
  _prev: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    await studioFlowService.closePhaseByException(grants, actorFrom(principal), phaseId, String(formData.get("reason") ?? ""));
    refresh(projectId, phaseId);
  });
}

// ── Supervision ───────────────────────────────────────────────────────────────

export async function startSupervisionAction(
  phaseId: string,
  projectId: string,
  _prev: ActionResult<void> | null,
  _formData: FormData,
): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    await studioFlowService.startSupervision(grants, actorFrom(principal), phaseId);
    refresh(projectId, phaseId);
  });
}

export async function finishSupervisionAction(
  phaseId: string,
  projectId: string,
  _prev: ActionResult<void> | null,
  _formData: FormData,
): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    await studioFlowService.finishSupervision(grants, actorFrom(principal), phaseId);
    refresh(projectId, phaseId);
  });
}

export async function reopenSupervisionAction(
  phaseId: string,
  projectId: string,
  _prev: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    await studioFlowService.reopenSupervision(grants, actorFrom(principal), phaseId, String(formData.get("reason") ?? ""));
    refresh(projectId, phaseId);
  });
}

// ── Iteration ─────────────────────────────────────────────────────────────────

export async function openIterationAction(
  phaseId: string,
  projectId: string,
  _prev: ActionResult<void> | null,
  _formData: FormData,
): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    await studioFlowService.openIteration(grants, actorFrom(principal), phaseId);
    refresh(projectId, phaseId);
  });
}

// ── Files ─────────────────────────────────────────────────────────────────────

export async function recordFileAction(
  projectId: string,
  phaseId: string,
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
    refresh(projectId, phaseId);
  });
}
