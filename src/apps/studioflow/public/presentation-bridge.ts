import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import { AppError } from "@platform/core/errors";

import { scheduleCode } from "../domain/schedule";
import {
  P,
  assertProjectWritable,
  getProjectAccess,
  notFound,
  requireCommand,
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
  };
}
