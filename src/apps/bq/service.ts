import { AsyncLocalStorage } from "node:async_hooks";

import type { PermissionGrants } from "@platform/core/rbac";
import type { PrismaClient } from "@/generated/prisma/client";
import type { AuditActor, AuditWriter } from "@platform/core/audit";
import { prepareAuditEvent } from "@platform/core/audit";
import { requirePermission, hasAnyPermission } from "@platform/core/rbac";
import { AppError } from "@platform/core/errors";
import { compareDecimals, toDecimalString } from "@platform/utilities/decimal";

type BqKategori =
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
  libraryPromoteApprove: "masterdata.promotion.approve",
} as const;

function requireKategori(value: string): BqKategori {
  const allowed: readonly BqKategori[] = ["MATERIAL", "UPAH", "MATERIAL_UPAH", "BIAYA_UMUM", "TRANSPORTASI_AKOMODASI", "ALAT"];
  if (!allowed.includes(value as BqKategori)) {
    throw new AppError("VALIDATION", "bq.kategori.invalid", "Invalid BQ category");
  }
  return value as BqKategori;
}

type AuditInput = {
  appId: string;
  action: string;
  entityType: string;
  entityId: string;
  actor: { kind: string; userId?: string; label: string };
  changes?: Record<string, unknown>;
};

type BqServiceDeps = {
  auditWriter: AuditWriter;
  runTransaction: <T>(fn: (tx: PrismaClient) => Promise<T>) => Promise<T>;
};

export function createBqService(rootDb: PrismaClient, deps: BqServiceDeps) {
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

  /**
   * Resolves the owning project of an L1 and refuses a locked one. Every
   * structural write below routes through this: an item, sub-object, or line
   * item whose parent chain is broken is a CONFLICT, never a silently skipped
   * lock check.
   */
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

  // ─── LIBRARY ITEMS ──────────────────────────────────────────

  async function createLibMaterial(input: {
    grants: PermissionGrants;
    actor: { kind: string; userId?: string; label: string };
    name: string;
    purchaseUnit: string;
    baseUnit?: string;
    harga: string;
    currency: string;
    defaultKoefisien?: string;
    notes?: string;
  }) {
    requirePermission(input.grants, BQ_PERMISSIONS.libraryManage);
    const item = await db.bqLibMaterial.create({
      data: {
        name: input.name,
        purchase_unit: input.purchaseUnit,
        base_unit: input.baseUnit ?? null,
        harga: input.harga,
        currency: input.currency,
        default_koefisien: input.defaultKoefisien ?? "1",
        kategori: "MATERIAL",
        notes: input.notes ?? null,
        created_by: input.actor.userId ?? "system",
      },
    });
    await auditWriter({
      appId: "bq",
      action: "bq.lib-material.created",
      entityType: "BqLibMaterial",
      entityId: item.id,
      actor: input.actor,
    });
    return item;
  }

  async function updateLibMaterial(input: {
    grants: PermissionGrants;
    actor: { kind: string; userId?: string; label: string };
    id: string;
    name?: string;
    purchaseUnit?: string;
    baseUnit?: string;
    harga?: string;
    currency?: string;
    defaultKoefisien?: string;
    notes?: string;
  }) {
    requirePermission(input.grants, BQ_PERMISSIONS.libraryManage);
    const existing = await db.bqLibMaterial.findUnique({ where: { id: input.id } });
    if (!existing) throw new AppError("NOT_FOUND", "bq.lib-material.not-found", "Library material not found");
    const item = await db.bqLibMaterial.update({
      where: { id: input.id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.purchaseUnit !== undefined && { purchase_unit: input.purchaseUnit }),
        ...(input.baseUnit !== undefined && { base_unit: input.baseUnit }),
        ...(input.harga !== undefined && { harga: input.harga }),
        ...(input.currency !== undefined && { currency: input.currency }),
        ...(input.defaultKoefisien !== undefined && { default_koefisien: input.defaultKoefisien }),
        ...(input.notes !== undefined && { notes: input.notes }),
      },
    });
    await auditWriter({
      appId: "bq",
      action: "bq.lib-material.updated",
      entityType: "BqLibMaterial",
      entityId: item.id,
      actor: input.actor,
    });
    return item;
  }

  async function deleteLibMaterial(input: {
    grants: PermissionGrants;
    actor: { kind: string; userId?: string; label: string };
    id: string;
  }) {
    requirePermission(input.grants, BQ_PERMISSIONS.libraryManage);
    await db.bqLibMaterial.delete({ where: { id: input.id } });
    await auditWriter({
      appId: "bq",
      action: "bq.lib-material.deleted",
      entityType: "BqLibMaterial",
      entityId: input.id,
      actor: input.actor,
    });
  }

  async function createLibLabor(input: {
    grants: PermissionGrants;
    actor: { kind: string; userId?: string; label: string };
    name: string;
    purchaseUnit: string;
    baseUnit?: string;
    harga: string;
    currency: string;
    defaultKoefisien?: string;
    notes?: string;
  }) {
    requirePermission(input.grants, BQ_PERMISSIONS.libraryManage);
    const item = await db.bqLibLabor.create({
      data: {
        name: input.name,
        purchase_unit: input.purchaseUnit,
        base_unit: input.baseUnit ?? null,
        harga: input.harga,
        currency: input.currency,
        default_koefisien: input.defaultKoefisien ?? "1",
        kategori: "UPAH",
        notes: input.notes ?? null,
        created_by: input.actor.userId ?? "system",
      },
    });
    await auditWriter({
      appId: "bq",
      action: "bq.lib-labor.created",
      entityType: "BqLibLabor",
      entityId: item.id,
      actor: input.actor,
    });
    return item;
  }

  async function updateLibLabor(input: {
    grants: PermissionGrants;
    actor: { kind: string; userId?: string; label: string };
    id: string;
    name?: string;
    purchaseUnit?: string;
    baseUnit?: string;
    harga?: string;
    currency?: string;
    defaultKoefisien?: string;
    notes?: string;
  }) {
    requirePermission(input.grants, BQ_PERMISSIONS.libraryManage);
    const existing = await db.bqLibLabor.findUnique({ where: { id: input.id } });
    if (!existing) throw new AppError("NOT_FOUND", "bq.lib-labor.not-found", "Library labor not found");
    const item = await db.bqLibLabor.update({
      where: { id: input.id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.purchaseUnit !== undefined && { purchase_unit: input.purchaseUnit }),
        ...(input.baseUnit !== undefined && { base_unit: input.baseUnit }),
        ...(input.harga !== undefined && { harga: input.harga }),
        ...(input.currency !== undefined && { currency: input.currency }),
        ...(input.defaultKoefisien !== undefined && { default_koefisien: input.defaultKoefisien }),
        ...(input.notes !== undefined && { notes: input.notes }),
      },
    });
    await auditWriter({
      appId: "bq",
      action: "bq.lib-labor.updated",
      entityType: "BqLibLabor",
      entityId: item.id,
      actor: input.actor,
    });
    return item;
  }

  async function deleteLibLabor(input: {
    grants: PermissionGrants;
    actor: { kind: string; userId?: string; label: string };
    id: string;
  }) {
    requirePermission(input.grants, BQ_PERMISSIONS.libraryManage);
    await db.bqLibLabor.delete({ where: { id: input.id } });
    await auditWriter({
      appId: "bq",
      action: "bq.lib-labor.deleted",
      entityType: "BqLibLabor",
      entityId: input.id,
      actor: input.actor,
    });
  }

  async function createLibMaterialLabor(input: {
    grants: PermissionGrants;
    actor: { kind: string; userId?: string; label: string };
    name: string;
    purchaseUnit: string;
    baseUnit?: string;
    harga: string;
    currency: string;
    defaultKoefisien?: string;
    notes?: string;
  }) {
    requirePermission(input.grants, BQ_PERMISSIONS.libraryManage);
    const item = await db.bqLibMaterialLabor.create({
      data: {
        name: input.name,
        purchase_unit: input.purchaseUnit,
        base_unit: input.baseUnit ?? null,
        harga: input.harga,
        currency: input.currency,
        default_koefisien: input.defaultKoefisien ?? "1",
        kategori: "MATERIAL_UPAH",
        notes: input.notes ?? null,
        created_by: input.actor.userId ?? "system",
      },
    });
    await auditWriter({
      appId: "bq",
      action: "bq.lib-material-labor.created",
      entityType: "BqLibMaterialLabor",
      entityId: item.id,
      actor: input.actor,
    });
    return item;
  }

  async function updateLibMaterialLabor(input: {
    grants: PermissionGrants;
    actor: { kind: string; userId?: string; label: string };
    id: string;
    name?: string;
    purchaseUnit?: string;
    baseUnit?: string;
    harga?: string;
    currency?: string;
    defaultKoefisien?: string;
    notes?: string;
  }) {
    requirePermission(input.grants, BQ_PERMISSIONS.libraryManage);
    const existing = await db.bqLibMaterialLabor.findUnique({ where: { id: input.id } });
    if (!existing) throw new AppError("NOT_FOUND", "bq.lib-material-labor.not-found", "Library material+labor not found");
    const item = await db.bqLibMaterialLabor.update({
      where: { id: input.id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.purchaseUnit !== undefined && { purchase_unit: input.purchaseUnit }),
        ...(input.baseUnit !== undefined && { base_unit: input.baseUnit }),
        ...(input.harga !== undefined && { harga: input.harga }),
        ...(input.currency !== undefined && { currency: input.currency }),
        ...(input.defaultKoefisien !== undefined && { default_koefisien: input.defaultKoefisien }),
        ...(input.notes !== undefined && { notes: input.notes }),
      },
    });
    await auditWriter({
      appId: "bq",
      action: "bq.lib-material-labor.updated",
      entityType: "BqLibMaterialLabor",
      entityId: item.id,
      actor: input.actor,
    });
    return item;
  }

  async function deleteLibMaterialLabor(input: {
    grants: PermissionGrants;
    actor: { kind: string; userId?: string; label: string };
    id: string;
  }) {
    requirePermission(input.grants, BQ_PERMISSIONS.libraryManage);
    await db.bqLibMaterialLabor.delete({ where: { id: input.id } });
    await auditWriter({
      appId: "bq",
      action: "bq.lib-material-labor.deleted",
      entityType: "BqLibMaterialLabor",
      entityId: input.id,
      actor: input.actor,
    });
  }

  async function createLibCustomItem(input: {
    grants: PermissionGrants;
    actor: { kind: string; userId?: string; label: string };
    name: string;
    purchaseUnit: string;
    harga: string;
    currency: string;
    defaultKoefisien?: string;
    kategori: "BIAYA_UMUM" | "TRANSPORTASI_AKOMODASI" | "ALAT";
    notes?: string;
  }) {
    requirePermission(input.grants, BQ_PERMISSIONS.libraryManage);
    const item = await db.bqLibCustomItem.create({
      data: {
        name: input.name,
        purchase_unit: input.purchaseUnit,
        harga: input.harga,
        currency: input.currency,
        default_koefisien: input.defaultKoefisien ?? "1",
        kategori: requireKategori(input.kategori),
        notes: input.notes ?? null,
        created_by: input.actor.userId ?? "system",
      },
    });
    await auditWriter({
      appId: "bq",
      action: "bq.lib-custom-item.created",
      entityType: "BqLibCustomItem",
      entityId: item.id,
      actor: input.actor,
    });
    return item;
  }

  async function updateLibCustomItem(input: {
    grants: PermissionGrants;
    actor: { kind: string; userId?: string; label: string };
    id: string;
    name?: string;
    purchaseUnit?: string;
    harga?: string;
    currency?: string;
    defaultKoefisien?: string;
    kategori?: "BIAYA_UMUM" | "TRANSPORTASI_AKOMODASI" | "ALAT";
    notes?: string;
  }) {
    requirePermission(input.grants, BQ_PERMISSIONS.libraryManage);
    const existing = await db.bqLibCustomItem.findUnique({ where: { id: input.id } });
    if (!existing) throw new AppError("NOT_FOUND", "bq.lib-custom-item.not-found", "Custom Library item not found");
    const item = await db.bqLibCustomItem.update({
      where: { id: input.id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.purchaseUnit !== undefined && { purchase_unit: input.purchaseUnit }),
        ...(input.harga !== undefined && { harga: input.harga }),
        ...(input.currency !== undefined && { currency: input.currency }),
        ...(input.defaultKoefisien !== undefined && { default_koefisien: input.defaultKoefisien }),
        ...(input.kategori !== undefined && { kategori: input.kategori }),
        ...(input.notes !== undefined && { notes: input.notes }),
      },
    });
    await auditWriter({
      appId: "bq",
      action: "bq.lib-custom-item.updated",
      entityType: "BqLibCustomItem",
      entityId: item.id,
      actor: input.actor,
    });
    return item;
  }

  async function deleteLibCustomItem(input: {
    grants: PermissionGrants;
    actor: { kind: string; userId?: string; label: string };
    id: string;
  }) {
    requirePermission(input.grants, BQ_PERMISSIONS.libraryManage);
    await db.bqLibCustomItem.delete({ where: { id: input.id } });
    await auditWriter({
      appId: "bq",
      action: "bq.lib-custom-item.deleted",
      entityType: "BqLibCustomItem",
      entityId: input.id,
      actor: input.actor,
    });
  }

  // ─── TEMPLATES ──────────────────────────────────────────────

  async function createTemplate(input: {
    grants: PermissionGrants;
    actor: { kind: string; userId?: string; label: string };
    name: string;
    description?: string;
  }) {
    requirePermission(input.grants, BQ_PERMISSIONS.libraryManage);
    const template = await db.bqTemplate.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        created_by: input.actor.userId ?? "system",
      },
    });
    await auditWriter({
      appId: "bq",
      action: "bq.template.created",
      entityType: "BqTemplate",
      entityId: template.id,
      actor: input.actor,
    });
    return template;
  }

  async function updateTemplate(input: {
    grants: PermissionGrants;
    actor: { kind: string; userId?: string; label: string };
    id: string;
    name?: string;
    description?: string;
  }) {
    requirePermission(input.grants, BQ_PERMISSIONS.libraryManage);
    const existing = await db.bqTemplate.findUnique({ where: { id: input.id } });
    if (!existing) throw new AppError("NOT_FOUND", "bq.template.not-found", "Template not found");
    const template = await db.bqTemplate.update({
      where: { id: input.id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
      },
    });
    await auditWriter({
      appId: "bq",
      action: "bq.template.updated",
      entityType: "BqTemplate",
      entityId: template.id,
      actor: input.actor,
    });
    return template;
  }

  async function deleteTemplate(input: {
    grants: PermissionGrants;
    actor: { kind: string; userId?: string; label: string };
    id: string;
  }) {
    requirePermission(input.grants, BQ_PERMISSIONS.libraryManage);
    await db.bqTemplate.delete({ where: { id: input.id } });
    await auditWriter({
      appId: "bq",
      action: "bq.template.deleted",
      entityType: "BqTemplate",
      entityId: input.id,
      actor: input.actor,
    });
  }

  async function duplicateTemplate(input: {
    grants: PermissionGrants;
    actor: { kind: string; userId?: string; label: string };
    id: string;
  }) {
    requirePermission(input.grants, BQ_PERMISSIONS.libraryManage);
    return runTransaction(async (tx) => {
      const original = await tx.bqTemplate.findUnique({
        where: { id: input.id },
        include: {
          sections: {
            orderBy: { sort_order: "asc" },
            include: {
              recommendations: { orderBy: { sort_order: "asc" } },
            },
          },
        },
      });
      if (!original) throw new AppError("NOT_FOUND", "bq.template.not-found", "Template not found");

      const copy = await tx.bqTemplate.create({
        data: {
          name: `${original.name} (Copy)`,
          description: original.description,
          created_by: input.actor.userId ?? "system",
        },
      });

      const sectionIdMap = new Map<string, string>();

      for (const section of original.sections) {
        if (section.parent_id) continue;
        const sectionCopy = await tx.bqTemplateSection.create({
          data: {
            template_id: copy.id,
            name: section.name,
            parent_id: null,
            sort_order: section.sort_order,
            created_by: input.actor.userId ?? "system",
          },
        });
        sectionIdMap.set(section.id, sectionCopy.id);
      }

      for (const section of original.sections) {
        if (section.parent_id) {
          const newParentId = sectionIdMap.get(section.parent_id);
          if (!newParentId) {
            // A subsection whose parent is missing means the source template is
            // structurally broken. Copying around it produced a silently
            // incomplete duplicate.
            throw new AppError(
              "CONFLICT",
              "bq.template.orphan-subsection",
              "Template contains a subsection whose parent section is missing",
            );
          }
          const subCopy = await tx.bqTemplateSection.create({
            data: {
              template_id: copy.id,
              name: section.name,
              parent_id: newParentId,
              sort_order: section.sort_order,
              created_by: input.actor.userId ?? "system",
            },
          });
          sectionIdMap.set(section.id, subCopy.id);
        }
      }

      for (const section of original.sections) {
        const newSectionId = sectionIdMap.get(section.id);
        if (!newSectionId) continue;
        for (const rec of section.recommendations) {
          await tx.bqTemplateRecommendation.create({
            data: {
              template_section_id: newSectionId,
              sort_order: rec.sort_order,
              lib_material_id: rec.lib_material_id,
              lib_labor_id: rec.lib_labor_id,
              lib_material_labor_id: rec.lib_material_labor_id,
              lib_custom_item_id: rec.lib_custom_item_id,
            },
          });
        }
      }

      await auditWriter({
        appId: "bq",
        action: "bq.template.duplicated",
        entityType: "BqTemplate",
        entityId: copy.id,
        actor: input.actor,
      });

      return copy;
    });
  }

  async function addTemplateSection(input: {
    grants: PermissionGrants;
    actor: { kind: string; userId?: string; label: string };
    templateId: string;
    name: string;
    parentId?: string;
    sortOrder?: number;
  }) {
    requirePermission(input.grants, BQ_PERMISSIONS.libraryManage);

    if (input.parentId) {
      const parent = await db.bqTemplateSection.findUnique({ where: { id: input.parentId } });
      if (!parent) throw new AppError("NOT_FOUND", "bq.template-section.not-found", "Parent section not found");
      if (parent.parent_id) {
        throw new AppError("VALIDATION", "bq.template-section.max-depth", "Nested sections beyond 2 levels are not supported");
      }
      if (parent.template_id !== input.templateId) {
        throw new AppError("VALIDATION", "bq.template-section.wrong-template", "Parent section does not belong to this template");
      }
    }

    const section = await db.bqTemplateSection.create({
      data: {
        template_id: input.templateId,
        name: input.name,
        parent_id: input.parentId ?? null,
        sort_order: input.sortOrder ?? 0,
        created_by: input.actor.userId ?? "system",
      },
    });

    await auditWriter({
      appId: "bq",
      action: "bq.template-section.created",
      entityType: "BqTemplateSection",
      entityId: section.id,
      actor: input.actor,
    });
    return section;
  }

  async function deleteTemplateSection(input: {
    grants: PermissionGrants;
    actor: { kind: string; userId?: string; label: string };
    id: string;
  }) {
    requirePermission(input.grants, BQ_PERMISSIONS.libraryManage);
    const section = await db.bqTemplateSection.findUnique({
      where: { id: input.id },
      select: { id: true, parent_id: true },
    });
    if (!section) {
      throw new AppError("NOT_FOUND", "bq.template-section.not-found", "Template section not found");
    }
    if (!section.parent_id) {
      // `parent_id` is an optional self-relation, so the default referential
      // action is SetNull: without this the Subsections would survive as new
      // top-level Sections instead of being removed with their parent.
      await db.bqTemplateSection.deleteMany({ where: { parent_id: input.id } });
    }
    await db.bqTemplateSection.delete({ where: { id: input.id } });
    await auditWriter({
      appId: "bq",
      action: "bq.template-section.deleted",
      entityType: "BqTemplateSection",
      entityId: input.id,
      actor: input.actor,
    });
  }

  async function reorderTemplateSections(input: {
    grants: PermissionGrants;
    actor: { kind: string; userId?: string; label: string };
    templateId: string;
    orderedIds: string[];
  }) {
    requirePermission(input.grants, BQ_PERMISSIONS.libraryManage);
    await runTransaction(async (tx) => {
      // Renumbering is addressed by ID, so the ownership check has to be
      // explicit: without it any section ID reorders inside another template.
      const owned = await tx.bqTemplateSection.findMany({
        where: { id: { in: input.orderedIds }, template_id: input.templateId },
        select: { id: true },
      });
      if (owned.length !== input.orderedIds.length) {
        throw new AppError(
          "VALIDATION",
          "bq.template-section.wrong-template",
          "Every reordered section must belong to this template",
        );
      }
      for (let i = 0; i < input.orderedIds.length; i++) {
        await tx.bqTemplateSection.update({
          where: { id: input.orderedIds[i] },
          data: { sort_order: i },
        });
      }
    });
    await auditWriter({
      appId: "bq",
      action: "bq.template-sections.reordered",
      entityType: "BqTemplate",
      entityId: input.templateId,
      actor: input.actor,
    });
  }

  async function addTemplateRecommendation(input: {
    grants: PermissionGrants;
    actor: { kind: string; userId?: string; label: string };
    templateSectionId: string;
    libItemType: "material" | "labor" | "material_labor" | "custom";
    libItemId: string;
    sortOrder?: number;
  }) {
    requirePermission(input.grants, BQ_PERMISSIONS.libraryManage);

    const section = await db.bqTemplateSection.findUnique({ where: { id: input.templateSectionId } });
    if (!section) {
      throw new AppError("NOT_FOUND", "bq.template-section.not-found", "Template section not found");
    }

    const libItemExists = input.libItemType === "material"
      ? await db.bqLibMaterial.findUnique({ where: { id: input.libItemId }, select: { id: true } })
      : input.libItemType === "labor"
        ? await db.bqLibLabor.findUnique({ where: { id: input.libItemId }, select: { id: true } })
        : input.libItemType === "material_labor"
          ? await db.bqLibMaterialLabor.findUnique({ where: { id: input.libItemId }, select: { id: true } })
          : await db.bqLibCustomItem.findUnique({ where: { id: input.libItemId }, select: { id: true } });
    if (!libItemExists) {
      throw new AppError("NOT_FOUND", "bq.lib-item.not-found", "Library item not found for the selected type");
    }

    const rec = await db.bqTemplateRecommendation.create({
      data: {
        template_section_id: input.templateSectionId,
        sort_order: input.sortOrder ?? 0,
        lib_material_id: input.libItemType === "material" ? input.libItemId : null,
        lib_labor_id: input.libItemType === "labor" ? input.libItemId : null,
        lib_material_labor_id: input.libItemType === "material_labor" ? input.libItemId : null,
        lib_custom_item_id: input.libItemType === "custom" ? input.libItemId : null,
      },
    });
    await auditWriter({
      appId: "bq",
      action: "bq.template-recommendation.created",
      entityType: "BqTemplateRecommendation",
      entityId: rec.id,
      actor: input.actor,
    });
    return rec;
  }

  async function removeTemplateRecommendation(input: {
    grants: PermissionGrants;
    actor: { kind: string; userId?: string; label: string };
    id: string;
  }) {
    requirePermission(input.grants, BQ_PERMISSIONS.libraryManage);
    await db.bqTemplateRecommendation.delete({ where: { id: input.id } });
    await auditWriter({
      appId: "bq",
      action: "bq.template-recommendation.deleted",
      entityType: "BqTemplateRecommendation",
      entityId: input.id,
      actor: input.actor,
    });
  }

  async function getTemplateWithSections(id: string) {
    return db.bqTemplate.findUnique({
      where: { id },
      include: {
        sections: {
          orderBy: { sort_order: "asc" },
          include: {
            recommendations: {
              orderBy: { sort_order: "asc" },
            },
          },
        },
      },
    });
  }

  // ─── PROJECTS ───────────────────────────────────────────────

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
    const project = await db.bqProject.update({
      where: { id: input.id },
      data: { status: "LOCKED" },
    });
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
    const project = await db.bqProject.update({
      where: { id: input.id },
      data: { status: "ACTIVE" },
    });
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
    const project = await db.bqProject.update({
      where: { id: input.id },
      data: { status: "ARCHIVED" },
    });
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
    const project = await db.bqProject.update({
      where: { id: input.id },
      data: { status: "ACTIVE" },
    });
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
    await db.bqProject.delete({ where: { id: project.id } });
    await db.bqProjectDeletionRequest.update({
      where: { id: request.id },
      data: {
        status: "APPROVED",
        approver_user_id: input.actor.userId ?? "system",
        approver_label: input.actor.label,
        decided_at: new Date(),
      },
    });
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
    await db.bqProjectDeletionRequest.update({
      where: { id: request.id },
      data: {
        status: "REJECTED",
        approver_user_id: input.actor.userId ?? "system",
        approver_label: input.actor.label,
        decided_at: new Date(),
        reason,
      },
    });
    await auditWriter({
      appId: "bq",
      action: "bq.project.deletion-rejected",
      entityType: "BqProject",
      entityId: request.project_id,
      actor: input.actor,
      changes: { requestId: request.id, reason },
    });
  }

  async function addSection(input: {
    grants: PermissionGrants;
    actor: { kind: string; userId?: string; label: string };
    projectId: string;
    name: string;
    sortOrder?: number;
  }) {
    requirePermission(input.grants, BQ_PERMISSIONS.projectManage);
    await requireEditableProject(input.projectId);
    const section = await db.bqSection.create({
      data: {
        project_id: input.projectId,
        name: input.name,
        sort_order: input.sortOrder ?? 0,
      },
    });
    await auditWriter({
      appId: "bq",
      action: "bq.section.created",
      entityType: "BqSection",
      entityId: section.id,
      actor: input.actor,
    });
    return section;
  }

  async function addSubsection(input: {
    grants: PermissionGrants;
    actor: { kind: string; userId?: string; label: string };
    sectionId: string;
    name: string;
    sortOrder?: number;
  }) {
    requirePermission(input.grants, BQ_PERMISSIONS.projectManage);
    await requireEditableProjectForSection(input.sectionId);
    const subsection = await db.bqSubsection.create({
      data: {
        section_id: input.sectionId,
        name: input.name,
        sort_order: input.sortOrder ?? 0,
      },
    });
    await auditWriter({
      appId: "bq",
      action: "bq.subsection.created",
      entityType: "BqSubsection",
      entityId: subsection.id,
      actor: input.actor,
    });
    return subsection;
  }

  async function updateSection(input: {
    grants: PermissionGrants;
    actor: { kind: string; userId?: string; label: string };
    id: string;
    name: string;
  }) {
    requirePermission(input.grants, BQ_PERMISSIONS.projectManage);
    const section = await db.bqSection.findUnique({ where: { id: input.id }, select: { project_id: true } });
    if (!section) throw new AppError("NOT_FOUND", "bq.section.not-found", "Section not found");
    await requireEditableProject(section.project_id);
    await db.bqSection.update({ where: { id: input.id }, data: { name: input.name } });
    await auditWriter({
      appId: "bq",
      action: "bq.section.updated",
      entityType: "BqSection",
      entityId: input.id,
      actor: input.actor,
    });
  }

  async function updateSubsection(input: {
    grants: PermissionGrants;
    actor: { kind: string; userId?: string; label: string };
    id: string;
    name: string;
  }) {
    requirePermission(input.grants, BQ_PERMISSIONS.projectManage);
    await requireEditableProjectForSubsection(input.id);
    await db.bqSubsection.update({ where: { id: input.id }, data: { name: input.name } });
    await auditWriter({
      appId: "bq",
      action: "bq.subsection.updated",
      entityType: "BqSubsection",
      entityId: input.id,
      actor: input.actor,
    });
  }

    async function addItem(input: {
    grants: PermissionGrants;
    actor: { kind: string; userId?: string; label: string };
    sectionId?: string;
    subsectionId?: string;
    name: string;
    qty: string;
    unit: string;
    hargaSnapshot?: string;
    koefisien?: string;
    markupL1Pct?: string;
    sortOrder?: number;
    notes?: string;
  }) {
    requirePermission(input.grants, BQ_PERMISSIONS.projectManage);

    if (!input.sectionId && !input.subsectionId) {
      throw new AppError("VALIDATION", "bq.item.no-parent", "Work Item must belong to a Section or Subsection");
    }
    if (input.sectionId && input.subsectionId) {
      throw new AppError("VALIDATION", "bq.item.dual-parent", "Work Item cannot belong to both a Section and Subsection");
    }

    if (input.sectionId) await requireEditableProjectForSection(input.sectionId);
    else await requireEditableProjectForSubsection(input.subsectionId!);

    const item = await db.bqItem.create({
      data: {
        section_id: input.sectionId ?? null,
        subsection_id: input.subsectionId ?? null,
        name: input.name,
        qty: input.qty,
        unit: input.unit,
        harga_snapshot: input.hargaSnapshot ?? null,
        koefisien: input.koefisien ?? "1",
        markup_l1_pct: input.markupL1Pct ?? "0",
        sort_order: input.sortOrder ?? 0,
        notes: input.notes ?? null,
      },
    });

    await auditWriter({
      appId: "bq",
      action: "bq.item.created",
      entityType: "BqItem",
      entityId: item.id,
      actor: input.actor,
    });
    return item;
  }

  async function updateItem(input: {
    grants: PermissionGrants;
    actor: { kind: string; userId?: string; label: string };
    id: string;
    name?: string;
    qty?: string;
    unit?: string;
    hargaSnapshot?: string | null;
    koefisien?: string;
    markupL1Pct?: string;
    sortOrder?: number;
    notes?: string;
  }) {
    requirePermission(input.grants, BQ_PERMISSIONS.projectManage);
    await requireEditableProjectForItem(input.id);

    const item = await db.bqItem.update({
      where: { id: input.id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.qty !== undefined && { qty: input.qty }),
        ...(input.unit !== undefined && { unit: input.unit }),
        ...(input.hargaSnapshot !== undefined && { harga_snapshot: input.hargaSnapshot }),
        ...(input.koefisien !== undefined && { koefisien: input.koefisien }),
        ...(input.markupL1Pct !== undefined && { markup_l1_pct: input.markupL1Pct }),
        ...(input.sortOrder !== undefined && { sort_order: input.sortOrder }),
        ...(input.notes !== undefined && { notes: input.notes }),
      },
    });

    await auditWriter({
      appId: "bq",
      action: "bq.item.updated",
      entityType: "BqItem",
      entityId: item.id,
      actor: input.actor,
    });
    return item;
  }

  async function deleteItem(input: {
    grants: PermissionGrants;
    actor: { kind: string; userId?: string; label: string };
    id: string;
  }) {
    requirePermission(input.grants, BQ_PERMISSIONS.projectManage);
    await requireEditableProjectForItem(input.id);
    await db.bqItem.delete({ where: { id: input.id } });
    await auditWriter({
      appId: "bq",
      action: "bq.item.deleted",
      entityType: "BqItem",
      entityId: input.id,
      actor: input.actor,
    });
  }

  async function addSubObject(input: {
    grants: PermissionGrants;
    actor: { kind: string; userId?: string; label: string };
    itemId: string;
    name: string;
    qtyPerL1: string;
    markupL2Pct?: string;
    sortOrder?: number;
    notes?: string;
  }) {
    requirePermission(input.grants, BQ_PERMISSIONS.projectManage);
    await requireEditableProjectForItem(input.itemId);

    const subObject = await db.bqSubObject.create({
      data: {
        item_id: input.itemId,
        name: input.name,
        qty_per_l1: input.qtyPerL1,
        markup_l2_pct: input.markupL2Pct ?? "0",
        sort_order: input.sortOrder ?? 0,
        notes: input.notes ?? null,
      },
    });
    // bq-contract §6.2: the L1-only harga_snapshot is simply unused while the
    // item has children. Clearing it here destroyed the estimator's price and
    // left the L1 uncalculable if the last child was later removed.

    await auditWriter({
      appId: "bq",
      action: "bq.sub-object.created",
      entityType: "BqSubObject",
      entityId: subObject.id,
      actor: input.actor,
    });
    return subObject;
  }

  async function updateSubObject(input: {
    grants: PermissionGrants;
    actor: { kind: string; userId?: string; label: string };
    id: string;
    name?: string;
    qtyPerL1?: string;
    markupL2Pct?: string;
    sortOrder?: number;
    notes?: string;
  }) {
    requirePermission(input.grants, BQ_PERMISSIONS.projectManage);
    await requireEditableProjectForSubObject(input.id);

    const subObject = await db.bqSubObject.update({
      where: { id: input.id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.qtyPerL1 !== undefined && { qty_per_l1: input.qtyPerL1 }),
        ...(input.markupL2Pct !== undefined && { markup_l2_pct: input.markupL2Pct }),
        ...(input.sortOrder !== undefined && { sort_order: input.sortOrder }),
        ...(input.notes !== undefined && { notes: input.notes }),
      },
    });

    await auditWriter({
      appId: "bq",
      action: "bq.sub-object.updated",
      entityType: "BqSubObject",
      entityId: subObject.id,
      actor: input.actor,
    });
    return subObject;
  }

  async function deleteSubObject(input: {
    grants: PermissionGrants;
    actor: { kind: string; userId?: string; label: string };
    id: string;
  }) {
    requirePermission(input.grants, BQ_PERMISSIONS.projectManage);
    await requireEditableProjectForSubObject(input.id);
    await db.bqSubObject.delete({ where: { id: input.id } });
    await auditWriter({
      appId: "bq",
      action: "bq.sub-object.deleted",
      entityType: "BqSubObject",
      entityId: input.id,
      actor: input.actor,
    });
  }

  async function addLineItem(input: {
    grants: PermissionGrants;
    actor: { kind: string; userId?: string; label: string };
    subObjectId?: string;
    itemId?: string;
    sourceType: "MASTERDATA" | "BQ_LIBRARY" | "CUSTOM";
    sourceRefId?: string;
    sourceImportedAt?: Date;
    titleSnapshot: string;
    purchaseUnitSnapshot: string;
    baseUnitSnapshot?: string;
    purchaseToBaseFactorSnapshot?: string;
    hargaSnapshot: string;
    currencySnapshot?: string;
    kategori: string;
    qty: string;
    koefisien?: string;
    sortOrder?: number;
    notes?: string;
  }) {
    requirePermission(input.grants, BQ_PERMISSIONS.projectManage);

    if (!input.subObjectId && !input.itemId) {
      throw new AppError("VALIDATION", "bq.line-item.no-parent", "Cost Component must belong to a Component Group or Work Item");
    }
    if (input.subObjectId && input.itemId) {
      throw new AppError("VALIDATION", "bq.line-item.dual-parent", "Cost Component cannot belong to both a Component Group and Work Item");
    }

    if (input.subObjectId) await requireEditableProjectForSubObject(input.subObjectId);
    else await requireEditableProjectForItem(input.itemId!);

    const lineItem = await db.bqLineItem.create({
      data: {
        sub_object_id: input.subObjectId ?? null,
        item_id: input.itemId ?? null,
        source_type: input.sourceType,
        source_ref_id: input.sourceRefId ?? null,
        source_imported_at: input.sourceImportedAt ?? null,
        title_snapshot: input.titleSnapshot,
        purchase_unit_snapshot: input.purchaseUnitSnapshot,
        base_unit_snapshot: input.baseUnitSnapshot ?? null,
        purchase_to_base_factor_snapshot: input.purchaseToBaseFactorSnapshot ?? null,
        source_price_snapshot: input.sourceType === "CUSTOM" ? null : input.hargaSnapshot,
        harga_snapshot: input.hargaSnapshot,
        currency_snapshot: input.currencySnapshot ?? "IDR",
        kategori: requireKategori(input.kategori),
        qty: input.qty,
        koefisien: input.koefisien ?? "1",
        sort_order: input.sortOrder ?? 0,
        notes: input.notes ?? null,
      },
    });
    await auditWriter({
      appId: "bq",
      action: "bq.line-item.created",
      entityType: "BqLineItem",
      entityId: lineItem.id,
      actor: input.actor,
    });
    return lineItem;
  }

  async function updateLineItem(input: {
    grants: PermissionGrants;
    actor: { kind: string; userId?: string; label: string };
    id: string;
    titleSnapshot?: string;
    purchaseUnitSnapshot?: string;
    baseUnitSnapshot?: string;
    purchaseToBaseFactorSnapshot?: string | null;
    hargaSnapshot?: string;
    currencySnapshot?: string;
    kategori?: BqKategori;
    qty?: string;
    koefisien?: string;
    sortOrder?: number;
    notes?: string;
  }) {
    requirePermission(input.grants, BQ_PERMISSIONS.projectManage);
    await requireEditableProjectForLineItem(input.id);
    const existing = await db.bqLineItem.findUnique({ where: { id: input.id } });
    if (!existing) throw new AppError("NOT_FOUND", "bq.line-item.not-found", "Cost Component not found");

    const lineItem = await db.bqLineItem.update({
      where: { id: input.id },
      data: {
        ...(input.titleSnapshot !== undefined && { title_snapshot: input.titleSnapshot }),
        ...(input.purchaseUnitSnapshot !== undefined && { purchase_unit_snapshot: input.purchaseUnitSnapshot }),
        ...(input.baseUnitSnapshot !== undefined && { base_unit_snapshot: input.baseUnitSnapshot }),
        ...(input.purchaseToBaseFactorSnapshot !== undefined && { purchase_to_base_factor_snapshot: input.purchaseToBaseFactorSnapshot }),
        ...(input.hargaSnapshot !== undefined && { harga_snapshot: input.hargaSnapshot }),
        ...(input.currencySnapshot !== undefined && { currency_snapshot: input.currencySnapshot }),
        ...(input.kategori !== undefined && { kategori: requireKategori(input.kategori) }),
        ...(input.qty !== undefined && { qty: input.qty }),
        ...(input.koefisien !== undefined && { koefisien: input.koefisien }),
        ...(input.sortOrder !== undefined && { sort_order: input.sortOrder }),
        ...(input.notes !== undefined && { notes: input.notes }),
      },
    });

    await auditWriter({
      appId: "bq",
      action: input.hargaSnapshot !== undefined
        && existing.source_price_snapshot !== null
        && compareDecimals(
          toDecimalString(existing.source_price_snapshot.toString()),
          toDecimalString(input.hargaSnapshot),
        ) !== 0
        ? "bq.line-item.price-overridden"
        : "bq.line-item.updated",
      entityType: "BqLineItem",
      entityId: lineItem.id,
      actor: input.actor,
    });
    return lineItem;
  }


  async function revertLineItemPrice(input: {
    grants: PermissionGrants;
    actor: { kind: string; userId?: string; label: string };
    id: string;
  }) {
    requirePermission(input.grants, BQ_PERMISSIONS.projectManage);
    await requireEditableProjectForLineItem(input.id);
    const lineItem = await db.bqLineItem.findUnique({ where: { id: input.id } });
    if (!lineItem) throw new AppError("NOT_FOUND", "bq.line-item.not-found", "Cost Component not found");
    const snap = lineItem.source_price_snapshot;
    if (snap == null) {
      throw new AppError("INVARIANT", "bq.line-item.no-snapshot", "This Cost Component has no imported source price to restore");
    }
    const updated = await db.bqLineItem.update({
      where: { id: input.id },
      data: { harga_snapshot: snap },
    });
    await auditWriter({
      appId: "bq",
      action: "bq.line-item.price-reverted",
      entityType: "BqLineItem",
      entityId: updated.id,
      actor: input.actor,
    });
    return updated;
  }
  async function deleteLineItem(input: {
    grants: PermissionGrants;
    actor: { kind: string; userId?: string; label: string };
    id: string;
  }) {
    requirePermission(input.grants, BQ_PERMISSIONS.projectManage);
    await requireEditableProjectForLineItem(input.id);
    await db.bqLineItem.delete({ where: { id: input.id } });
    await auditWriter({
      appId: "bq",
      action: "bq.line-item.deleted",
      entityType: "BqLineItem",
      entityId: input.id,
      actor: input.actor,
    });
  }

  // ─── PROMOTION ──────────────────────────────────────────────

  type PromotableType = "material" | "labor" | "material_labor";

  const PROMOTABLE = {
    material: { kategori: "MATERIAL", code: "bq.lib-material", label: "Library material" },
    labor: { kategori: "UPAH", code: "bq.lib-labor", label: "Library labor" },
    material_labor: { kategori: "MATERIAL_UPAH", code: "bq.lib-material-labor", label: "Library material+labor" },
  } as const;

  type PromotionStatus = "DRAFT" | "REQUESTED" | "APPROVED" | "REJECTED";
  type PromotionUpdate = { promotion_status: PromotionStatus; masterdata_ref_id?: string };

  /**
   * bq-contract §8.2/§9 state machine: DRAFT -> REQUESTED -> APPROVED | REJECTED.
   * Every transition names the status it is allowed to leave, so an approval
   * cannot land on an item nobody requested and a re-request cannot silently
   * strip an existing Master Data link.
   */
  async function loadPromotable(
    type: PromotableType,
    libItemId: string,
    expected: readonly PromotionStatus[],
  ): Promise<{ id: string; kategori: string; promotion_status: string }> {
    const meta = PROMOTABLE[type];
    const item = type === "material"
      ? await db.bqLibMaterial.findUnique({ where: { id: libItemId } })
      : type === "labor"
        ? await db.bqLibLabor.findUnique({ where: { id: libItemId } })
        : await db.bqLibMaterialLabor.findUnique({ where: { id: libItemId } });
    if (!item) throw new AppError("NOT_FOUND", `${meta.code}.not-found`, `${meta.label} not found`);
    if (item.kategori !== meta.kategori) {
      throw new AppError("FORBIDDEN", "bq.promotion.not-eligible", "This item cannot be promoted to Master Data");
    }
    if (!expected.includes(item.promotion_status as PromotionStatus)) {
      throw new AppError(
        "CONFLICT",
        "bq.promotion.invalid-status",
        `This item is ${item.promotion_status.toLowerCase()} and cannot make that promotion transition`,
      );
    }
    return item;
  }

  async function setPromotionStatus(
    type: PromotableType,
    libItemId: string,
    data: PromotionUpdate,
  ): Promise<void> {
    const where = { id: libItemId };
    if (type === "material") await db.bqLibMaterial.update({ where, data });
    else if (type === "labor") await db.bqLibLabor.update({ where, data });
    else await db.bqLibMaterialLabor.update({ where, data });
  }

  async function requestPromotion(input: {
    grants: PermissionGrants;
    actor: { kind: string; userId?: string; label: string };
    type: PromotableType;
    libItemId: string;
  }) {
    requirePermission(input.grants, BQ_PERMISSIONS.libraryPromote);
    await loadPromotable(input.type, input.libItemId, ["DRAFT", "REJECTED"]);
    await setPromotionStatus(input.type, input.libItemId, { promotion_status: "REQUESTED" });

    await auditWriter({
      appId: "bq",
      action: "bq.promotion.requested",
      entityType: "BqLibItem",
      entityId: input.libItemId,
      actor: input.actor,
    });
  }

  async function listPromotionRequests(input: {
    grants: PermissionGrants;
  }) {
    requirePermission(input.grants, BQ_PERMISSIONS.libraryPromoteApprove);

    const [materials, labors, materialLabors] = await Promise.all([
      db.bqLibMaterial.findMany({ where: { promotion_status: "REQUESTED" } }),
      db.bqLibLabor.findMany({ where: { promotion_status: "REQUESTED" } }),
      db.bqLibMaterialLabor.findMany({ where: { promotion_status: "REQUESTED" } }),
    ]);

    const results: Array<{
      id: string;
      type: "material" | "labor" | "material_labor";
      name: string;
      purchaseUnit: string;
      baseUnit: string | null;
      kategori: string;
      notes: string | null;
      createdBy: string;
    }> = [];

    for (const m of materials) {
      results.push({ id: m.id, type: "material", name: m.name, purchaseUnit: m.purchase_unit, baseUnit: m.base_unit, kategori: m.kategori, notes: m.notes, createdBy: m.created_by });
    }
    for (const l of labors) {
      results.push({ id: l.id, type: "labor", name: l.name, purchaseUnit: l.purchase_unit, baseUnit: l.base_unit, kategori: l.kategori, notes: l.notes, createdBy: l.created_by });
    }
    for (const ml of materialLabors) {
      results.push({ id: ml.id, type: "material_labor", name: ml.name, purchaseUnit: ml.purchase_unit, baseUnit: ml.base_unit, kategori: ml.kategori, notes: ml.notes, createdBy: ml.created_by });
    }

    return results;
  }

  async function approvePromotion(input: {
    grants: PermissionGrants;
    actor: { kind: string; userId?: string; label: string };
    type: PromotableType;
    libItemId: string;
    masterdataRefId: string;
  }) {
    requirePermission(input.grants, BQ_PERMISSIONS.libraryPromoteApprove);
    const masterdataRefId = input.masterdataRefId?.trim();
    if (!masterdataRefId) {
      throw new AppError(
        "VALIDATION",
        "bq.promotion.masterdata-ref-required",
        "An approved promotion must record the Master Data entry it links to",
      );
    }
    await loadPromotable(input.type, input.libItemId, ["REQUESTED"]);
    await setPromotionStatus(input.type, input.libItemId, {
      promotion_status: "APPROVED",
      masterdata_ref_id: masterdataRefId,
    });

    await auditWriter({
      appId: "bq",
      action: "bq.promotion.approved",
      entityType: "BqLibItem",
      entityId: input.libItemId,
      actor: input.actor,
      changes: { masterdataRefId },
    });
  }

  async function rejectPromotion(input: {
    grants: PermissionGrants;
    actor: { kind: string; userId?: string; label: string };
    type: PromotableType;
    libItemId: string;
    reason: string;
  }) {
    requirePermission(input.grants, BQ_PERMISSIONS.libraryPromoteApprove);
    const reason = input.reason?.trim();
    if (!reason) {
      throw new AppError("VALIDATION", "bq.promotion.reason-required", "A rejection must state its reason");
    }
    await loadPromotable(input.type, input.libItemId, ["REQUESTED"]);
    // bq-contract §8.2: a rejected request stays REJECTED until it is revised
    // and resubmitted. Resetting it to DRAFT erased the decision.
    await setPromotionStatus(input.type, input.libItemId, { promotion_status: "REJECTED" });

    await auditWriter({
      appId: "bq",
      action: "bq.promotion.rejected",
      entityType: "BqLibItem",
      entityId: input.libItemId,
      actor: input.actor,
      changes: { reason },
    });
  }

  // ─── ASSEMBLY TEMPLATES ─────────────────────────────────────

  async function createAssemblyTemplate(input: { grants: PermissionGrants; actor: { kind: string; userId?: string; label: string }; name: string; description?: string }) {
    requirePermission(input.grants, BQ_PERMISSIONS.libraryManage);
    const assembly = await db.bqAssemblyTemplate.create({ data: { name: input.name, description: input.description ?? null, created_by: input.actor.userId ?? "system" } });
    await auditWriter({ appId: "bq", action: "bq.assembly.created", entityType: "BqAssemblyTemplate", entityId: assembly.id, actor: input.actor });
    return assembly;
  }

  async function addAssemblyCustomLine(input: { grants: PermissionGrants; actor: { kind: string; userId?: string; label: string }; assemblyId: string; title: string; purchaseUnit?: string; harga?: string; currency?: string; kategori?: string; qty?: string; koefisien?: string }) {
    requirePermission(input.grants, BQ_PERMISSIONS.libraryManage);
    const assembly = await db.bqAssemblyTemplate.findUnique({ where: { id: input.assemblyId } });
    if (!assembly) throw new AppError("NOT_FOUND", "bq.assembly.not-found", "Assembly template not found");
    const existingCount = await db.bqAssemblyLine.count({ where: { assembly_template_id: input.assemblyId } });
    const line = await db.bqAssemblyLine.create({ data: { assembly_template_id: assembly.id, source_type: "CUSTOM", title_snapshot: input.title, purchase_unit_snapshot: input.purchaseUnit ?? "ls", harga_snapshot: input.harga ?? "0", currency_snapshot: input.currency ?? "IDR", kategori: requireKategori(input.kategori ?? "MATERIAL"), qty: input.qty ?? "1", koefisien: input.koefisien ?? "1", sort_order: existingCount } });
    await auditWriter({ appId: "bq", action: "bq.assembly-line.created", entityType: "BqAssemblyLine", entityId: line.id, actor: input.actor });
    return line;
  }

  async function updateAssemblyTemplate(input: { grants: PermissionGrants; actor: { kind: string; userId?: string; label: string }; assemblyId: string; name?: string; description?: string }) {
    requirePermission(input.grants, BQ_PERMISSIONS.libraryManage);
    const assembly = await db.bqAssemblyTemplate.findUnique({ where: { id: input.assemblyId } });
    if (!assembly) throw new AppError("NOT_FOUND", "bq.assembly.not-found", "Assembly template not found");
    const name = input.name?.trim();
    const description = input.description?.trim() ?? null;
    if (!name && description === null) return assembly; // no-op
    await db.bqAssemblyTemplate.update({ where: { id: input.assemblyId }, data: { ...(name && { name }), ...(input.description !== undefined && { description }) } });
    await auditWriter({ appId: "bq", action: "bq.assembly.updated", entityType: "BqAssemblyTemplate", entityId: input.assemblyId, actor: input.actor, changes: { name, description } });
    return assembly;
  }

  async function deleteAssemblyTemplate(input: { grants: PermissionGrants; actor: { kind: string; userId?: string; label: string }; assemblyId: string }) {
    requirePermission(input.grants, BQ_PERMISSIONS.libraryManage);
    const assembly = await db.bqAssemblyTemplate.findUnique({ where: { id: input.assemblyId } });
    if (!assembly) throw new AppError("NOT_FOUND", "bq.assembly.not-found", "Assembly template not found");
    await db.bqAssemblyTemplate.delete({ where: { id: input.assemblyId } });
    await auditWriter({ appId: "bq", action: "bq.assembly.deleted", entityType: "BqAssemblyTemplate", entityId: input.assemblyId, actor: input.actor });
  }

  async function updateAssemblyLine(input: { grants: PermissionGrants; actor: { kind: string; userId?: string; label: string }; lineId: string; title?: string; purchaseUnit?: string; harga?: string; currency?: string; kategori?: string; qty?: string; koefisien?: string; notes?: string }) {
    requirePermission(input.grants, BQ_PERMISSIONS.libraryManage);
    const line = await db.bqAssemblyLine.findUnique({ where: { id: input.lineId } });
    if (!line) throw new AppError("NOT_FOUND", "bq.assembly-line.not-found", "Assembly line not found");
    await db.bqAssemblyLine.update({ where: { id: input.lineId }, data: { ...(input.title !== undefined && { title_snapshot: input.title }), ...(input.purchaseUnit !== undefined && { purchase_unit_snapshot: input.purchaseUnit }), ...(input.harga !== undefined && { harga_snapshot: input.harga }), ...(input.currency !== undefined && { currency_snapshot: input.currency }), ...(input.kategori !== undefined && { kategori: requireKategori(input.kategori) }), ...(input.qty !== undefined && { qty: input.qty }), ...(input.koefisien !== undefined && { koefisien: input.koefisien }), ...(input.notes !== undefined && { notes: input.notes || null }) } });
    await auditWriter({ appId: "bq", action: "bq.assembly-line.updated", entityType: "BqAssemblyLine", entityId: input.lineId, actor: input.actor });
  }

  async function deleteAssemblyLine(input: { grants: PermissionGrants; actor: { kind: string; userId?: string; label: string }; lineId: string }) {
    requirePermission(input.grants, BQ_PERMISSIONS.libraryManage);
    const line = await db.bqAssemblyLine.findUnique({ where: { id: input.lineId } });
    if (!line) throw new AppError("NOT_FOUND", "bq.assembly-line.not-found", "Assembly line not found");
    await db.bqAssemblyLine.delete({ where: { id: input.lineId } });
    await auditWriter({ appId: "bq", action: "bq.assembly-line.deleted", entityType: "BqAssemblyLine", entityId: line.assembly_template_id, actor: input.actor });
  }

  async function applyAssemblyTemplate(input: { grants: PermissionGrants; actor: { kind: string; userId?: string; label: string }; itemId: string; assemblyId: string; qtyPerL1?: string }) {
    requirePermission(input.grants, BQ_PERMISSIONS.projectManage);
    await requireEditableProjectForItem(input.itemId);
    const assembly = await db.bqAssemblyTemplate.findUnique({ where: { id: input.assemblyId }, include: { lines: { orderBy: { sort_order: "asc" } } } });
    if (!assembly) throw new AppError("NOT_FOUND", "bq.assembly.not-found", "Assembly template not found");
    if (!assembly.lines.length) throw new AppError("VALIDATION", "bq.assembly.empty", "An assembly must contain at least one Cost Component");
    const existingSubObjectCount = await db.bqSubObject.count({ where: { item_id: input.itemId } });
    const subObject = await db.bqSubObject.create({ data: { item_id: input.itemId, name: assembly.name, qty_per_l1: input.qtyPerL1 ?? "1", sort_order: existingSubObjectCount } });
    await db.bqLineItem.createMany({ data: assembly.lines.map((line) => ({ sub_object_id: subObject.id, source_type: line.source_type, source_ref_id: line.source_ref_id, source_imported_at: new Date(), title_snapshot: line.title_snapshot, purchase_unit_snapshot: line.purchase_unit_snapshot, base_unit_snapshot: line.base_unit_snapshot, purchase_to_base_factor_snapshot: line.purchase_to_base_factor_snapshot, harga_snapshot: line.harga_snapshot, currency_snapshot: line.currency_snapshot, kategori: line.kategori, qty: line.qty, koefisien: line.koefisien, sort_order: line.sort_order, notes: line.notes })) });
    await auditWriter({ appId: "bq", action: "bq.assembly.applied", entityType: "BqSubObject", entityId: subObject.id, actor: input.actor, changes: { assemblyId: assembly.id } });
    return subObject;
  }

  /** Creates an L1 named after the selected template, then snapshots that template into it. */
  async function addItemAndApplyAssembly(input: {
    grants: PermissionGrants;
    actor: { kind: string; userId?: string; label: string };
    sectionId?: string;
    subsectionId?: string;
    assemblyId: string;
    qtyPerL1?: string;
  }) {
    requirePermission(input.grants, BQ_PERMISSIONS.projectManage);
    const assembly = await db.bqAssemblyTemplate.findUnique({ where: { id: input.assemblyId } });
    if (!assembly) throw new AppError("NOT_FOUND", "bq.assembly.not-found", "Assembly template not found");

    const item = await addItem({
      grants: input.grants,
      actor: input.actor,
      sectionId: input.sectionId,
      subsectionId: input.subsectionId,
      name: assembly.name,
      qty: "1",
      unit: "ls",
    });
    await applyAssemblyTemplate({
      grants: input.grants,
      actor: input.actor,
      itemId: item.id,
      assemblyId: input.assemblyId,
      qtyPerL1: input.qtyPerL1,
    });
    return item;
  }

  const operations = {
    createLibMaterial,
    updateLibMaterial,
    deleteLibMaterial,
    createLibLabor,
    updateLibLabor,
    deleteLibLabor,
    createLibMaterialLabor,
    updateLibMaterialLabor,
    deleteLibMaterialLabor,
    createLibCustomItem,
    updateLibCustomItem,
    deleteLibCustomItem,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    duplicateTemplate,
    addTemplateSection,
    deleteTemplateSection,
    reorderTemplateSections,
    addTemplateRecommendation,
    removeTemplateRecommendation,
    getTemplateWithSections,
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
    addSection,
    addSubsection,
    updateSection,
    updateSubsection,
    addItem,
    updateItem,
    deleteItem,
    addSubObject,
    updateSubObject,
    deleteSubObject,
    addLineItem,
    updateLineItem,
    deleteLineItem,
    revertLineItemPrice,
    requestPromotion,
    listPromotionRequests,
    approvePromotion,
    rejectPromotion,
    createAssemblyTemplate,
    updateAssemblyTemplate,
    deleteAssemblyTemplate,
    addAssemblyCustomLine,
    updateAssemblyLine,
    deleteAssemblyLine,
    applyAssemblyTemplate,
    addItemAndApplyAssembly,
  };

  // CORE.md §2: a command that writes records plus its audit event runs in one
  // transaction; simple independent reads do not open one.
  const readOnlyOperations = new Set<string>(["getTemplateWithSections", "listPromotionRequests", "listProjectDeletionRequests"]);

  return Object.fromEntries(
    Object.entries(operations).map(([name, operation]) => [
      name,
      readOnlyOperations.has(name)
        ? operation
        : (...args: unknown[]) => runTransaction(() => (operation as (...values: unknown[]) => Promise<unknown>)(...args)),
    ]),
  ) as typeof operations;
}
