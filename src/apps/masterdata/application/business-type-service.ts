import { diffAuditChanges, prepareAuditEvent } from "@platform/core/audit";
import { AppError } from "@platform/core/errors";
import { requirePermission } from "@platform/core/rbac";
import { normalizeText } from "@platform/utilities/normalization";

import { runInMasterDataTransaction, type MasterDataExecutionContext, type MasterDataUseCasePorts } from "./execution-context";
import { MASTERDATA_DICTIONARY_MANAGE, MASTERDATA_DICTIONARY_READ } from "./masterdata-permissions";
import type { BusinessTypeRecord, BusinessTypeRepository } from "./party-repository";

export type BusinessTypeCreateInput = { requestedId?: string; code: string; label: string; description?: string | null; sortOrder?: number };
export type BusinessTypeUpdateInput = { id: string; code: string; label?: string; description?: string | null; sortOrder?: number };

function normalizeCode(value: string): string {
  const code = normalizeText(value).toLocaleUpperCase("en-US");
  if (!/^[A-Z][A-Z0-9_]*$/.test(code)) throw new AppError("VALIDATION", "BUSINESS_TYPE_CODE_INVALID", "Business Type code must use uppercase letters, digits, and underscores.");
  return code;
}

function optionalText(value: string | null | undefined) {
  return value === null || value === undefined ? null : normalizeText(value) || null;
}

function auditShape(row: BusinessTypeRecord): Record<string, unknown> {
  return { code: row.code, label: row.label, description: row.description, sortOrder: row.sortOrder };
}

export class BusinessTypeService {
  constructor(private readonly ports: MasterDataUseCasePorts & { businessTypes: BusinessTypeRepository }) {}

  list(context: MasterDataExecutionContext, includeDeleted = false) {
    requirePermission(context.grants, MASTERDATA_DICTIONARY_READ);
    return runInMasterDataTransaction(context, this.ports.runTransaction, (tx) => this.ports.businessTypes.list(tx, includeDeleted));
  }

  create(context: MasterDataExecutionContext, input: BusinessTypeCreateInput): Promise<BusinessTypeRecord> {
    requirePermission(context.grants, MASTERDATA_DICTIONARY_MANAGE);
    const code = normalizeCode(input.code);
    const label = normalizeText(input.label);
    if (!label) throw new AppError("VALIDATION", "BUSINESS_TYPE_LABEL_REQUIRED", "Business Type label is required.");
    return runInMasterDataTransaction(context, this.ports.runTransaction, async (tx) => {
      if (await this.ports.businessTypes.findByCode(tx, code)) throw new AppError("CONFLICT", "BUSINESS_TYPE_CODE_TAKEN", "This Business Type code already exists.");
      const row = await this.ports.businessTypes.create(tx, { id: input.requestedId ?? this.ports.generateId(), code, label, description: optionalText(input.description), sortOrder: input.sortOrder ?? 0 });
      await this.ports.auditWriter.write(prepareAuditEvent({ appId: "masterdata", action: "business-type.created", entityType: "business-type", entityId: row.id, actor: context.actor, requestId: context.requestId, occurredAt: this.ports.now(), changes: diffAuditChanges({}, auditShape(row)) }), tx);
      return row;
    });
  }

  update(context: MasterDataExecutionContext, input: BusinessTypeUpdateInput): Promise<BusinessTypeRecord> {
    requirePermission(context.grants, MASTERDATA_DICTIONARY_MANAGE);
    return runInMasterDataTransaction(context, this.ports.runTransaction, async (tx) => {
      const current = await this.ports.businessTypes.findById(tx, input.id);
      if (!current || current.deletedAt !== null) throw new AppError("NOT_FOUND", "BUSINESS_TYPE_NOT_FOUND", "This Business Type no longer exists.");
      if (normalizeCode(input.code) !== current.code) throw new AppError("INVARIANT", "BUSINESS_TYPE_CODE_IMMUTABLE", "Business Type code cannot be changed.");
      const label = input.label === undefined ? current.label : normalizeText(input.label);
      if (!label) throw new AppError("VALIDATION", "BUSINESS_TYPE_LABEL_REQUIRED", "Business Type label is required.");
      const next = { code: current.code, label, description: input.description === undefined ? current.description : optionalText(input.description), sortOrder: input.sortOrder ?? current.sortOrder };
      const changes = diffAuditChanges(auditShape(current), next);
      if (!Object.keys(changes).length) return current;
      const row = await this.ports.businessTypes.update(tx, current.id, { label: next.label, description: next.description, sortOrder: next.sortOrder });
      await this.ports.auditWriter.write(prepareAuditEvent({ appId: "masterdata", action: "business-type.updated", entityType: "business-type", entityId: row.id, actor: context.actor, requestId: context.requestId, occurredAt: this.ports.now(), changes }), tx);
      return row;
    });
  }

  softDelete(context: MasterDataExecutionContext, id: string): Promise<BusinessTypeRecord> {
    requirePermission(context.grants, MASTERDATA_DICTIONARY_MANAGE);
    return runInMasterDataTransaction(context, this.ports.runTransaction, async (tx) => {
      const current = await this.ports.businessTypes.findById(tx, id);
      if (!current || current.deletedAt !== null) throw new AppError("NOT_FOUND", "BUSINESS_TYPE_NOT_FOUND", "This Business Type no longer exists.");
      if ((await this.ports.businessTypes.countLivePartyAssignments(tx, id)) > 0) throw new AppError("CONFLICT", "BUSINESS_TYPE_STILL_ASSIGNED", "This Business Type is assigned to a live Party.");
      const deletedAt = this.ports.now();
      const row = await this.ports.businessTypes.setDeletedAt(tx, id, deletedAt);
      await this.ports.auditWriter.write(prepareAuditEvent({ appId: "masterdata", action: "business-type.deleted", entityType: "business-type", entityId: id, actor: context.actor, requestId: context.requestId, occurredAt: deletedAt, changes: { deletedAt: { from: null, to: deletedAt } } }), tx);
      return row;
    });
  }

  restore(context: MasterDataExecutionContext, id: string): Promise<BusinessTypeRecord> {
    requirePermission(context.grants, MASTERDATA_DICTIONARY_MANAGE);
    return runInMasterDataTransaction(context, this.ports.runTransaction, async (tx) => {
      const current = await this.ports.businessTypes.findById(tx, id);
      if (!current) throw new AppError("NOT_FOUND", "BUSINESS_TYPE_NOT_FOUND", "This Business Type no longer exists.");
      if (current.deletedAt === null) throw new AppError("CONFLICT", "BUSINESS_TYPE_NOT_DELETED", "Only a deleted Business Type can be restored.");
      const conflict = await this.ports.businessTypes.findByCode(tx, current.code);
      if (conflict && conflict.id !== current.id) throw new AppError("CONFLICT", "BUSINESS_TYPE_CODE_TAKEN", "This Business Type code is already used.");
      const row = await this.ports.businessTypes.setDeletedAt(tx, id, null);
      await this.ports.auditWriter.write(prepareAuditEvent({ appId: "masterdata", action: "business-type.restored", entityType: "business-type", entityId: id, actor: context.actor, requestId: context.requestId, occurredAt: this.ports.now(), changes: { deletedAt: { from: current.deletedAt, to: null } } }), tx);
      return row;
    });
  }
}
