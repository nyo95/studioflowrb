import type { PermissionGrants } from "@platform/core/rbac";
import { requirePermission } from "@platform/core/rbac";
import { AppError } from "@platform/core/errors";

import { BQ_PERMISSIONS, type BqServiceContext } from "./context";

export function createTemplateService(ctx: BqServiceContext) {
  const { db, runTransaction, auditWriter } = ctx;

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
  description?: string | null;
}) {
  requirePermission(input.grants, BQ_PERMISSIONS.libraryManage);
  const existing = await db.bqTemplate.findUnique({ where: { id: input.id } });
  if (!existing) throw new AppError("NOT_FOUND", "bq.template.not-found", "Template not found");
  if ((input.name === undefined || input.name === existing.name) && (input.description === undefined || input.description === existing.description)) return existing;
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
  const changed = await runTransaction(async (tx) => {
    // Renumbering is addressed by ID, so the ownership check has to be
    // explicit: without it any section ID reorders inside another template.
    const owned = await tx.bqTemplateSection.findMany({
      where: { id: { in: input.orderedIds }, template_id: input.templateId },
      select: { id: true, sort_order: true },
    });
    if (owned.length !== input.orderedIds.length) {
      throw new AppError(
        "VALIDATION",
        "bq.template-section.wrong-template",
        "Every reordered section must belong to this template",
      );
    }
    const sortOrderById = new Map(owned.map((section) => [section.id, section.sort_order]));
    if (input.orderedIds.every((id, index) => sortOrderById.get(id) === index)) return false;
    for (let i = 0; i < input.orderedIds.length; i++) {
      await tx.bqTemplateSection.update({
        where: { id: input.orderedIds[i] },
        data: { sort_order: i },
      });
    }
    return true;
  });
  if (!changed) return;
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


  return {
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
  };
}
