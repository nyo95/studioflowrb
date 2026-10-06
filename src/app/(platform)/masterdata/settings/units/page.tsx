import { redirect } from "next/navigation";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import { MASTERDATA_PERMISSIONS } from "@/apps/masterdata/service";
import { masterDataService } from "@/apps/masterdata/runtime";
import { SettingsFrame } from "@/app/(platform)/settings/settings-navigation";
import { canOpenSettingsSection } from "@/app/(platform)/settings/settings-sections";
import { UnitDirectory } from "../../units/unit-directory";
import { MASTERDATA_SETTINGS_TRAIL, masterDataSettingsGroups } from "../sections";

export const dynamic = "force-dynamic";

export default async function UnitsSettingsPage() {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { grants } = principalGrants;
  const groups = masterDataSettingsGroups(grants);
  const allowed = canOpenSettingsSection(groups, "units");
  const units = allowed ? await masterDataService.listUnits({ grants, includeArchived: true }) : [];
  return (
    <SettingsFrame appMark="MD" trail={MASTERDATA_SETTINGS_TRAIL} title="Units" description="Measurement units used by SKUs and prices." groups={groups} active="units" withPageShell={false} fill>
      <UnitDirectory units={units} canManage={hasPermission(grants, MASTERDATA_PERMISSIONS.dictionaryManage)} />
    </SettingsFrame>
  );
}
