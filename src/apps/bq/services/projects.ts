import type { PermissionGrants } from "@platform/core/rbac";
import { requirePermission } from "@platform/core/rbac";
import { AppError } from "@platform/core/errors";
import type { BqProjectStatus } from "@/generated/prisma/client";

import { BQ_PERMISSIONS, fieldUnchanged, type BqServiceContext } from "./context";

export function createProjectLifecycleService(ctx: BqServiceContext) {
  const { db, runTransaction, auditWriter, requireEditableProject } = ctx;

  /**
   * Atomic guarded transition: the WHERE clause re-checks `status` in the
   * same statement as the write, so a check-then-act race between two calls
   * (e.g. a double-click) can never both apply their transition — the loser's
   * `updateMany` matches zero rows once the winner has committed. Mirrors
   * `transitionPromotionStatus` in `promotions.ts`.
   */
  async function transitionProjectStatus(
    id: string,
    expected: readonly BqProjectStatus[],
    status: BqProjectStatus,
  ): Promise<void> {
    const result = await db.bqProject.updateMany({
      where: { id, status: { in: expected as BqProjectStatus[] } },
      data: { status },
    });
    if (result.count === 0) {
      throw new AppError(
        "CONFLICT",
        "bq.project.status-changed",
        "This project's status changed before this action completed. Refresh and try again.",
      );
    }
  }

async function createProject(input: {
  grants: PermissionGrants;
  actor: { kind: string; userId?: string; label: string };
  title: string;
  clientName: string;
  externalRef?: string | null;
  notes?: string | null;
  templateId?: string;
}) {
  requirePermission(input.grants, BQ_PERMISSIONS.projectManage);
  return runTransaction(async (tx) => {
    const project = await tx.bqProject.create({
      data: {
        title: input.title,
        client_name: input.clientName,
        external_ref: input.externalRef ?? null,
        notes: input.notes ?? null,
        created_by: input.actor.userId ?? "system",
      },
    });

    if (input.templateId) {
      const template = await tx.bqTemplate.findUnique({
        where: { id: input.templateId },
        include: {
          sections: {
            orderBy: { sort_order: "asc" },
            include: {
              recommendations: { orderBy: { sort_order: "asc" } },
            },
          },
        },
      });

      if (!template) {
        throw new AppError("NOT_FOUND", "bq.template.not-found", "Template not found");
      }

      {
        const sectionIdMap = new Map<string, string>();

        for (const section of template.sections) {
          if (!section.parent_id) {
            const newSection = await tx.bqSection.create({
              data: {
                project_id: project.id,
                name: section.name,
                sort_order: section.sort_order,
              },
            });
            sectionIdMap.set(section.id, newSection.id);
          }
        }

        for (const section of template.sections) {
          if (section.parent_id) {
            const newParentId = sectionIdMap.get(section.parent_id);
            if (!newParentId) {
              throw new AppError(
                "CONFLICT",
                "bq.template.orphan-subsection",
                "Template contains a subsection whose parent section is missing",
              );
            }
            const newSubsection = await tx.bqSubsection.create({
              data: {
                section_id: newParentId,
                name: section.name,
                sort_order: section.sort_order,
              },
            });
            sectionIdMap.set(section.id, newSubsection.id);
          }
        }
      }
    }

    await auditWriter({
      appId: "bq",
      action: "bq.project.created",
      entityType: "BqProject",
      entityId: project.id,
      actor: input.actor,
    });

    return project;
  });
}

async function updateProject(input: {
  grants: PermissionGrants;
  actor: { kind: string; userId?: string; label: string };
  id: string;
  title?: string;
  clientName?: string;
  externalRef?: string | null;
  notes?: string | null;
}) {
  requirePermission(input.grants, BQ_PERMISSIONS.projectManage);
  await requireEditableProject(input.id);
  const existing = await db.bqProject.findUnique({ where: { id: input.id } });
  if (!existing) throw new AppError("NOT_FOUND", "bq.project.not-found", "Project not found");
  if (
    fieldUnchanged(input.title, existing.title)
    && fieldUnchanged(input.clientName, existing.client_name)
    && fieldUnchanged(input.externalRef, existing.external_ref)
    && fieldUnchanged(input.notes, existing.notes)
  ) return existing;
  const project = await db.bqProject.update({
    where: { id: input.id },
    data: {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.clientName !== undefined && { client_name: input.clientName }),
      ...(input.externalRef !== undefined && { external_ref: input.externalRef }),
      ...(input.notes !== undefined && { notes: input.notes }),
    },
  });
  await auditWriter({
    appId: "bq",
    action: "bq.project.updated",
    entityType: "BqProject",
    entityId: project.id,
    actor: input.actor,
  });
  return project;
}

async function lockProject(input: {
  grants: PermissionGrants;
  actor: { kind: string; userId?: string; label: string };
  id: string;
}) {
  requirePermission(input.grants, BQ_PERMISSIONS.projectManage);
  const existing = await db.bqProject.findUnique({ where: { id: input.id } });
  if (!existing) throw new AppError("NOT_FOUND", "bq.project.not-found", "Project not found");
  if (existing.status === "LOCKED") {
    throw new AppError("CONFLICT", "bq.project.already-locked", "Project is already locked");
  }
  if (existing.status === "ARCHIVED") {
    throw new AppError("CONFLICT", "bq.project.archived", "Cannot lock an archived project");
  }
  await transitionProjectStatus(input.id, ["ACTIVE"], "LOCKED");
  const project = await db.bqProject.findUniqueOrThrow({ where: { id: input.id } });
  await auditWriter({
    appId: "bq",
    action: "bq.project.locked",
    entityType: "BqProject",
    entityId: project.id,
    actor: input.actor,
  });
  return project;
}

async function unlockProject(input: {
  grants: PermissionGrants;
  actor: { kind: string; userId?: string; label: string };
  id: string;
}) {
  requirePermission(input.grants, BQ_PERMISSIONS.projectManage);
  const existing = await db.bqProject.findUnique({ where: { id: input.id } });
  if (!existing) throw new AppError("NOT_FOUND", "bq.project.not-found", "Project not found");
  if (existing.status !== "LOCKED") {
    throw new AppError("CONFLICT", "bq.project.not-locked", "Project is not locked");
  }
  await transitionProjectStatus(input.id, ["LOCKED"], "ACTIVE");
  const project = await db.bqProject.findUniqueOrThrow({ where: { id: input.id } });
  await auditWriter({
    appId: "bq",
    action: "bq.project.unlocked",
    entityType: "BqProject",
    entityId: project.id,
    actor: input.actor,
  });
  return project;
}

async function archiveProject(input: {
  grants: PermissionGrants;
  actor: { kind: string; userId?: string; label: string };
  id: string;
}) {
  requirePermission(input.grants, BQ_PERMISSIONS.projectManage);
  const existing = await db.bqProject.findUnique({ where: { id: input.id } });
  if (!existing) throw new AppError("NOT_FOUND", "bq.project.not-found", "Project not found");
  if (existing.status !== "ACTIVE") {
    throw new AppError(
      "CONFLICT",
      existing.status === "LOCKED" ? "bq.project.locked" : "bq.project.already-archived",
      existing.status === "LOCKED" ? "Unlock the project before archiving it" : "Project is already archived",
    );
  }
  await transitionProjectStatus(input.id, ["ACTIVE"], "ARCHIVED");
  const project = await db.bqProject.findUniqueOrThrow({ where: { id: input.id } });
  await auditWriter({
    appId: "bq",
    action: "bq.project.archived",
    entityType: "BqProject",
    entityId: project.id,
    actor: input.actor,
  });
  return project;
}

async function restoreProject(input: {
  grants: PermissionGrants;
  actor: { kind: string; userId?: string; label: string };
  id: string;
}) {
  requirePermission(input.grants, BQ_PERMISSIONS.projectManage);
  const existing = await db.bqProject.findUnique({ where: { id: input.id } });
  if (!existing) throw new AppError("NOT_FOUND", "bq.project.not-found", "Project not found");
  if (existing.status !== "ARCHIVED") {
    throw new AppError("CONFLICT", "bq.project.not-archived", "Project is not archived");
  }
  await transitionProjectStatus(input.id, ["ARCHIVED"], "ACTIVE");
  const project = await db.bqProject.findUniqueOrThrow({ where: { id: input.id } });
  await auditWriter({
    appId: "bq",
    action: "bq.project.restored",
    entityType: "BqProject",
    entityId: project.id,
    actor: input.actor,
  });
  return project;
}

async function requestProjectDeletion(input: {
  grants: PermissionGrants;
  actor: { kind: string; userId?: string; label: string };
  id: string;
  reason?: string;
}) {
  requirePermission(input.grants, BQ_PERMISSIONS.projectManage);
  const project = await db.bqProject.findUnique({ where: { id: input.id } });
  if (!project) throw new AppError("NOT_FOUND", "bq.project.not-found", "Project not found");
  if (project.status !== "ARCHIVED") {
    throw new AppError("CONFLICT", "bq.project.not-archived", "Archive the project before requesting permanent deletion");
  }
  const existing = await db.bqProjectDeletionRequest.findFirst({
    where: { project_id: project.id, status: "PENDING" },
  });
  if (existing) {
    throw new AppError("CONFLICT", "bq.project.deletion-pending", "A deletion request is already pending for this project");
  }
  const request = await db.bqProjectDeletionRequest.create({
    data: {
      project_id: project.id,
      project_title: project.title,
      requester_user_id: input.actor.userId ?? "system",
      requester_label: input.actor.label,
      reason: input.reason?.trim() || null,
    },
  });
  await auditWriter({
    appId: "bq",
    action: "bq.project.deletion-requested",
    entityType: "BqProject",
    entityId: project.id,
    actor: input.actor,
    changes: { requestId: request.id },
  });
  return request;
}

async function listProjectDeletionRequests(input: { grants: PermissionGrants }) {
  requirePermission(input.grants, BQ_PERMISSIONS.projectDeleteApprove);
  return db.bqProjectDeletionRequest.findMany({
    where: { status: "PENDING" },
    orderBy: { requested_at: "asc" },
  });
}

async function approveProjectDeletion(input: {
  grants: PermissionGrants;
  actor: { kind: string; userId?: string; label: string };
  requestId: string;
}) {
  requirePermission(input.grants, BQ_PERMISSIONS.projectDeleteApprove);
  const request = await db.bqProjectDeletionRequest.findUnique({ where: { id: input.requestId } });
  if (!request || request.status !== "PENDING") {
    throw new AppError("CONFLICT", "bq.project.deletion-not-pending", "Deletion request is no longer pending");
  }
  const project = await db.bqProject.findUnique({ where: { id: request.project_id } });
  if (!project) throw new AppError("NOT_FOUND", "bq.project.not-found", "Project not found");
  if (project.status !== "ARCHIVED") {
    throw new AppError("CONFLICT", "bq.project.not-archived", "Only an archived project can be permanently deleted");
  }
  const requestTransition = await db.bqProjectDeletionRequest.updateMany({
    where: { id: request.id, status: "PENDING" },
    data: {
      status: "APPROVED",
      approver_user_id: input.actor.userId ?? "system",
      approver_label: input.actor.label,
      decided_at: new Date(),
    },
  });
  if (requestTransition.count === 0) {
    throw new AppError("CONFLICT", "bq.project.deletion-not-pending", "Deletion request is no longer pending");
  }
  const deleted = await db.bqProject.deleteMany({ where: { id: project.id, status: "ARCHIVED" } });
  if (deleted.count === 0) {
    throw new AppError("CONFLICT", "bq.project.not-archived", "Only an archived project can be permanently deleted");
  }
  await auditWriter({
    appId: "bq",
    action: "bq.project.deleted",
    entityType: "BqProject",
    entityId: project.id,
    actor: input.actor,
    changes: { requestId: request.id },
  });
}

async function rejectProjectDeletion(input: {
  grants: PermissionGrants;
  actor: { kind: string; userId?: string; label: string };
  requestId: string;
  reason: string;
}) {
  requirePermission(input.grants, BQ_PERMISSIONS.projectDeleteApprove);
  const reason = input.reason.trim();
  if (!reason) throw new AppError("VALIDATION", "bq.project.deletion-reason-required", "A rejection reason is required");
  const request = await db.bqProjectDeletionRequest.findUnique({ where: { id: input.requestId } });
  if (!request || request.status !== "PENDING") {
    throw new AppError("CONFLICT", "bq.project.deletion-not-pending", "Deletion request is no longer pending");
  }
  const requestTransition = await db.bqProjectDeletionRequest.updateMany({
    where: { id: request.id, status: "PENDING" },
    data: {
      status: "REJECTED",
      approver_user_id: input.actor.userId ?? "system",
      approver_label: input.actor.label,
      decided_at: new Date(),
      reason,
    },
  });
  if (requestTransition.count === 0) {
    throw new AppError("CONFLICT", "bq.project.deletion-not-pending", "Deletion request is no longer pending");
  }
  await auditWriter({
    appId: "bq",
    action: "bq.project.deletion-rejected",
    entityType: "BqProject",
    entityId: request.project_id,
    actor: input.actor,
    changes: { requestId: request.id, reason },
  });
}


  return {
    createProject,
    updateProject,
    lockProject,
    unlockProject,
    archiveProject,
    restoreProject,
    requestProjectDeletion,
    listProjectDeletionRequests,
    approveProjectDeletion,
    rejectProjectDeletion,
  };
}
