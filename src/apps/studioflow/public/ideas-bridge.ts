import "server-only";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { createPrivateObjectKey } from "@platform/core/storage";

import { discardObjects } from "../asset-cleanup";
import { STUDIOFLOW_IMAGE_TYPES } from "../domain/images";
import { scheduleCode } from "../domain/schedule";
import { createScheduleService } from "../schedule/service";
import type { SnapshotInput } from "../schedule/sync";
import { hasPermission, invalid, P, projectAccessFromFacts, requireCommand, requirePermission, type CommandContext, type StudioFlowPorts } from "../shared";

export type ExternalScheduleTarget =
  | { kind: "new-item"; section: string; category: string; qty?: string | null; unit?: string | null; location?: string | null }
  | { kind: "option"; entryId: string };

export type ExternalScheduleOption = {
  productName: string;
  brandName?: string | null;
  color?: string | null;
  pattern?: string | null;
  finishing?: string | null;
  dimension?: string | null;
  notes?: string | null;
};

export type StudioFlowIdeasBridge = ReturnType<typeof createStudioFlowIdeasBridge>;

/** The complete StudioFlow surface Ideas may use. No Prisma row or transaction crosses this door. */
export function createStudioFlowIdeasBridge(db: PrismaClient, ports: StudioFlowPorts) {
  const schedule = createScheduleService(db, ports);

  return {
    async listWritableScheduleTargets(input: CommandContext) {
      const userId = requireCommand(input, P.ideasManage);
      if (!hasPermission(input.grants, P.scheduleManage)) return [];
      const override = hasPermission(input.grants, P.projectOverride);
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

    async readPhaseNoteImageSource(input: CommandContext & { projectId: string; phaseId: string; imageId: string }) {
      requireCommand(input, P.ideasManage);
      requirePermission(input.grants, P.projectRead);
      const image = await db.sfPhaseNoteImage.findFirst({
        where: { id: input.imageId, note: { phase_id: input.phaseId, phase: { project_id: input.projectId } } },
        select: { id: true, storage_key: true, content_type: true, bytes: true, note: { select: { phase: { select: { project: { select: { name: true } } } } } } },
      });
      if (!image) throw invalid("NOTE_IMAGE_NOT_FOUND", "This note image no longer exists.");
      return { id: image.id, key: image.storage_key, contentType: image.content_type, bytes: image.bytes, projectName: image.note.phase.project.name };
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
      const previous = await db.sfExternalSchedulePlacement.findUnique({ where: { operation_id: input.operationId } });
      if (previous?.entry_id && previous.option_id && previous.code && previous.label) {
        return { projectId: previous.project_id, entryId: previous.entry_id, optionId: previous.option_id, code: previous.code, label: previous.label };
      }

      const extension = STUDIOFLOW_IMAGE_TYPES[input.source.contentType] ?? "png";
      const key = createPrivateObjectKey(`studioflow/schedule/${input.projectId}`, extension);
      await ports.storage.copy({ fromKey: input.source.key, toKey: key });
      try {
        return await ports.runTransaction(async (tx) => {
          await tx.sfExternalSchedulePlacement.create({ data: { operation_id: input.operationId, project_id: input.projectId } });
          const snapshot: SnapshotInput = { ...input.option, brandId: null, imageKey: key };
          const created = input.target.kind === "new-item"
            ? await schedule.writer.createEntry(tx, { actor: input.actor, projectId: input.projectId, section: input.target.section, category: input.target.category, qty: input.target.qty, unit: input.target.unit, location: input.target.location, snapshot, metadata: input.metadata })
            : await schedule.writer.createOption(tx, { actor: input.actor, projectId: input.projectId, entryId: input.target.entryId, snapshot, metadata: input.metadata });
          const placed = { projectId: input.projectId, entryId: created.entryId, optionId: created.optionId!, code: created.code, label: created.label! };
          await tx.sfExternalSchedulePlacement.update({ where: { operation_id: input.operationId }, data: { entry_id: placed.entryId, option_id: placed.optionId, code: placed.code, label: placed.label } });
          return placed;
        });
      } catch (error) {
        await discardObjects(db, ports.storage, [key]);
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          const receipt = await db.sfExternalSchedulePlacement.findUnique({ where: { operation_id: input.operationId } });
          if (receipt?.entry_id && receipt.option_id && receipt.code && receipt.label) {
            return { projectId: receipt.project_id, entryId: receipt.entry_id, optionId: receipt.option_id, code: receipt.code, label: receipt.label };
          }
        }
        throw error;
      }
    },
  };
}
