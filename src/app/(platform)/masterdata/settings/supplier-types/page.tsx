import { redirect } from "next/navigation";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import { MASTERDATA_PERMISSIONS } from "@/apps/masterdata/service";
import { masterDataService } from "@/apps/masterdata/runtime";
import { SettingsFrame } from "@/app/(platform)/settings/settings-navigation";
import { canOpenSettingsSection } from "@/app/(platform)/settings/settings-sections";
import { VendorTypeDirectory } from "./vendor-type-directory";
import { MASTERDATA_SETTINGS_TRAIL, masterDataSettingsGroups } from "../sections";

export const dynamic = "force-dynamic";

export default async function SupplierTypesSettingsPage() {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { grants } = principalGrants;
  const groups = masterDataSettingsGroups(grants);
  const allowed = canOpenSettingsSection(groups, "supplier-types");
  const vendorTypes = allowed ? await masterDataService.listVendorTypes({ grants, includeArchived: true }) : [];
  return (
    <SettingsFrame appMark="MD" trail={MASTERDATA_SETTINGS_TRAIL} title="Supplier types" description="The kinds of supplier a vendor can be." groups={groups} active="supplier-types" withPageShell={false} fill>
      <VendorTypeDirectory rows={vendorTypes} canManage={hasPermission(grants, MASTERDATA_PERMISSIONS.dictionaryManage)} />
    </SettingsFrame>
  );
}
