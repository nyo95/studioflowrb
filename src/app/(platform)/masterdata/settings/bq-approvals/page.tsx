import { redirect } from "next/navigation";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import { MASTERDATA_PERMISSIONS } from "@/apps/masterdata/service";
import { masterDataService } from "@/apps/masterdata/runtime";
import { SettingsFrame } from "@/app/(platform)/settings/settings-navigation";
import { canOpenSettingsSection } from "@/app/(platform)/settings/settings-sections";
import { promotionCoordinator } from "@/app/promotion-runtime";
import { PromotionReview } from "./promotion-review";
import { MASTERDATA_SETTINGS_TRAIL, masterDataSettingsGroups } from "../sections";

export const dynamic = "force-dynamic";

export default async function BqApprovalsSettingsPage() {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { grants } = principalGrants;
  const groups = masterDataSettingsGroups(grants);
  const allowed = canOpenSettingsSection(groups, "bq-approvals");
  const [requests, references] = allowed ? await Promise.all([promotionCoordinator.listRequests({ grants }), promotionCoordinator.listReferences({ grants })]) : [[], []];
  return (
    <SettingsFrame appMark="MD" trail={MASTERDATA_SETTINGS_TRAIL} title="BQ approvals" description="BQ library items proposed for the Master Data catalog." groups={groups} active="bq-approvals" withPageShell={false} fill>
      <PromotionReview requests={requests} references={references} />
    </SettingsFrame>
  );
}
