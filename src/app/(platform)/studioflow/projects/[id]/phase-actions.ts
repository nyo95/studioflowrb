"use server";

import { revalidatePath } from "next/cache";

import { requirePrincipalGrants } from "@platform/core/auth";
import { runSafeAction } from "@platform/core/actions";
import type { ActionResult } from "@platform/core/actions";
import { AppError } from "@platform/core/errors";
import { studioFlowService } from "@/apps/studioflow/runtime";

const actorFrom = (p: { userId: string; displayName: string }) => ({
  kind: "USER" as const,
  userId: p.userId,
  label: p.displayName,
});

const refresh = (projectId: string) => revalidatePath(`/studioflow/projects/${projectId}`);

function responseKindOf(formData: FormData): "APPROVAL" | "REVISION" {
  const kind = formData.get("kind");
  if (kind !== "APPROVAL" && kind !== "REVISION") {
    throw new AppError(
      "VALIDATION",
      "studioflow.response.kind-invalid",
      "Choose a client response type",
    );
  }
  return kind;
}

// ── Iteration actions ─────────────────────────────────────────────────────────

export async function openIterationAction(
  projectId: string,
  phaseId: string,
  _prev: ActionResult<void> | null,
  _fd: FormData,
): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    await studioFlowService.openIteration(grants, actorFrom(principal), phaseId);
    refresh(projectId);
  });
}

export async function sendIterationAction(
  projectId: string,
  iterationId: string,
  _prev: ActionResult<void> | null,
  _fd: FormData,
): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    await studioFlowService.sendIteration(grants, actorFrom(principal), iterationId);
    refresh(projectId);
  });
}

export async function recordResponseAction(
  projectId: string,
  iterationId: string,
  _prev: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const kind = responseKindOf(formData);
    const note = (formData.get("note") as string | null) ?? undefined;
    const points = formData
      .getAll("point")
      .map((v) => String(v).trim())
      .filter(Boolean);
    await studioFlowService.recordResponse(grants, actorFrom(principal), iterationId, {
      kind,
      note,
      points,
    });
    refresh(projectId);
  });
}

// ── Phase actions ─────────────────────────────────────────────────────────────

export async function finishPhaseAction(
  projectId: string,
  phaseId: string,
  _prev: ActionResult<void> | null,
  _fd: FormData,
): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    await studioFlowService.finishPhase(grants, actorFrom(principal), phaseId);
    refresh(projectId);
  });
}

export async function voidIterationAction(
  projectId: string,
  iterationId: string,
  _prev: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const reason = String(formData.get("reason") ?? "").trim();
    await studioFlowService.voidIteration(grants, actorFrom(principal), iterationId, reason);
    refresh(projectId);
  });
}

// ── Supervision actions ───────────────────────────────────────────────────────

export async function startSupervisionAction(
  projectId: string,
  phaseId: string,
  _prev: ActionResult<void> | null,
  _fd: FormData,
): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    await studioFlowService.startSupervision(grants, actorFrom(principal), phaseId);
    refresh(projectId);
  });
}

export async function finishSupervisionAction(
  projectId: string,
  phaseId: string,
  _prev: ActionResult<void> | null,
  _fd: FormData,
): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    await studioFlowService.finishSupervision(grants, actorFrom(principal), phaseId);
    refresh(projectId);
  });
}

export async function reopenSupervisionAction(
  projectId: string,
  phaseId: string,
  _prev: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const reason = String(formData.get("reason") ?? "").trim();
    await studioFlowService.reopenSupervision(grants, actorFrom(principal), phaseId, reason);
    refresh(projectId);
  });
}

// ── Phase lifecycle actions ───────────────────────────────────────────────────

export async function reopenPhaseAction(
  projectId: string,
  phaseId: string,
  _prev: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const reason = String(formData.get("reason") ?? "").trim();
    await studioFlowService.reopenPhase(grants, actorFrom(principal), phaseId, reason);
    refresh(projectId);
  });
}

export async function closePhaseByExceptionAction(
  projectId: string,
  phaseId: string,
  _prev: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const reason = String(formData.get("reason") ?? "").trim();
    await studioFlowService.closePhaseByException(grants, actorFrom(principal), phaseId, reason);
    refresh(projectId);
  });
}

// ── ACC internal ──────────────────────────────────────────────────────────────

export async function recordInternalApprovalAction(
  projectId: string,
  iterationId: string,
  _prev: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const note = (formData.get("note") as string | null) ?? undefined;
    await studioFlowService.recordInternalApproval(grants, actorFrom(principal), iterationId, note || undefined);
    refresh(projectId);
  });
}

// ── Combined: record response + optionally finish phase ───────────────────────

export async function recordResponseAndFinishAction(
  projectId: string,
  iterationId: string,
  _prev: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const kind = responseKindOf(formData);
    const note = (formData.get("note") as string | null) ?? undefined;
    const points = formData
      .getAll("point")
      .map((v) => String(v).trim())
      .filter(Boolean);
    const alsoFinish = formData.get("also_finish") === "1";

    await studioFlowService.recordResponse(grants, actorFrom(principal), iterationId, {
      kind,
      note,
      points,
      also_finish_phase: alsoFinish,
    });

    refresh(projectId);
  });
}
