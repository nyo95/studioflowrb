import { AsyncLocalStorage } from "node:async_hooks";

import type { PermissionGrants } from "@platform/core/rbac";
import type { PrismaClient } from "@/generated/prisma/client";
import type { AuditActor, AuditWriter } from "@platform/core/audit";
import { prepareAuditEvent } from "@platform/core/audit";
import { AppError } from "@platform/core/errors";
import { compareDecimals, toDecimalString } from "@platform/utilities/decimal";

export type BqKategori =
  | "MATERIAL"
  | "UPAH"
  | "MATERIAL_UPAH"
  | "BIAYA_UMUM"
  | "TRANSPORTASI_AKOMODASI"
  | "ALAT";

export const BQ_PERMISSIONS = {
  access: "bq.access",
  projectRead: "bq.project.read",
  projectManage: "bq.project.manage",
  projectDeleteApprove: "bq.project-deletion.approve",
  libraryRead: "bq.library.read",
  libraryManage: "bq.library.manage",
  libraryPromote: "bq.library.promote",
} as const;

export function requireKategori(value: string): BqKategori {
  const allowed: readonly BqKategori[] = ["MATERIAL", "UPAH", "MATERIAL_UPAH", "BIAYA_UMUM", "TRANSPORTASI_AKOMODASI", "ALAT"];
  if (!allowed.includes(value as BqKategori)) {
    throw new AppError("VALIDATION", "bq.kategori.invalid", "Invalid BQ category");
  }
  return value as BqKategori;
}

export function decimalFieldUnchanged(value: string | null | undefined, current: { toString(): string } | null): boolean {
  if (value === undefined) return true;
  if (value === null || current === null) return value === null && current === null;
  return toDecimalString(value) === current.toString();
}

type StrictEqualityScalar = string | number | boolean | bigint | symbol | null;

/** Scalar-only by design; collections and structured values require an explicit comparator. */
export function fieldUnchanged<T extends StrictEqualityScalar>(value: T | undefined, current: T): boolean {
  return value === undefined || value === current;
}

export function requirePositiveCoefficient(value: string): string {
  const normalized = toDecimalString(value);
  if (compareDecimals(normalized, toDecimalString("0")) <= 0) {
    throw new AppError("VALIDATION", "bq.koefisien.not-positive", "Coefficient must be greater than zero");
  }
  return normalized;
}

type AuditInput = {
  appId: string;
  action: string;
  entityType: string;
  entityId: string;
  actor: { kind: string; userId?: string; label: string };
  changes?: Record<string, unknown>;
};

export type BqServiceDeps = {
  auditWriter: AuditWriter;
  runTransaction: <T>(fn: (tx: PrismaClient) => Promise<T>) => Promise<T>;
};

export type BqServiceContext = {
  db: PrismaClient;
  runTransaction: <T>(work: (tx: PrismaClient) => Promise<T>) => Promise<T>;
  auditWriter: (input: AuditInput) => Promise<void>;
  requireEditableProject: (projectId: string) => Promise<void>;
  requireEditableProjectForSection: (sectionId: string) => Promise<void>;
  requireEditableProjectForSubsection: (subsectionId: string) => Promise<void>;
  requireEditableProjectForItem: (itemId: string) => Promise<void>;
  requireEditableProjectForLineItem: (lineItemId: string) => Promise<void>;
  requireEditableProjectForSubObject: (subObjectId: string) => Promise<string>;
};

export function createBqServiceContext(rootDb: PrismaClient, deps: BqServiceDeps): BqServiceContext {
  const transactionStore = new AsyncLocalStorage<PrismaClient>();
  const db = new Proxy(rootDb, {
    get(target, property, receiver) {
      const client = transactionStore.getStore() ?? target;
      const value = Reflect.get(client, property, receiver);
      return typeof value === "function" ? value.bind(client) : value;
    },
  }) as PrismaClient;
  const runTransaction = <T>(work: (tx: PrismaClient) => Promise<T>): Promise<T> => {
    const current = transactionStore.getStore();
    return current
      ? work(current)
      : deps.runTransaction((tx) => transactionStore.run(tx, () => work(tx)));
  };
  const auditWriter = async (input: AuditInput): Promise<void> => {
    const tx = transactionStore.getStore();
    if (!tx) throw new Error("BQ audit writes require the active business transaction.");
    await deps.auditWriter.write(
      prepareAuditEvent({
        appId: "bq",
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        actor: input.actor as AuditActor,
        metadata: input.changes,
      }),
      tx,
    );
  };

  async function requireEditableProject(projectId: string): Promise<void> {
    const project = await db.bqProject.findUnique({ where: { id: projectId } });
    if (!project) throw new AppError("NOT_FOUND", "bq.project.not-found", "Project not found");
    if (project.status === "LOCKED") {
      throw new AppError("CONFLICT", "bq.project.locked", "Cannot edit a locked project");
    }
    if (project.status === "ARCHIVED") {
      throw new AppError("CONFLICT", "bq.project.archived", "Cannot edit an archived project");
    }
  }

  async function requireEditableProjectForSection(sectionId: string): Promise<void> {
    const section = await db.bqSection.findUnique({ where: { id: sectionId }, select: { project_id: true } });
    if (!section) throw new AppError("NOT_FOUND", "bq.section.not-found", "Section not found");
    await requireEditableProject(section.project_id);
  }

  async function requireEditableProjectForSubsection(subsectionId: string): Promise<void> {
    const subsection = await db.bqSubsection.findUnique({
      where: { id: subsectionId },
      select: { section: { select: { project_id: true } } },
    });
    if (!subsection) throw new AppError("NOT_FOUND", "bq.subsection.not-found", "Subsection not found");
    await requireEditableProject(subsection.section.project_id);
  }

  async function requireEditableProjectForItem(itemId: string): Promise<void> {
    const item = await db.bqItem.findUnique({
      where: { id: itemId },
      select: {
        section: { select: { project_id: true } },
        subsection: { select: { section: { select: { project_id: true } } } },
      },
    });
    if (!item) throw new AppError("NOT_FOUND", "bq.item.not-found", "Work Item not found");
    const projectId = item.section?.project_id ?? item.subsection?.section.project_id;
    if (!projectId) {
      throw new AppError("CONFLICT", "bq.item.invalid-parent", "Work Item does not belong to a project Section");
    }
    await requireEditableProject(projectId);
  }

  async function requireEditableProjectForLineItem(lineItemId: string): Promise<void> {
    const lineItem = await db.bqLineItem.findUnique({
      where: { id: lineItemId },
      select: { item_id: true, sub_object: { select: { item_id: true } } },
    });
    if (!lineItem) throw new AppError("NOT_FOUND", "bq.line-item.not-found", "Cost Component not found");
    const itemId = lineItem.item_id ?? lineItem.sub_object?.item_id;
    if (!itemId) {
      throw new AppError("CONFLICT", "bq.line-item.invalid-parent", "Cost Component does not belong to a Work Item");
    }
    await requireEditableProjectForItem(itemId);
  }

  async function requireEditableProjectForSubObject(subObjectId: string): Promise<string> {
    const subObject = await db.bqSubObject.findUnique({
      where: { id: subObjectId },
      select: { item_id: true },
    });
    if (!subObject) throw new AppError("NOT_FOUND", "bq.sub-object.not-found", "Component Group not found");
    await requireEditableProjectForItem(subObject.item_id);
    return subObject.item_id;
  }

  return {
    db,
    runTransaction,
    auditWriter,
    requireEditableProject,
    requireEditableProjectForSection,
    requireEditableProjectForSubsection,
    requireEditableProjectForItem,
    requireEditableProjectForLineItem,
    requireEditableProjectForSubObject,
  };
}
