"use server";

import { redirect } from "next/navigation";

import { requirePrincipalGrants } from "@platform/core/auth";
import { runSafeAction } from "@platform/core/actions";
import type { ActionResult } from "@platform/core/actions";
import { studioFlowService } from "@/apps/studioflow/runtime";

// ── Phase: finish ─────────────────────────────────────────────────────────────

export async function finishPhaseAction(
  phaseId: string,
  projectId: string,
): Promise<ActionResult<never>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    await studioFlowService.finishPhase(grants, { kind: "USER", userId: principal.userId, label: principal.displayName }, phaseId);
    redirect(`/studioflow/${projectId}/phases/${phaseId}`);
  });
}

// ── Phase: reopen ─────────────────────────────────────────────────────────────

export async function reopenPhaseAction(
  phaseId: string,
  projectId: string,
  formData: FormData,
): Promise<ActionResult<never>> {
  return runSafeAction(async () => {
    const reason = String(formData.get("reason") ?? "").trim();
    const { principal, grants } = await requirePrincipalGrants();
    await studioFlowService.reopenPhase(grants, { kind: "USER", userId: principal.userId, label: principal.displayName }, phaseId, reason);
    redirect(`/studioflow/${projectId}/phases/${phaseId}`);
  });
}

// ── Phase: close by exception ─────────────────────────────────────────────────

export async function closePhaseByExceptionAction(
  phaseId: string,
  projectId: string,
  formData: FormData,
): Promise<ActionResult<never>> {
  return runSafeAction(async () => {
    const reason = String(formData.get("reason") ?? "").trim();
    const { principal, grants } = await requirePrincipalGrants();
    await studioFlowService.closePhaseByException(grants, { kind: "USER", userId: principal.userId, label: principal.displayName }, phaseId, reason);
    redirect(`/studioflow/${projectId}/phases/${phaseId}`);
  });
}

// ── Supervision: start ────────────────────────────────────────────────────────

export async function startSupervisionAction(
  phaseId: string,
  projectId: string,
): Promise<ActionResult<never>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    await studioFlowService.startSupervision(grants, { kind: "USER", userId: principal.userId, label: principal.displayName }, phaseId);
    redirect(`/studioflow/${projectId}/phases/${phaseId}`);
  });
}

// ── Supervision: finish ───────────────────────────────────────────────────────

export async function finishSupervisionAction(
  phaseId: string,
  projectId: string,
): Promise<ActionResult<never>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    await studioFlowService.finishSupervision(grants, { kind: "USER", userId: principal.userId, label: principal.displayName }, phaseId);
    redirect(`/studioflow/${projectId}/phases/${phaseId}`);
  });
}

// ── Supervision: reopen ───────────────────────────────────────────────────────

export async function reopenSupervisionAction(
  phaseId: string,
  projectId: string,
  formData: FormData,
): Promise<ActionResult<never>> {
  return runSafeAction(async () => {
    const reason = String(formData.get("reason") ?? "").trim();
    const { principal, grants } = await requirePrincipalGrants();
    await studioFlowService.reopenSupervision(grants, { kind: "USER", userId: principal.userId, label: principal.displayName }, phaseId, reason);
    redirect(`/studioflow/${projectId}/phases/${phaseId}`);
  });
}

// ── Iteration: open ───────────────────────────────────────────────────────────

export async function openIterationAction(
  phaseId: string,
  projectId: string,
): Promise<ActionResult<never>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    await studioFlowService.openIteration(grants, { kind: "USER", userId: principal.userId, label: principal.displayName }, phaseId);
    redirect(`/studioflow/${projectId}/phases/${phaseId}`);
  });
}

// ── File: record ──────────────────────────────────────────────────────────────

export async function recordFileAction(
  projectId: string,
  phaseId: string,
  formData: FormData,
): Promise<ActionResult<never>> {
  return runSafeAction(async () => {
    const original_filename = String(formData.get("original_filename") ?? "").trim();
    const bytes = Number(formData.get("bytes") ?? 0);
    const folder_key = String(formData.get("folder_key") ?? "") || null;
    const file_modified_at_raw = formData.get("file_modified_at");
    const file_modified_at = file_modified_at_raw ? new Date(String(file_modified_at_raw)) : undefined;

    if (!original_filename) throw new Error("Nama file wajib diisi");
    if (!bytes || bytes <= 0) throw new Error("Ukuran file tidak valid");

    const { principal, grants } = await requirePrincipalGrants();
    await studioFlowService.recordFile(
      grants,
      { kind: "USER", userId: principal.userId, label: principal.displayName },
      { project_id: projectId, folder_key, original_filename, bytes, file_modified_at },
    );
    redirect(`/studioflow/${projectId}/phases/${phaseId}`);
  });
}
