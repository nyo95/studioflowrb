import { z } from "zod";

import { requirePrincipalGrants } from "@platform/core/auth";
import { AppError, toSafeErrorPayload } from "@platform/core/errors";
import { studioFlow } from "@/apps/studioflow/runtime";

const Id = z.uuid();

function statusFor(kind: string): number {
  return kind === "VALIDATION" ? 400 : kind === "UNAUTHENTICATED" ? 401 : kind === "FORBIDDEN" ? 403 : kind === "NOT_FOUND" ? 404 : kind === "CONFLICT" ? 409 : 500;
}

/** Plain streamed PUT for files that cannot pass through the Server Action body cap. */
export async function PUT(request: Request) {
  try {
    const { principal, grants } = await requirePrincipalGrants();
    const projectId = Id.parse(request.headers.get("x-studioflow-project-id"));
    const phaseId = Id.parse(request.headers.get("x-studioflow-phase-id"));
    const name = request.headers.get("x-studioflow-file-name") ?? "";
    const contentType = (request.headers.get("content-type") ?? "").split(";", 1)[0].trim();
    const declaredBytes = Number(request.headers.get("content-length"));
    if (!Number.isSafeInteger(declaredBytes) || declaredBytes <= 0) throw new AppError("VALIDATION", "DELIVERABLE_LENGTH_REQUIRED", "The upload must include its file size.");
    if (!request.body) throw new AppError("VALIDATION", "DELIVERABLE_FILE_REQUIRED", "Choose a file.");
    const result = await studioFlow.phases.uploadDeliverableStream({
      grants,
      actor: { kind: "USER", userId: principal.userId, label: principal.displayName },
      projectId,
      phaseId,
      name,
      contentType,
      declaredBytes,
      stream: request.body,
    });
    return Response.json({ ok: true, data: result });
  } catch (error) {
    const payload = toSafeErrorPayload(error, { reportUnknownError: () => undefined });
    return Response.json({ ok: false, error: payload }, { status: statusFor(payload.kind) });
  }
}
