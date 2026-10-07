import {
  P,
  conflict,
  invalid,
  notFound,
  requirePermission,
  requireRead,
  requiredText,
  writeAudit,
  type CommandContext,
  type Db,
  type ReadContext,
  type StudioFlowPorts,
} from "../shared";

export function createPhaseTemplateService(db: Db, ports: StudioFlowPorts) {
  const { runTransaction } = ports;
  const phaseTemplates = {
    async listPhaseTemplates(input: ReadContext) {
      requireRead(input.grants);
      const rows = await db.sfPhaseTemplate.findMany({
        include: { definitions: { orderBy: { order_index: "asc" } } },
        orderBy: { name: "asc" },
      });
      return rows.map(toTemplateView);
    },

    async createPhaseTemplate(input: CommandContext & { name: string; isDefault?: boolean }) {
      requirePermission(input.grants, P.settingsManage);
      const name = requiredText(input.name, "TEMPLATE_NAME_REQUIRED", "Template name", 200);
      const isDefault = input.isDefault ?? false;
      return runTransaction(async (tx) => {
        if (isDefault) {
          await tx.sfPhaseTemplate.updateMany({ where: { is_default: true }, data: { is_default: false } });
        }
        const template = await tx.sfPhaseTemplate.create({ data: { name, is_default: isDefault } });
        await writeAudit(ports, tx, { action: "studioflow.phase-template.created", entityType: "phase-template", entityId: template.id, actor: input.actor, metadata: { name, isDefault } });
        return { templateId: template.id };
      });
    },

    async updatePhaseTemplate(input: CommandContext & { templateId: string; name?: string; isActive?: boolean; isDefault?: boolean }) {
      requirePermission(input.grants, P.settingsManage);
      return runTransaction(async (tx) => {
        const template = await tx.sfPhaseTemplate.findUnique({ where: { id: input.templateId } });
        if (!template) throw notFound("phase template");

        if (input.isActive === false && template.is_default) {
          throw conflict("CANNOT_DEACTIVATE_DEFAULT", "Cannot deactivate the default template. Set another template as default first.");
        }

        if (input.isDefault === false && template.is_default) {
          const otherActive = await tx.sfPhaseTemplate.findFirst({ where: { id: { not: input.templateId }, is_active: true } });
          if (!otherActive) throw conflict("NEED_DEFAULT_TEMPLATE", "At least one template must be the default.");
        }

        const changes: Record<string, { from: unknown; to: unknown }> = {};
        const data: Record<string, unknown> = {};
        if (input.name !== undefined) {
          const name = requiredText(input.name, "TEMPLATE_NAME_REQUIRED", "Template name", 200);
          if (name !== template.name) { changes.name = { from: template.name, to: name }; data.name = name; }
        }
        if (input.isActive !== undefined && input.isActive !== template.is_active) {
          changes.isActive = { from: template.is_active, to: input.isActive };
          data.is_active = input.isActive;
        }
        if (input.isDefault !== undefined && input.isDefault !== template.is_default) {
          changes.isDefault = { from: template.is_default, to: input.isDefault };
          data.is_default = input.isDefault;
        }

        if (input.isDefault === true) {
          const willBeActive = input.isActive !== undefined ? input.isActive : template.is_active;
          if (!willBeActive) throw conflict("CANNOT_DEFAULT_INACTIVE", "Cannot set an inactive template as the default.");
          await tx.sfPhaseTemplate.updateMany({ where: { is_default: true, id: { not: input.templateId } }, data: { is_default: false } });
        }

        if (Object.keys(data).length === 0) return { templateId: input.templateId };
        await tx.sfPhaseTemplate.update({ where: { id: input.templateId }, data });
        await writeAudit(ports, tx, { action: "studioflow.phase-template.updated", entityType: "phase-template", entityId: input.templateId, actor: input.actor, changes, metadata: { name: template.name } });
        return { templateId: input.templateId };
      });
    },

    async deletePhaseTemplate(input: CommandContext & { templateId: string }) {
      requirePermission(input.grants, P.settingsManage);
      return runTransaction(async (tx) => {
        const template = await tx.sfPhaseTemplate.findUnique({ where: { id: input.templateId } });
        if (!template) throw notFound("phase template");
        if (template.is_default) throw conflict("CANNOT_DELETE_DEFAULT", "Cannot delete the default template. Set another template as default first.");
        const usedBy = await tx.sfProject.count({ where: { phases: { some: { definition: { template_id: input.templateId } } } } });
        if (usedBy > 0) throw conflict("PHASE_TEMPLATE_IN_USE", `${usedBy} project${usedBy === 1 ? "" : "s"} ${usedBy === 1 ? "was" : "were"} created from this template. Deactivate it instead of deleting it.`);
        await tx.sfPhaseDefinition.deleteMany({ where: { template_id: input.templateId } });
        await tx.sfPhaseTemplate.delete({ where: { id: input.templateId } });
        await writeAudit(ports, tx, { action: "studioflow.phase-template.deleted", entityType: "phase-template", entityId: input.templateId, actor: input.actor, metadata: { name: template.name } });
        return { templateId: input.templateId };
      });
    },

    async createPhaseDefinition(input: CommandContext & { templateId: string; name: string; prefix: string; seat?: string; allowParallel?: boolean }) {
      requirePermission(input.grants, P.settingsManage);
      const name = requiredText(input.name, "PHASE_DEF_NAME_REQUIRED", "Phase name", 200);
      const prefix = requiredText(input.prefix.toUpperCase(), "PREFIX_REQUIRED", "Prefix", 4);
      if (prefix.length < 1 || prefix.length > 4) throw invalid("PREFIX_LENGTH", "Prefix must be 1-4 characters.");
      const seat = input.seat ?? "designer";
      if (seat !== "designer" && seat !== "drafter") throw invalid("INVALID_SEAT", "Seat must be 'designer' or 'drafter'.");
      return runTransaction(async (tx) => {
        const template = await tx.sfPhaseTemplate.findUnique({ where: { id: input.templateId } });
        if (!template) throw notFound("phase template");
        const existingDef = await tx.sfPhaseDefinition.findFirst({ where: { template_id: input.templateId, prefix } });
        if (existingDef) throw conflict("PREFIX_DUPLICATE", `Prefix "${prefix}" is already used in this template.`);
        const lastDef = await tx.sfPhaseDefinition.findFirst({ where: { template_id: input.templateId }, orderBy: { order_index: "desc" } });
        const orderIndex = (lastDef?.order_index ?? -1) + 1;
        const def = await tx.sfPhaseDefinition.create({
          data: { template_id: input.templateId, name, prefix, order_index: orderIndex, seat, allow_parallel: input.allowParallel ?? false },
        });
        await writeAudit(ports, tx, { action: "studioflow.phase-definition.created", entityType: "phase-definition", entityId: def.id, actor: input.actor, metadata: { templateId: input.templateId, name, prefix, seat } });
        return { definitionId: def.id };
      });
    },

    async updatePhaseDefinition(input: CommandContext & { definitionId: string; name?: string; prefix?: string; seat?: string; allowParallel?: boolean }) {
      requirePermission(input.grants, P.settingsManage);
      return runTransaction(async (tx) => {
        const def = await tx.sfPhaseDefinition.findUnique({ where: { id: input.definitionId } });
        if (!def) throw notFound("phase definition");

        const changes: Record<string, { from: unknown; to: unknown }> = {};
        const data: Record<string, unknown> = {};
        if (input.name !== undefined) {
          const name = requiredText(input.name, "PHASE_DEF_NAME_REQUIRED", "Phase name", 200);
          if (name !== def.name) { changes.name = { from: def.name, to: name }; data.name = name; }
        }
        if (input.prefix !== undefined) {
          const prefix = input.prefix.toUpperCase();
          if (prefix.length < 1 || prefix.length > 4) throw invalid("PREFIX_LENGTH", "Prefix must be 1-4 characters.");
          const existing = await tx.sfPhaseDefinition.findFirst({ where: { template_id: def.template_id, prefix, id: { not: input.definitionId } } });
          if (existing) throw conflict("PREFIX_DUPLICATE", `Prefix "${prefix}" is already used in this template.`);
          if (prefix !== def.prefix) { changes.prefix = { from: def.prefix, to: prefix }; data.prefix = prefix; }
        }
        if (input.seat !== undefined) {
          if (input.seat !== "designer" && input.seat !== "drafter") throw invalid("INVALID_SEAT", "Seat must be 'designer' or 'drafter'.");
          if (input.seat !== def.seat) { changes.seat = { from: def.seat, to: input.seat }; data.seat = input.seat; }
        }
        if (input.allowParallel !== undefined) {
          if (input.allowParallel !== def.allow_parallel) { changes.allowParallel = { from: def.allow_parallel, to: input.allowParallel }; data.allow_parallel = input.allowParallel; }
        }

        if (Object.keys(data).length === 0) return { definitionId: input.definitionId };
        await tx.sfPhaseDefinition.update({ where: { id: input.definitionId }, data });
        await writeAudit(ports, tx, { action: "studioflow.phase-definition.updated", entityType: "phase-definition", entityId: input.definitionId, actor: input.actor, changes, metadata: { templateId: def.template_id } });
        return { definitionId: input.definitionId };
      });
    },

    async deletePhaseDefinition(input: CommandContext & { definitionId: string }) {
      requirePermission(input.grants, P.settingsManage);
      return runTransaction(async (tx) => {
        const def = await tx.sfPhaseDefinition.findUnique({ where: { id: input.definitionId } });
        if (!def) throw notFound("phase definition");
        // R2.3B: Prevent deleting the final definition from the default template.
        const template = await tx.sfPhaseTemplate.findUnique({ where: { id: def.template_id } });
        if (template?.is_default) {
          const count = await tx.sfPhaseDefinition.count({ where: { template_id: def.template_id } });
          if (count <= 1) throw conflict("DEFAULT_TEMPLATE_REQUIRES_PHASE", "Cannot delete the last phase from the default template. Add another phase first, or set a different default.");
        }
        const usedBy = await tx.sfPhase.count({ where: { definition_id: input.definitionId } });
        if (usedBy > 0) throw conflict("PHASE_DEFINITION_IN_USE", `${usedBy} project phase${usedBy === 1 ? "" : "s"} ${usedBy === 1 ? "was" : "were"} created from this phase, so it cannot be deleted.`);
        const checklistTemplates = await tx.sfChecklistTemplate.count({ where: { definition_id: input.definitionId } });
        if (checklistTemplates > 0) throw conflict("PHASE_DEFINITION_HAS_CHECKLIST_TEMPLATES", `${checklistTemplates} checklist template${checklistTemplates === 1 ? "" : "s"} still reference this phase. Remove or reassign ${checklistTemplates === 1 ? "it" : "them"} first.`);
        await tx.sfPhaseDefinition.delete({ where: { id: input.definitionId } });
        const siblings = await tx.sfPhaseDefinition.findMany({ where: { template_id: def.template_id, order_index: { gt: def.order_index } }, orderBy: { order_index: "asc" } });
        for (const sib of siblings) {
          await tx.sfPhaseDefinition.update({ where: { id: sib.id }, data: { order_index: sib.order_index - 1 } });
        }
        await writeAudit(ports, tx, { action: "studioflow.phase-definition.deleted", entityType: "phase-definition", entityId: input.definitionId, actor: input.actor, metadata: { templateId: def.template_id, name: def.name, prefix: def.prefix } });
        return { definitionId: input.definitionId };
      });
    },

    async reorderPhaseDefinitions(input: CommandContext & { templateId: string; orderedIds: string[] }) {
      requirePermission(input.grants, P.settingsManage);
      return runTransaction(async (tx) => {
        const template = await tx.sfPhaseTemplate.findUnique({ where: { id: input.templateId } });
        if (!template) throw notFound("phase template");

        const defs = await tx.sfPhaseDefinition.findMany({ where: { template_id: input.templateId } });
        const defIds = new Set(defs.map((d) => d.id));
        if (input.orderedIds.length !== defs.length) throw invalid("REORDER_MISMATCH", "Ordered IDs must include all template definitions exactly once.");
        for (const id of input.orderedIds) {
          if (!defIds.has(id)) throw invalid("REORDER_INVALID_ID", "Ordered IDs contain unknown definition IDs.");
        }

        // R2.3C: Two-pass reorder to avoid unique constraint violations.
        // Pass 1: move all to temporary high offsets.
        const TEMP_BASE = 10_000;
        for (let i = 0; i < input.orderedIds.length; i++) {
          await tx.sfPhaseDefinition.update({ where: { id: input.orderedIds[i] }, data: { order_index: TEMP_BASE + i } });
        }
        // Pass 2: assign final offsets.
        for (let i = 0; i < input.orderedIds.length; i++) {
          await tx.sfPhaseDefinition.update({ where: { id: input.orderedIds[i] }, data: { order_index: i } });
        }
        await writeAudit(ports, tx, { action: "studioflow.phase-definition.reordered", entityType: "phase-definition", entityId: input.templateId, actor: input.actor, metadata: { orderedIds: input.orderedIds } });
        return { templateId: input.templateId };
      });
    },
  };

  function toTemplateView(row: { id: string; name: string; is_default: boolean; is_active: boolean; definitions: Array<{ id: string; name: string; prefix: string; order_index: number; allow_parallel: boolean; seat: string }> }) {
    return {
      id: row.id,
      name: row.name,
      isDefault: row.is_default,
      isActive: row.is_active,
      definitions: row.definitions.map((d) => ({
        id: d.id,
        name: d.name,
        prefix: d.prefix,
        orderIndex: d.order_index,
        allowParallel: d.allow_parallel,
        seat: d.seat as "designer" | "drafter",
      })),
    };
  }

  return phaseTemplates;
}

