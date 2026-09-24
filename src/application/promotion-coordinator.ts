import type { PermissionGrants } from "@platform/core/rbac";
import { AppError } from "@platform/core/errors";
import type { BqPromotionRequest } from "@/apps/bq/public";

type PromotionType = "material" | "labor" | "material_labor";
type Actor = { kind: "USER"; userId: string; label: string };

type PromotionCoordinatorDependencies = {
  masterData: {
    listPromotionReferences(input: { grants: PermissionGrants }): Promise<Array<{ id: string; type: PromotionType; label: string }>>;
    validatePromotionReference(input: {
      grants: PermissionGrants;
      type: PromotionType;
      referenceId: string;
    }): Promise<{ referenceId: string }>;
  };
  bq: {
    listPromotionRequests(input: { grants: PermissionGrants }): Promise<BqPromotionRequest[]>;
    approvePromotion(input: {
      grants: PermissionGrants;
      actor: Actor;
      type: PromotionType;
      libItemId: string;
      masterdataRefId: string;
    }): Promise<unknown>;
    rejectPromotion(input: {
      grants: PermissionGrants;
      actor: Actor;
      type: PromotionType;
      libItemId: string;
      reason: string;
    }): Promise<unknown>;
  };
};

/** Cross-app use case. Neither owning app imports the other's runtime. */
export function createPromotionCoordinator(deps: PromotionCoordinatorDependencies) {
  return {
    listReferences(input: { grants: PermissionGrants }) {
      return deps.masterData.listPromotionReferences(input);
    },
    listRequests(input: { grants: PermissionGrants }) {
      return deps.bq.listPromotionRequests(input);
    },
    async approve(input: {
      grants: PermissionGrants;
      actor: Actor;
      type: PromotionType;
      libItemId: string;
      masterdataRefId: string;
    }) {
      let reference: { referenceId: string };
      try {
        reference = await deps.masterData.validatePromotionReference({
          grants: input.grants,
          type: input.type,
          referenceId: input.masterdataRefId,
        });
      } catch {
        await deps.bq.rejectPromotion({
          grants: input.grants,
          actor: input.actor,
          type: input.type,
          libItemId: input.libItemId,
          reason: "Referenced Master Data price was archived or removed before approval.",
        });
        throw new AppError("CONFLICT", "PROMOTION_REFERENCE_ARCHIVED", "The referenced Master Data price is no longer available. The promotion has been automatically rejected.");
      }
      return deps.bq.approvePromotion({ ...input, masterdataRefId: reference.referenceId });
    },
    reject(input: {
      grants: PermissionGrants;
      actor: Actor;
      type: PromotionType;
      libItemId: string;
      reason: string;
    }) {
      return deps.bq.rejectPromotion(input);
    },
  };
}
