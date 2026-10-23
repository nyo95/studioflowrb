import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { createPrivateObjectKey } from "@platform/core/storage";

import { discardObjects } from "../asset-cleanup";
import { STUDIOFLOW_IMAGE_TYPES } from "../domain/images";
import type { CommandContext, StudioFlowPorts } from "../shared";
import type { createScheduleService } from "./service";
import type { SnapshotInput } from "./sync";

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

export type ExternalPlacement = { projectId: string; entryId: string; optionId: string; code: string; label: string };

/**
 * Copies one image into a project's Schedule as a new item or an extra option, exactly once per `operationId`: the
 * receipt row makes a retry answer with the first result. The caller has already checked who may do this; the
 * Ideas bridge (an Ideas card) and the workspace service (a note image) share it so the copy semantics have one home.
 */
export async function placeExternalImageInSchedule(
  db: PrismaClient,
  ports: StudioFlowPorts,
  schedule: ReturnType<typeof createScheduleService>,
  input: CommandContext & {
    operationId: string;
    projectId: string;
    target: ExternalScheduleTarget;
    option: ExternalScheduleOption;
    source: { key: string; contentType: string };
    metadata?: Record<string, unknown>;
  },
): Promise<ExternalPlacement> {
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
}
