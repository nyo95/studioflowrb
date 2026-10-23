import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";

import { scheduleCode } from "../domain/schedule";
import { placeExternalImageInSchedule, type ExternalScheduleOption, type ExternalScheduleTarget } from "../schedule/external-placement";
import { createScheduleService } from "../schedule/service";
import { hasPermission, hasProjectAssignmentOverride, P, projectAccessFromFacts, readNoteImageObject, requireBookAccess, requireCommand, requirePermission, type CommandContext, type StudioFlowPorts } from "../shared";

export type { ExternalScheduleOption, ExternalScheduleTarget };

export type StudioFlowIdeasBridge = ReturnType<typeof createStudioFlowIdeasBridge>;

/** The complete StudioFlow surface Ideas may use. No Prisma row or transaction crosses this door. */
export function createStudioFlowIdeasBridge(db: PrismaClient, ports: StudioFlowPorts) {
  const schedule = createScheduleService(db, ports);

  return {
    async listWritableScheduleTargets(input: CommandContext) {
      const userId = requireCommand(input, P.ideasManage);
      if (!hasPermission(input.grants, P.scheduleManage)) return [];
      const override = hasProjectAssignmentOverride(input.grants);
      const projects = await db.sfProject.findMany({
        where: { archived_at: null, status: { not: "COMPLETED" }, ...(override ? {} : { OR: [{ pic_designer_id: userId }, { pic_drafter_id: userId }] }) },
        orderBy: { name: "asc" },
        select: { id: true, name: true, status: true, pic_designer_id: true, pic_drafter_id: true },
      });
      return projects
        .filter((project) => projectAccessFromFacts({ ...project, phases: [] }, { grants: input.grants, actorId: userId }).canEditDocuments)
        .map(({ id, name }) => ({ id, name }));
    },

    async listSchedulePlacementEntries(input: CommandContext & { projectId: string }) {
      requirePermission(input.grants, P.ideasManage);
      await schedule.writer.requireAccess(input);
      const entries = await db.sfScheduleEntry.findMany({
        where: { project_id: input.projectId },
        orderBy: [{ section: "asc" }, { category_key: "asc" }, { increment: "asc" }],
        select: { id: true, section: true, category: true, prefix: true, increment: true, options: { select: { label: true, product_name: true, is_final: true }, orderBy: { label: "asc" } } },
      });
      return entries.map((entry) => ({
        id: entry.id,
        section: entry.section,
        category: entry.category,
        code: scheduleCode(entry.prefix, entry.increment),
        productName: (entry.options.find((option) => option.is_final) ?? entry.options[0])?.product_name ?? null,
        options: entry.options.length,
      }));
    },

    async listScheduleCategoryChoices(input: CommandContext) {
      requirePermission(input.grants, P.ideasManage);
      return schedule.listCategoryChoices({ grants: input.grants });
    },

    async resolveScheduleUsages(input: CommandContext & { optionIds: string[] }) {
      requireCommand(input, P.ideasManage);
      if (input.optionIds.length === 0) return [];
      const options = await db.sfScheduleOption.findMany({
        where: { id: { in: [...new Set(input.optionIds)] } },
        select: { id: true, label: true, entry: { select: { id: true, prefix: true, increment: true, project: { select: { id: true, name: true } } } } },
      });
      return options.map((option) => ({
        optionId: option.id,
        projectId: option.entry.project.id,
        projectName: option.entry.project.name,
        entryId: option.entry.id,
        code: scheduleCode(option.entry.prefix, option.entry.increment),
        label: option.label,
      }));
    },

    /** An image element on the project's Workspace (the phase, when given, must be its phase label). Ids of former card images are kept. */
    async readWorkspaceImageSource(input: CommandContext & { projectId: string; phaseId?: string | null; imageId: string }) {
      const actorId = requireCommand(input, P.ideasManage);
      requirePermission(input.grants, P.projectRead);
      // Saving to Ideas copies the image out of the book, so it takes a book reader (PIC or invited member).
      await requireBookAccess(db, { ...input, actorId });
      return readNoteImageObject(db, { ...input, actorId });
    },

    async placeExternalImageInSchedule(input: CommandContext & {
      operationId: string;
      projectId: string;
      target: ExternalScheduleTarget;
      option: ExternalScheduleOption;
      source: { key: string; contentType: string };
      metadata?: Record<string, unknown>;
    }) {
      requirePermission(input.grants, P.ideasManage);
      await schedule.writer.requireAccess(input);
      return placeExternalImageInSchedule(db, ports, schedule, input);
    },
  };
}
