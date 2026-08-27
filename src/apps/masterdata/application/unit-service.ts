import { diffAuditChanges, prepareAuditEvent } from "@platform/core/audit";
import { AppError } from "@platform/core/errors";
import { requirePermission } from "@platform/core/rbac";
import { normalizeText } from "@platform/utilities/normalization";

import {
  assertUnitCanBeDeleted,
  assertUnitCodeImmutable,
  filterUnitsForUsage,
  normalizeUnitCode,
  unitSearchKey,
  normalizeUnitUsages,
  type UnitUsage,
} from "../domain/unit-rules";
import { runInMasterDataTransaction, type MasterDataExecutionContext, type MasterDataUseCasePorts } from "./execution-context";
import { MASTERDATA_DICTIONARY_MANAGE, MASTERDATA_DICTIONARY_READ } from "./masterdata-permissions";
import type { UnitRecord, UnitRepository } from "./unit-repository";

export type UnitListInput = {
  query?: string;
  /** Usage-aware selection: restricts the picker context, never converts values. */
  usage?: UnitUsage;
  includeDeleted?: boolean;
};

export type UnitCreateInput = {
  code: string;
  label: string;
  symbol?: string | null;
  aliases?: readonly string[];
  usages?: readonly UnitUsage[];
  sortOrder?: number;
};

export type UnitUpdateInput = {
  id: string;
  /** Codes are immutable controlled data; the value must match the stored code. */
  code: string;
  label?: string;
  symbol?: string | null;
  aliases?: readonly string[];
  usages?: readonly UnitUsage[];
  sortOrder?: number;
};

function normalizeAliases(values: readonly string[], code: string): string[] {
  const seen = new Set<string>();
  const aliases: string[] = [];
  for (const value of values) {
    const alias = normalizeText(value);
    if (!alias) continue;
    const key = unitSearchKey(alias);
    if (key === unitSearchKey(code) || seen.has(key)) continue;
    seen.add(key);
    aliases.push(alias);
  }
  return aliases;
}

function normalizeSymbol(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const normalized = normalizeText(value);
  return normalized ? normalized : null;
}

function unitAuditShape(record: UnitRecord): Record<string, unknown> {
  return {
    code: record.code,
    label: record.label,
    symbol: record.symbol,
    aliases: record.aliases,
    usages: record.usages,
    sortOrder: record.sortOrder,
  };
}

/**
 * Unit controlled-dictionary use cases (MD-00 §1). Codes are immutable and
 * globally unique including soft-deleted rows; usage filters restrict picker
 * context without converting values. Ordinary workflows never invent units —
 * creation is an explicit dictionary manage action only.
 */
export class UnitService {
  constructor(private readonly ports: MasterDataUseCasePorts & { units: UnitRepository }) {}

  async list(context: MasterDataExecutionContext, input: UnitListInput = {}): Promise<UnitRecord[]> {
    requirePermission(context.grants, MASTERDATA_DICTIONARY_READ);
    const query = normalizeText(input.query ?? "");
    const units = await runInMasterDataTransaction(context, this.ports.runTransaction, (tx) =>
      this.ports.units.list(tx, { query: query ? query : undefined, includeDeleted: input.includeDeleted ?? false }),
    );
    if (input.usage === undefined) return units;
    return filterUnitsForUsage(units, input.usage);
  }

  create(context: MasterDataExecutionContext, input: UnitCreateInput): Promise<UnitRecord> {
    requirePermission(context.grants, MASTERDATA_DICTIONARY_MANAGE);
    const code = normalizeUnitCode(input.code ?? "");
    const label = normalizeText(input.label ?? "");
    if (!label) {
      throw new AppError("VALIDATION", "UNIT_LABEL_REQUIRED", "Unit label is required.");
    }
    const symbol = normalizeSymbol(input.symbol ?? null);
    const usages = normalizeUnitUsages(input.usages ?? []);
    const sortOrder = input.sortOrder ?? 0;

    return runInMasterDataTransaction(context, this.ports.runTransaction, async (tx) => {
      const aliases = normalizeAliases(input.aliases ?? [], code);
      const conflict = await this.ports.units.findByCode(tx, code);
      if (conflict) {
        throw new AppError(
          "CONFLICT",
          "UNIT_CODE_TAKEN",
          "This unit code already exists. Codes are unique even for soft-deleted units.",
        );
      }

      const record = await this.ports.units.create(tx, {
        id: this.ports.generateId(),
        code,
        label,
        symbol,
        aliases,
        usages,
        sortOrder,
      });

      await this.ports.auditWriter.write(
        prepareAuditEvent({
          appId: "masterdata",
          action: "unit.created",
          entityType: "unit",
          entityId: record.id,
          actor: context.actor,
          changes: diffAuditChanges({}, unitAuditShape(record)),
          occurredAt: this.ports.now(),
        }),
        tx,
      );
      return record;
    });
  }

  update(context: MasterDataExecutionContext, input: UnitUpdateInput): Promise<UnitRecord> {
    requirePermission(context.grants, MASTERDATA_DICTIONARY_MANAGE);

    return runInMasterDataTransaction(context, this.ports.runTransaction, async (tx) => {
      const current = await this.ports.units.findById(tx, input.id);
      if (!current || current.deletedAt !== null) {
        throw new AppError("NOT_FOUND", "UNIT_NOT_FOUND", "This unit no longer exists.");
      }

      assertUnitCodeImmutable(current.code, input.code ?? "");

      const label = input.label === undefined ? current.label : normalizeText(input.label);
      if (!label) {
        throw new AppError("VALIDATION", "UNIT_LABEL_REQUIRED", "Unit label is required.");
      }
      const symbol = input.symbol === undefined ? current.symbol : normalizeSymbol(input.symbol);
      const aliases = input.aliases === undefined ? current.aliases : normalizeAliases(input.aliases, current.code);
      const usages = input.usages === undefined ? current.usages : normalizeUnitUsages(input.usages);
      const sortOrder = input.sortOrder ?? current.sortOrder;

      const nextShape: Record<string, unknown> = {
        code: current.code,
        label,
        symbol,
        aliases,
        usages,
        sortOrder,
      };
      const changes = diffAuditChanges(unitAuditShape(current), nextShape);
      if (Object.keys(changes).length === 0) return current;

      const updated = await this.ports.units.update(tx, current.id, {
        label,
        symbol,
        aliases,
        usages,
        sortOrder,
      });

      await this.ports.auditWriter.write(
        prepareAuditEvent({
          appId: "masterdata",
          action: "unit.updated",
          entityType: "unit",
          entityId: current.id,
          actor: context.actor,
          changes,
          occurredAt: this.ports.now(),
        }),
        tx,
      );
      return updated;
    });
  }

  softDelete(context: MasterDataExecutionContext, id: string): Promise<UnitRecord> {
    requirePermission(context.grants, MASTERDATA_DICTIONARY_MANAGE);

    return runInMasterDataTransaction(context, this.ports.runTransaction, async (tx) => {
      const current = await this.ports.units.findById(tx, id);
      if (!current || current.deletedAt !== null) {
        throw new AppError("NOT_FOUND", "UNIT_NOT_FOUND", "This unit no longer exists.");
      }

      const references = await this.ports.units.countDeleteReferences(tx, current.id);
      assertUnitCanBeDeleted(references);

      const deletedAt = this.ports.now();
      const updated = await this.ports.units.setDeletedAt(tx, current.id, deletedAt);
      await this.ports.auditWriter.write(
        prepareAuditEvent({
          appId: "masterdata",
          action: "unit.deleted",
          entityType: "unit",
          entityId: current.id,
          actor: context.actor,
          changes: { deletedAt: { from: null, to: deletedAt } },
          occurredAt: deletedAt,
        }),
        tx,
      );
      return updated;
    });
  }

  restore(context: MasterDataExecutionContext, id: string): Promise<UnitRecord> {
    requirePermission(context.grants, MASTERDATA_DICTIONARY_MANAGE);

    return runInMasterDataTransaction(context, this.ports.runTransaction, async (tx) => {
      const current = await this.ports.units.findById(tx, id);
      if (!current) {
        throw new AppError("NOT_FOUND", "UNIT_NOT_FOUND", "This unit no longer exists.");
      }
      if (current.deletedAt === null) {
        throw new AppError("CONFLICT", "UNIT_NOT_DELETED", "Only soft-deleted units can be restored.");
      }

      // Dictionary restore repeats the code uniqueness check even though codes
      // are globally unique including soft-deleted rows.
      const conflict = await this.ports.units.findByCode(tx, current.code);
      if (conflict && conflict.id !== current.id) {
        throw new AppError(
          "CONFLICT",
          "UNIT_CODE_TAKEN",
          "This unit code is already used by another record.",
        );
      }

      const restored = await this.ports.units.setDeletedAt(tx, current.id, null);
      await this.ports.auditWriter.write(
        prepareAuditEvent({
          appId: "masterdata",
          action: "unit.restored",
          entityType: "unit",
          entityId: current.id,
          actor: context.actor,
          changes: { deletedAt: { from: current.deletedAt, to: null } },
          occurredAt: this.ports.now(),
        }),
        tx,
      );
      return restored;
    });
  }
}
