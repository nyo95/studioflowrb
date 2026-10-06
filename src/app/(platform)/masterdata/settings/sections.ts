import { hasPermission, type PermissionGrants } from "@platform/core/rbac";
import { MASTERDATA_PERMISSIONS as P } from "@/apps/masterdata/public";
import type { SettingsSectionGroup } from "@/app/(platform)/settings/settings-sections";

/**
 * Master Data's own settings pages. Each shows only to people who may change or decide something on it:
 * the dictionaries to `masterdata.dictionary.manage`, deletion review to `masterdata.deletion.approve`,
 * BQ approvals (promoting a BQ library item into the catalog) to `masterdata.promotion.approve`.
 */
export function masterDataSettingsGroups(grants: PermissionGrants): SettingsSectionGroup[] {
  const dictionaries = hasPermission(grants, P.dictionaryManage);
  return [
    {
      heading: "Dictionaries",
      items: [
        { key: "units", href: "/masterdata/settings/units", label: "Units", visible: dictionaries },
        { key: "categories", href: "/masterdata/settings/categories", label: "Categories", visible: dictionaries },
        { key: "supplier-types", href: "/masterdata/settings/supplier-types", label: "Supplier types", visible: dictionaries },
      ],
    },
    {
      heading: "Approvals",
      items: [
        { key: "deletions", href: "/masterdata/settings/deletions", label: "Deletion review", visible: hasPermission(grants, P.deletionApprove) },
        { key: "bq-approvals", href: "/masterdata/settings/bq-approvals", label: "BQ approvals", visible: hasPermission(grants, P.promotionApprove) },
      ],
    },
  ];
}

export const MASTERDATA_SETTINGS_TRAIL = [
  { label: "Master Data", href: "/masterdata" },
  { label: "Settings", href: "/masterdata/settings" },
];
