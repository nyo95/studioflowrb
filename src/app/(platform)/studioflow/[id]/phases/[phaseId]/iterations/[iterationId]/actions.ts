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

const refresh = (projectId: string, phaseId: string, iterationId: string) => {
  revalidatePath(`/studioflow/${projectId}/phases/${phaseId}/iterations/${iterationId}`);
  revalidatePath(`/studioflow/${projectId}/phases/${phaseId}`);
};

// ── Iteration lifecycle ───────────────────────────────────────────────────────

export async function sendIterationAction(
  iterationId: string,
  projectId: string,
  phaseId: string,
  _prev: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const assignee = String(formData.get("assignee_id") ?? "").trim();
    await studioFlowService.sendIteration(grants, actorFrom(principal), iterationId, assignee || undefined);
    refresh(projectId, phaseId, iterationId);
  });
}

export async function approveIterationAction(
  iterationId: string,
  projectId: string,
  phaseId: string,
  _prev: ActionResult<void> | null,
  _formData: FormData,
): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    await studioFlowService.approveIteration(grants, actorFrom(principal), iterationId);
    refresh(projectId, phaseId, iterationId);
  });
}

export async function voidIterationAction(
  iterationId: string,
  projectId: string,
  phaseId: string,
  _prev: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    await studioFlowService.voidIteration(grants, actorFrom(principal), iterationId, String(formData.get("reason") ?? ""));
    refresh(projectId, phaseId, iterationId);
  });
}

// ── Checklist points ──────────────────────────────────────────────────────────

export async function addIterationPointAction(
  iterationId: string,
  projectId: string,
  phaseId: string,
  _prev: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    await studioFlowService.addIterationPoint(grants, actorFrom(principal), iterationId, String(formData.get("text") ?? ""));
    refresh(projectId, phaseId, iterationId);
  });
}

export async function markPointDoneAction(
  pointId: string,
  iterationId: string,
  projectId: string,
  phaseId: string,
  _prev: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    await studioFlowService.markPointDone(
      grants,
      actorFrom(principal),
      pointId,
      String(formData.get("done") ?? "false") === "true",
    );
    refresh(projectId, phaseId, iterationId);
  });
}

export async function withdrawPointAction(
  pointId: string,
  iterationId: string,
  projectId: string,
  phaseId: string,
  _prev: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    await studioFlowService.withdrawPoint(grants, actorFrom(principal), pointId, String(formData.get("reason") ?? ""));
    refresh(projectId, phaseId, iterationId);
  });
}

// ── Client response (WO-5) ────────────────────────────────────────────────────

export async function recordResponseAction(
  iterationId: string,
  projectId: string,
  phaseId: string,
  _prev: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const kind = String(formData.get("kind") ?? "") === "REVISION" ? "REVISION" : "APPROVAL";
    // One revision request per line.
    const points = String(formData.get("points") ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    await studioFlowService.recordResponse(grants, actorFrom(principal), iterationId, {
      kind,
      note: String(formData.get("note") ?? ""),
      points,
    });
    refresh(projectId, phaseId, iterationId);
  });
}
