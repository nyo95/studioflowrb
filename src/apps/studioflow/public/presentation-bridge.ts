import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import { AppError } from "@platform/core/errors";

import { scheduleCode } from "../domain/schedule";
import {
  P,
  assertProjectWritable,
  getProjectAccess,
  invalid,
  notFound,
  requireCommand,
  requirePermission,
  requireProjectAccess,
  requireRead,
  type CommandContext,
  type ReadContext,
} from "../shared";

export type PresentationReadContext = ReadContext & { actorId: string };
export type StudioFlowPresentationBridge = ReturnType<typeof createStudioFlowPresentationBridge>;

/** StudioFlow-owned project and Schedule facts exposed to Presentation. */
export function createStudioFlowPresentationBridge(db: PrismaClient) {
  async function readProjectDocumentContext(input: PresentationReadContext & { projectId: string }) {
    requireRead(input.grants);
    const project = await db.sfProject.findUnique({
      where: { id: input.projectId },
      select: { id: true, name: true, status: true, archived_at: true },
    });
    if (!project) throw new AppError("NOT_FOUND", "PROJECT_NOT_FOUND", "This project no longer exists.");
    const access = await getProjectAccess(db, input);
    return {
      id: project.id,
      name: project.name,
      archivedAt: project.archived_at,
      completed: project.status === "COMPLETED",
      access,
    };
  }

  return {
    readProjectDocumentContext,

    /** An image element on a project's Workspace, exposed to Presentation without going through Ideas. */
    async readWorkspaceImageSource(input: CommandContext & { projectId: string; phaseId?: string | null; imageId: string }) {
      requireCommand(input, P.presentationManage);
      requirePermission(input.grants, P.projectRead);
      const image = await db.sfWorkspaceCard.findFirst({
        where: { id: input.imageId, kind: "IMAGE", project_id: input.projectId, ...(input.phaseId ? { phase_id: input.phaseId } : {}) },
        select: { id: true, storage_key: true, content_type: true },
      });
      if (!image?.storage_key || !image.content_type) throw invalid("NOTE_IMAGE_NOT_FOUND", "This note image no longer exists.");
      return { key: image.storage_key, contentType: image.content_type };
    },

    async requireProjectDocumentWrite(input: CommandContext & { projectId: string }) {
      const actorId = requireCommand(input, P.presentationManage);
      await requireProjectAccess(db, { ...input, actorId, kind: "document" });
      const project = await db.sfProject.findUnique({ where: { id: input.projectId }, select: { archived_at: true, status: true } });
      if (!project) throw notFound("project");
      assertProjectWritable(project);
      return { actorId };
    },

    async listPresentationScheduleChoices(input: PresentationReadContext & { projectId: string }) {
      await readProjectDocumentContext(input);
      const entries = await db.sfScheduleEntry.findMany({
        where: { project_id: input.projectId },
        orderBy: [{ section: "asc" }, { category_key: "asc" }, { increment: "asc" }],
        include: { options: { orderBy: { label: "asc" } } },
      });
      return entries.map((entry) => {
        const option = entry.options.find((row) => row.is_final) ?? entry.options[0] ?? null;
        return { id: entry.id, code: scheduleCode(entry.prefix, entry.increment), productName: option?.product_name ?? null };
      });
    },

    async resolvePresentationScheduleLinks(input: PresentationReadContext & { projectId: string; entryIds: string[] }) {
      await readProjectDocumentContext(input);
      if (input.entryIds.length === 0) return [];
      const entries = await db.sfScheduleEntry.findMany({
        where: { project_id: input.projectId, id: { in: [...new Set(input.entryIds)] } },
        include: { options: { orderBy: { label: "asc" } } },
      });
      return entries.map((entry) => {
        const option = entry.options.find((row) => row.is_final) ?? entry.options[0] ?? null;
        return { entryId: entry.id, code: scheduleCode(entry.prefix, entry.increment), productName: option?.product_name ?? null };
      });
    },

    /** Trusted lifecycle fact for Presentation maintenance; no user or project data crosses the boundary. */
    async listExistingPresentationScheduleEntryIds(entryIds: string[]) {
      const ids = [...new Set(entryIds)];
      if (ids.length > 100) throw new Error("Presentation Schedule-link maintenance batch exceeds 100 entries.");
      if (ids.length === 0) return [];
      const entries = await db.sfScheduleEntry.findMany({ where: { id: { in: ids } }, select: { id: true } });
      return entries.map((entry) => entry.id);
    },
  };
}
