import { redirect } from "next/navigation";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import { MASTERDATA_PERMISSIONS } from "@/apps/masterdata/service";
import { masterDataService } from "@/apps/masterdata/runtime";
import { SettingsFrame } from "@/app/(platform)/settings/settings-navigation";
import { canOpenSettingsSection } from "@/app/(platform)/settings/settings-sections";
import { CategoryDirectory } from "../../categories/category-directory";
import { MASTERDATA_SETTINGS_TRAIL, masterDataSettingsGroups } from "../sections";

export const dynamic = "force-dynamic";

export default async function CategoriesSettingsPage() {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { grants } = principalGrants;
  const groups = masterDataSettingsGroups(grants);
  const allowed = canOpenSettingsSection(groups, "categories");
  const categories = allowed ? await masterDataService.listCategories({ grants, includeDeactivated: true }) : [];
  return (
    <SettingsFrame appMark="MD" trail={MASTERDATA_SETTINGS_TRAIL} title="Categories" description="The category tree SKUs are filed under." groups={groups} active="categories" withPageShell={false} fill>
      <CategoryDirectory categories={categories} canManage={hasPermission(grants, MASTERDATA_PERMISSIONS.dictionaryManage)} />
    </SettingsFrame>
  );
}
