import type { PrismaClient } from "@/generated/prisma/client";
import type { AuditActor } from "@platform/core/audit";
import type { StudioFlowPorts } from "../shared";
import { writeAudit } from "../shared";

/** Trusted app-to-app command. Authorization belongs to the Master Data coordinator. */
export function createStudioFlowSampleRequestCommand(db: PrismaClient, ports: StudioFlowPorts) {
  return {
    async markSampleReceivedFromShelf(input: { actor: AuditActor; requestId: string; rack: string; box: string }): Promise<{ updated: boolean; reason?: "ALREADY_RECEIVED" | "REQUEST_MISSING" | "PROJECT_ARCHIVED" }> {
      return ports.runTransaction(async (tx) => {
        const request = await tx.sfScheduleSampleRequest.findUnique({ where: { id: input.requestId }, include: { option: { include: { entry: { include: { project: true } } } } } });
        if (!request) return { updated: false, reason: "REQUEST_MISSING" };
        if (request.option.entry.project.archived_at) return { updated: false, reason: "PROJECT_ARCHIVED" };
        if (request.status !== "REQUESTED") return { updated: false, reason: "ALREADY_RECEIVED" };
        const note = `On the shelf: ${input.rack} / ${input.box} (Master Data)`;
        await tx.sfScheduleSampleRequest.update({ where: { id: request.id }, data: { status: "RECEIVED", received_by_id: input.actor.userId, received_by_name: input.actor.label, received_at: new Date(), received_note: note } });
        await writeAudit(ports, tx, { action: "studioflow.schedule.sample-received", entityType: "schedule_option", entityId: request.option_id, actor: input.actor, metadata: { via: "masterdata", projectId: request.option.entry.project_id, entryId: request.option.entry_id, label: request.option.label } });
        return { updated: true };
      });
    },
    async listProjectChoices(): Promise<Array<{ id: string; name: string }>> { return db.sfProject.findMany({ where: { archived_at: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }); },
  };
}
export type StudioFlowSampleRequestCommand = ReturnType<typeof createStudioFlowSampleRequestCommand>;
