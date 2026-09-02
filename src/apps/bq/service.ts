import { AsyncLocalStorage } from "node:async_hooks";

import type { PermissionGrants } from "@platform/core/rbac";
import type { PrismaClient } from "@/generated/prisma/client";
import type { AuditActor, AuditWriter } from "@platform/core/audit";
import { prepareAuditEvent } from "@platform/core/audit";
import { requirePermission, hasAnyPermission } from "@platform/core/rbac";
import { AppError } from "@platform/core/errors";

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
  libraryRead: "bq.library.read",
  libraryManage: "bq.library.manage",
  libraryPromote: "bq.library.promote",
  libraryPromoteApprove: "bq.library.promote.approve",
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

  async function requireEditableProjectForItem(itemId: string): Promise<void> {
    const item = await db.bqItem.findUnique({
      where: { id: itemId },
      include: { section: true, subsection: true },
    });
    if (!item) throw new AppError("NOT_FOUND", "bq.item.not-found", "Item not found");
    const section = item.section
      ?? (item.subsection ? await db.bqSection.findUnique({ where: { id: item.subsection.section_id } }) : null);
    if (!section) throw new AppError("CONFLICT", "bq.item.invalid-parent", "Item does not belong to a project section");
    const project = await db.bqProject.findUnique({ where: { id: section.project_id } });
    if (!project) throw new AppError("NOT_FOUND", "bq.project.not-found", "Project not found");
    if (project.status === "LOCKED") {
      throw new AppError("CONFLICT", "bq.project.locked", "Cannot edit a locked project");
    }
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
    defaultKoefisien: string;
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
        default_koefisien: input.defaultKoefisien,
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
    defaultKoefisien: string;
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
        default_koefisien: input.defaultKoefisien,
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
    defaultKoefisien: string;
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
        default_koefisien: input.defaultKoefisien,
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
    defaultKoefisien: string;
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
        default_koefisien: input.defaultKoefisien,
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
    if (!existing) throw new AppError("NOT_FOUND", "bq.lib-custom-item.not-found", "Library custom item not found");
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
          if (newParentId) {
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
      }

      for (const section of original.sections) {
        const newSectionId = sectionIdMap.get(section.id);
        if (newSectionId) {
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

        if (template) {
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
              if (newParentId) {
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
    const existing = await db.bqProject.findUnique({ where: { id: input.id } });
    if (!existing) throw new AppError("NOT_FOUND", "bq.project.not-found", "Project not found");
    if (existing.status === "LOCKED") {
      throw new AppError("CONFLICT", "bq.project.locked", "Cannot edit a locked project");
    }
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

  async function addSection(input: {
    grants: PermissionGrants;
    actor: { kind: string; userId?: string; label: string };
    projectId: string;
    name: string;
    sortOrder?: number;
  }) {
    requirePermission(input.grants, BQ_PERMISSIONS.projectManage);
    const project = await db.bqProject.findUnique({ where: { id: input.projectId } });
    if (!project) throw new AppError("NOT_FOUND", "bq.project.not-found", "Project not found");
    if (project.status === "LOCKED") {
      throw new AppError("CONFLICT", "bq.project.locked", "Cannot edit a locked project");
    }
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
    const section = await db.bqSection.findUnique({ where: { id: input.sectionId } });
    if (!section) throw new AppError("NOT_FOUND", "bq.section.not-found", "Section not found");
    const project = await db.bqProject.findUnique({ where: { id: section.project_id } });
    if (project?.status === "LOCKED") {
      throw new AppError("CONFLICT", "bq.project.locked", "Cannot edit a locked project");
    }
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

    if (input.sectionId) {
      const section = await db.bqSection.findUnique({ where: { id: input.sectionId } });
      if (!section) throw new AppError("NOT_FOUND", "bq.section.not-found", "Section not found");
      const project = await db.bqProject.findUnique({ where: { id: section.project_id } });
      if (project?.status === "LOCKED") throw new AppError("CONFLICT", "bq.project.locked", "Cannot edit a locked project");
    }
    if (input.subsectionId) {
      const subsection = await db.bqSubsection.findUnique({ where: { id: input.subsectionId } });
      if (!subsection) throw new AppError("NOT_FOUND", "bq.subsection.not-found", "Subsection not found");
      const section = await db.bqSection.findUnique({ where: { id: subsection.section_id } });
      if (section) {
        const project = await db.bqProject.findUnique({ where: { id: section.project_id } });
        if (project?.status === "LOCKED") throw new AppError("CONFLICT", "bq.project.locked", "Cannot edit a locked project");
      }
    }

    if (!input.sectionId && !input.subsectionId) {
      throw new AppError("VALIDATION", "bq.item.no-parent", "Item must belong to a section or subsection");
    }
    if (input.sectionId && input.subsectionId) {
      throw new AppError("VALIDATION", "bq.item.dual-parent", "Item cannot belong to both section and subsection");
    }

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
    const existing = await db.bqItem.findUnique({
      where: { id: input.id },
      include: { section: true, subsection: true },
    });
    if (!existing) throw new AppError("NOT_FOUND", "bq.item.not-found", "Item not found");

    const projectId = existing.section?.project_id ?? existing.subsection?.section_id;
    if (projectId) {
      const section = existing.section ?? (existing.subsection ? await db.bqSection.findUnique({ where: { id: existing.subsection.section_id } }) : null);
      const project = section ? await db.bqProject.findUnique({ where: { id: section.project_id } }) : null;
      if (project?.status === "LOCKED") throw new AppError("CONFLICT", "bq.project.locked", "Cannot edit a locked project");
    }

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
    const item = await db.bqItem.findUnique({
      where: { id: input.itemId },
      include: { section: true, subsection: true },
    });
    if (!item) throw new AppError("NOT_FOUND", "bq.item.not-found", "Item not found");

    const projectId = item.section?.project_id ?? item.subsection?.section_id;
    if (projectId) {
      const section = item.section ?? (item.subsection ? await db.bqSection.findUnique({ where: { id: item.subsection.section_id } }) : null);
      const project = section ? await db.bqProject.findUnique({ where: { id: section.project_id } }) : null;
      if (project?.status === "LOCKED") throw new AppError("CONFLICT", "bq.project.locked", "Cannot edit a locked project");
    }

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
    // An L1 switches from standalone pricing to child aggregation at the
    // first child. The standalone snapshot must not remain as dead data.
    await db.bqItem.update({ where: { id: input.itemId }, data: { harga_snapshot: null } });

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
    const existing = await db.bqSubObject.findUnique({
      where: { id: input.id },
      include: { item: { include: { section: true, subsection: true } } },
    });
    if (!existing) throw new AppError("NOT_FOUND", "bq.sub-object.not-found", "Sub-object not found");

    const projectId = existing.item.section?.project_id ?? existing.item.subsection?.section_id;
    if (projectId) {
      const section = existing.item.section ?? (existing.item.subsection ? await db.bqSection.findUnique({ where: { id: existing.item.subsection.section_id } }) : null);
      const project = section ? await db.bqProject.findUnique({ where: { id: section.project_id } }) : null;
      if (project?.status === "LOCKED") throw new AppError("CONFLICT", "bq.project.locked", "Cannot edit a locked project");
    }

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
    const subObject = await db.bqSubObject.findUnique({ where: { id: input.id }, select: { item_id: true } });
    if (!subObject) throw new AppError("NOT_FOUND", "bq.sub-object.not-found", "Sub-object not found");
    await requireEditableProjectForItem(subObject.item_id);
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
      throw new AppError("VALIDATION", "bq.line-item.no-parent", "Line item must belong to a sub-object or item");
    }
    if (input.subObjectId && input.itemId) {
      throw new AppError("VALIDATION", "bq.line-item.dual-parent", "Line item cannot belong to both sub-object and item");
    }

    if (input.subObjectId) {
      const subObject = await db.bqSubObject.findUnique({
        where: { id: input.subObjectId },
        include: { item: { include: { section: true, subsection: true } } },
      });
      if (!subObject) throw new AppError("NOT_FOUND", "bq.sub-object.not-found", "Sub-object not found");
      const projectId = subObject.item.section?.project_id ?? subObject.item.subsection?.section_id;
      if (projectId) {
        const section = subObject.item.section ?? (subObject.item.subsection ? await db.bqSection.findUnique({ where: { id: subObject.item.subsection.section_id } }) : null);
        const project = section ? await db.bqProject.findUnique({ where: { id: section.project_id } }) : null;
        if (project?.status === "LOCKED") throw new AppError("CONFLICT", "bq.project.locked", "Cannot edit a locked project");
      }
    }

    if (input.itemId) {
      const item = await db.bqItem.findUnique({
        where: { id: input.itemId },
        include: { section: true, subsection: true },
      });
      if (!item) throw new AppError("NOT_FOUND", "bq.item.not-found", "Item not found");
      const projectId = item.section?.project_id ?? item.subsection?.section_id;
      if (projectId) {
        const section = item.section ?? (item.subsection ? await db.bqSection.findUnique({ where: { id: item.subsection.section_id } }) : null);
        const project = section ? await db.bqProject.findUnique({ where: { id: section.project_id } }) : null;
        if (project?.status === "LOCKED") throw new AppError("CONFLICT", "bq.project.locked", "Cannot edit a locked project");
      }
    }

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
        harga_snapshot: input.hargaSnapshot,
        currency_snapshot: input.currencySnapshot ?? "IDR",
        kategori: requireKategori(input.kategori),
        qty: input.qty,
        koefisien: input.koefisien ?? "1",
        sort_order: input.sortOrder ?? 0,
        notes: input.notes ?? null,
      },
    });
    const parentItemId = input.itemId
      ?? (await db.bqSubObject.findUnique({ where: { id: input.subObjectId! }, select: { item_id: true } }))?.item_id;
    if (parentItemId) {
      await db.bqItem.update({ where: { id: parentItemId }, data: { harga_snapshot: null } });
    }

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
    const existing = await db.bqLineItem.findUnique({
      where: { id: input.id },
      include: {
        sub_object: { include: { item: { include: { section: true, subsection: true } } } },
        item: { include: { section: true, subsection: true } },
      },
    });
    if (!existing) throw new AppError("NOT_FOUND", "bq.line-item.not-found", "Line item not found");

    const parentSubsection = existing.sub_object?.item.subsection ?? existing.item?.subsection ?? null;
    const section = existing.sub_object?.item.section
      ?? existing.item?.section
      ?? (parentSubsection ? await db.bqSection.findUnique({ where: { id: parentSubsection.section_id } }) : null);

    if (section) {
      const project = section ? await db.bqProject.findUnique({ where: { id: section.project_id } }) : null;
      if (project?.status === "LOCKED") throw new AppError("CONFLICT", "bq.project.locked", "Cannot edit a locked project");
    }

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
      action: "bq.line-item.updated",
      entityType: "BqLineItem",
      entityId: lineItem.id,
      actor: input.actor,
    });
    return lineItem;
  }

  async function deleteLineItem(input: {
    grants: PermissionGrants;
    actor: { kind: string; userId?: string; label: string };
    id: string;
  }) {
    requirePermission(input.grants, BQ_PERMISSIONS.projectManage);
    const lineItem = await db.bqLineItem.findUnique({
      where: { id: input.id },
      select: { item_id: true, sub_object: { select: { item_id: true } } },
    });
    if (!lineItem) throw new AppError("NOT_FOUND", "bq.line-item.not-found", "Line item not found");
    const itemId = lineItem.item_id ?? lineItem.sub_object?.item_id;
    if (!itemId) throw new AppError("CONFLICT", "bq.line-item.invalid-parent", "Line item does not belong to an item");
    await requireEditableProjectForItem(itemId);
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

  async function requestPromotion(input: {
    grants: PermissionGrants;
    actor: { kind: string; userId?: string; label: string };
    type: "material" | "labor" | "material_labor";
    libItemId: string;
  }) {
    requirePermission(input.grants, BQ_PERMISSIONS.libraryPromote);

    if (input.type === "material") {
      const item = await db.bqLibMaterial.findUnique({ where: { id: input.libItemId } });
      if (!item) throw new AppError("NOT_FOUND", "bq.lib-material.not-found", "Library material not found");
      if (item.kategori !== "MATERIAL") {
        throw new AppError("FORBIDDEN", "bq.promotion.not-eligible", "This item cannot be promoted to Master Data");
      }
      await db.bqLibMaterial.update({
        where: { id: input.libItemId },
        data: { promotion_status: "REQUESTED" },
      });
    } else if (input.type === "labor") {
      const item = await db.bqLibLabor.findUnique({ where: { id: input.libItemId } });
      if (!item) throw new AppError("NOT_FOUND", "bq.lib-labor.not-found", "Library labor not found");
      if (item.kategori !== "UPAH") {
        throw new AppError("FORBIDDEN", "bq.promotion.not-eligible", "This item cannot be promoted to Master Data");
      }
      await db.bqLibLabor.update({
        where: { id: input.libItemId },
        data: { promotion_status: "REQUESTED" },
      });
    } else {
      const item = await db.bqLibMaterialLabor.findUnique({ where: { id: input.libItemId } });
      if (!item) throw new AppError("NOT_FOUND", "bq.lib-material-labor.not-found", "Library material+labor not found");
      if (item.kategori !== "MATERIAL_UPAH") {
        throw new AppError("FORBIDDEN", "bq.promotion.not-eligible", "This item cannot be promoted to Master Data");
      }
      await db.bqLibMaterialLabor.update({
        where: { id: input.libItemId },
        data: { promotion_status: "REQUESTED" },
      });
    }

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
      type: string;
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
    type: "material" | "labor" | "material_labor";
    libItemId: string;
    masterdataRefId: string;
  }) {
    requirePermission(input.grants, BQ_PERMISSIONS.libraryPromoteApprove);

    if (input.type === "material") {
      await db.bqLibMaterial.update({
        where: { id: input.libItemId },
        data: { promotion_status: "APPROVED", masterdata_ref_id: input.masterdataRefId },
      });
    } else if (input.type === "labor") {
      await db.bqLibLabor.update({
        where: { id: input.libItemId },
        data: { promotion_status: "APPROVED", masterdata_ref_id: input.masterdataRefId },
      });
    } else {
      await db.bqLibMaterialLabor.update({
        where: { id: input.libItemId },
        data: { promotion_status: "APPROVED", masterdata_ref_id: input.masterdataRefId },
      });
    }

    await auditWriter({
      appId: "bq",
      action: "bq.promotion.approved",
      entityType: "BqLibItem",
      entityId: input.libItemId,
      actor: input.actor,
    });
  }

  async function rejectPromotion(input: {
    grants: PermissionGrants;
    actor: { kind: string; userId?: string; label: string };
    type: "material" | "labor" | "material_labor";
    libItemId: string;
    reason: string;
  }) {
    requirePermission(input.grants, BQ_PERMISSIONS.libraryPromoteApprove);

    if (input.type === "material") {
      await db.bqLibMaterial.update({
        where: { id: input.libItemId },
        data: { promotion_status: "DRAFT" },
      });
    } else if (input.type === "labor") {
      await db.bqLibLabor.update({
        where: { id: input.libItemId },
        data: { promotion_status: "DRAFT" },
      });
    } else {
      await db.bqLibMaterialLabor.update({
        where: { id: input.libItemId },
        data: { promotion_status: "DRAFT" },
      });
    }

    await auditWriter({
      appId: "bq",
      action: "bq.promotion.rejected",
      entityType: "BqLibItem",
      entityId: input.libItemId,
      actor: input.actor,
      changes: { reason: input.reason },
    });
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
    addSection,
    addSubsection,
    addItem,
    updateItem,
    deleteItem,
    addSubObject,
    updateSubObject,
    deleteSubObject,
    addLineItem,
    updateLineItem,
    deleteLineItem,
    requestPromotion,
    listPromotionRequests,
    approvePromotion,
    rejectPromotion,
  };

  return Object.fromEntries(
    Object.entries(operations).map(([name, operation]) => [
      name,
      (...args: unknown[]) => runTransaction(() => (operation as (...values: unknown[]) => Promise<unknown>)(...args)),
    ]),
  ) as typeof operations;
}
