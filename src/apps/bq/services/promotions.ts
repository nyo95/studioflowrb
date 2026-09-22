import type { PermissionGrants } from "@platform/core/rbac";
import { requirePermission } from "@platform/core/rbac";
import { AppError } from "@platform/core/errors";
import { MASTERDATA_PERMISSIONS } from "@/apps/masterdata/public";

import { BQ_PERMISSIONS, type BqServiceContext } from "./context";

type PromotableType = "material" | "labor" | "material_labor";

const PROMOTABLE = {
  material: { kategori: "MATERIAL", code: "bq.lib-material", label: "Library material" },
  labor: { kategori: "UPAH", code: "bq.lib-labor", label: "Library labor" },
  material_labor: { kategori: "MATERIAL_UPAH", code: "bq.lib-material-labor", label: "Library material+labor" },
} as const;

type PromotionStatus = "DRAFT" | "REQUESTED" | "APPROVED" | "REJECTED";
type PromotionUpdate = { promotion_status: PromotionStatus; masterdata_ref_id?: string };

export function createPromotionService(ctx: BqServiceContext) {
  const { db, auditWriter } = ctx;

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

/**
 * Atomic guarded transition: the WHERE clause re-checks `promotion_status`
 * in the same statement as the write, so two concurrent callers racing past
 * `loadPromotable`'s plain read can never both apply their transition — the
 * loser's `updateMany` matches zero rows once the winner has committed.
 */
async function transitionPromotionStatus(
  type: PromotableType,
  libItemId: string,
  expected: readonly PromotionStatus[],
  data: PromotionUpdate,
): Promise<void> {
  const where = { id: libItemId, promotion_status: { in: expected as PromotionStatus[] } };
  const result =
    type === "material"
      ? await db.bqLibMaterial.updateMany({ where, data })
      : type === "labor"
        ? await db.bqLibLabor.updateMany({ where, data })
        : await db.bqLibMaterialLabor.updateMany({ where, data });
  if (result.count === 0) {
    throw new AppError(
      "CONFLICT",
      "bq.promotion.invalid-status",
      "This item's promotion status changed before this action completed. Refresh and try again.",
    );
  }
}

async function requestPromotion(input: {
  grants: PermissionGrants;
  actor: { kind: string; userId?: string; label: string };
  type: PromotableType;
  libItemId: string;
}) {
  requirePermission(input.grants, BQ_PERMISSIONS.libraryPromote);
  await loadPromotable(input.type, input.libItemId, ["DRAFT", "REJECTED"]);
  await transitionPromotionStatus(input.type, input.libItemId, ["DRAFT", "REJECTED"], { promotion_status: "REQUESTED" });

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
  requirePermission(input.grants, MASTERDATA_PERMISSIONS.promotionApprove);

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
  requirePermission(input.grants, MASTERDATA_PERMISSIONS.promotionApprove);
  const masterdataRefId = input.masterdataRefId?.trim();
  if (!masterdataRefId) {
    throw new AppError(
      "VALIDATION",
      "bq.promotion.masterdata-ref-required",
      "An approved promotion must record the Master Data entry it links to",
    );
  }
  await loadPromotable(input.type, input.libItemId, ["REQUESTED"]);
  await transitionPromotionStatus(input.type, input.libItemId, ["REQUESTED"], {
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
  requirePermission(input.grants, MASTERDATA_PERMISSIONS.promotionApprove);
  const reason = input.reason?.trim();
  if (!reason) {
    throw new AppError("VALIDATION", "bq.promotion.reason-required", "A rejection must state its reason");
  }
  await loadPromotable(input.type, input.libItemId, ["REQUESTED"]);
  // bq-contract §8.2: a rejected request stays REJECTED until it is revised
  // and resubmitted. Resetting it to DRAFT erased the decision.
  await transitionPromotionStatus(input.type, input.libItemId, ["REQUESTED"], { promotion_status: "REJECTED" });

  await auditWriter({
    appId: "bq",
    action: "bq.promotion.rejected",
    entityType: "BqLibItem",
    entityId: input.libItemId,
    actor: input.actor,
    changes: { reason },
  });
}


  return {
    requestPromotion,
    listPromotionRequests,
    approvePromotion,
    rejectPromotion,
  };
}
