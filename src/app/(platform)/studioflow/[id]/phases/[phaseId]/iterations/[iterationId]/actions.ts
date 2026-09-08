"use server";

import { redirect } from "next/navigation";

import { requirePrincipalGrants } from "@platform/core/auth";
import { runSafeAction } from "@platform/core/actions";
import type { ActionResult } from "@platform/core/actions";
import { studioFlowService } from "@/apps/studioflow/runtime";

const actorFrom = (principal: { userId: string; displayName: string }) => ({
  kind: "USER" as const,
  userId: principal.userId,
  label: principal.displayName,
});

function back(projectId: string, phaseId: string, iterationId: string): never {
  redirect(`/studioflow/${projectId}/phases/${phaseId}/iterations/${iterationId}`);
}

export async function sendIterationAction(iterationId: string, projectId: string, phaseId: string): Promise<ActionResult<never>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    await studioFlowService.sendIteration(grants, actorFrom(principal), iterationId);
    back(projectId, phaseId, iterationId);
  });
}

export async function approveIterationAction(iterationId: string, projectId: string, phaseId: string): Promise<ActionResult<never>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    await studioFlowService.approveIteration(grants, actorFrom(principal), iterationId);
    back(projectId, phaseId, iterationId);
  });
}

export async function voidIterationAction(iterationId: string, projectId: string, phaseId: string, formData: FormData): Promise<ActionResult<never>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    await studioFlowService.voidIteration(grants, actorFrom(principal), iterationId, String(formData.get("reason") ?? ""));
    back(projectId, phaseId, iterationId);
  });
}

export async function addIterationPointAction(iterationId: string, projectId: string, phaseId: string, formData: FormData): Promise<ActionResult<never>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    await studioFlowService.addIterationPoint(grants, actorFrom(principal), iterationId, String(formData.get("text") ?? ""));
    back(projectId, phaseId, iterationId);
  });
}

export async function markPointDoneAction(pointId: string, iterationId: string, projectId: string, phaseId: string, formData: FormData): Promise<ActionResult<never>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const done = String(formData.get("done") ?? "false") === "true";
    await studioFlowService.markPointDone(grants, actorFrom(principal), pointId, done);
    back(projectId, phaseId, iterationId);
  });
}

export async function withdrawPointAction(pointId: string, iterationId: string, projectId: string, phaseId: string, formData: FormData): Promise<ActionResult<never>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    await studioFlowService.withdrawPoint(grants, actorFrom(principal), pointId, String(formData.get("reason") ?? ""));
    back(projectId, phaseId, iterationId);
  });
}
