import { redirect } from "next/navigation";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import { MASTERDATA_PERMISSIONS } from "@/apps/masterdata/service";
import { masterDataService } from "@/apps/masterdata/runtime";
import { SettingsFrame } from "@/app/(platform)/settings/settings-navigation";
import { canOpenSettingsSection } from "@/app/(platform)/settings/settings-sections";
import { DeletionDirectory } from "../../deletions/deletion-directory";
import { MASTERDATA_SETTINGS_TRAIL, masterDataSettingsGroups } from "../sections";

export const dynamic = "force-dynamic";

export default async function DeletionReviewSettingsPage() {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { grants } = principalGrants;
  const groups = masterDataSettingsGroups(grants);
  const allowed = canOpenSettingsSection(groups, "deletions");
  const deletions = allowed ? await masterDataService.listDeletionRequests({ grants, status: "PENDING" }) : [];
  return (
    <SettingsFrame appMark="MD" trail={MASTERDATA_SETTINGS_TRAIL} title="Deletion review" description="Deletion requests waiting for a decision. Nothing is removed until it is approved here." groups={groups} active="deletions" withPageShell={false} fill>
      <DeletionDirectory pendingRequests={deletions} canApprove={hasPermission(grants, MASTERDATA_PERMISSIONS.deletionApprove)} />
    </SettingsFrame>
  );
}
