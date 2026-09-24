import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AppError } from "@platform/core/errors";

import { createPromotionCoordinator } from "./promotion-coordinator";

const GRANTS = ["masterdata.promotion.approve", "bq.library.manage"];
const ACTOR = { kind: "USER" as const, userId: "test-user", label: "Test" };

describe("PromotionCoordinator", () => {
  it("auto-rejects and throws PROMOTION_REFERENCE_ARCHIVED when the Master Data reference is archived at approval time", async () => {
    let rejectCalled = false;
    let approveCalled = false;

    const coordinator = createPromotionCoordinator({
      masterData: {
        listPromotionReferences: async () => [],
        validatePromotionReference: async () => {
          throw new AppError("NOT_FOUND", "PROMOTION_REFERENCE_NOT_FOUND", "archived");
        },
      },
      bq: {
        listPromotionRequests: async () => [],
        approvePromotion: async () => { approveCalled = true; },
        rejectPromotion: async (input) => {
          rejectCalled = true;
          assert.ok(input.reason.length > 0, "reject must include a reason");
        },
      },
    });

    await assert.rejects(
      () => coordinator.approve({ grants: GRANTS, actor: ACTOR, type: "material", libItemId: "lib-1", masterdataRefId: "ref-1" }),
      (error: unknown) => error instanceof AppError && error.code === "PROMOTION_REFERENCE_ARCHIVED",
    );

    assert.equal(rejectCalled, true, "promotion must be auto-rejected when reference is invalid");
    assert.equal(approveCalled, false, "approvePromotion must NOT be called when reference is invalid");
  });

  it("approves normally when the Master Data reference is valid", async () => {
    let approveCalled = false;
    let rejectCalled = false;

    const coordinator = createPromotionCoordinator({
      masterData: {
        listPromotionReferences: async () => [],
        validatePromotionReference: async (input) => ({ referenceId: input.referenceId }),
      },
      bq: {
        listPromotionRequests: async () => [],
        approvePromotion: async () => { approveCalled = true; },
        rejectPromotion: async () => { rejectCalled = true; },
      },
    });

    await coordinator.approve({ grants: GRANTS, actor: ACTOR, type: "material", libItemId: "lib-1", masterdataRefId: "ref-1" });

    assert.equal(approveCalled, true);
    assert.equal(rejectCalled, false);
  });
});
