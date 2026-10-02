import { requirePermission, type PermissionGrants } from "@platform/core/rbac";
import { AppError } from "@platform/core/errors";
import { MASTERDATA_PERMISSIONS } from "@/apps/masterdata/public";
import type { masterDataRead } from "@/apps/bq/runtime";

import { snapshotFromMaterialPrice, snapshotFromWorkPrice } from "./snapshot";

export async function snapshotFromMasterData(input: {
  grants: PermissionGrants;
  sourceKind: "material" | "labor" | "material-labor";
  sourceRefId: string;
  read: Pick<typeof masterDataRead, "getMaterialPriceOption" | "listWorkPricesRead">;
}) {
  if (input.sourceKind === "material") {
    requirePermission(input.grants, MASTERDATA_PERMISSIONS.priceMaterialRead);
    const option = await input.read.getMaterialPriceOption(input.sourceRefId);
    if (!option) throw new AppError("NOT_FOUND", "bq.source.not-found", "That material price is no longer available");
    return snapshotFromMaterialPrice(option);
  }

  requirePermission(input.grants, MASTERDATA_PERMISSIONS.priceWorkRead);
  const options = await input.read.listWorkPricesRead({ kind: input.sourceKind });
  const option = options.find((candidate) => candidate.id === input.sourceRefId);
  if (!option) throw new AppError("NOT_FOUND", "bq.source.not-found", "That work price is no longer available");
  return snapshotFromWorkPrice(option, input.sourceKind);
}
