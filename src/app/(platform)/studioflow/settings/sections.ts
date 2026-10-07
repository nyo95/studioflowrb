import { hasPermission, type PermissionGrants } from "@platform/core/rbac";
import { STUDIOFLOW_PERMISSIONS as P } from "@/apps/studioflow/public";
import type { SettingsSectionGroup } from "@/app/(platform)/settings/settings-sections";

/**
 * StudioFlow's own settings pages. Each shows only to people who may change something on it: templates to
 * `studioflow.settings.manage`; archived files also to `studioflow.project.manage`, who may run its cleanup.
 */
export function studioFlowSettingsGroups(grants: PermissionGrants): SettingsSectionGroup[] {
  const settings = hasPermission(grants, P.settingsManage);
  return [
    {
      heading: "Templates for new projects",
      items: [
        { key: "phases", href: "/studioflow/settings/phases", label: "Phase templates", visible: settings },
        { key: "checklists", href: "/studioflow/settings/checklists", label: "Checklist templates", visible: settings },
        { key: "schedule", href: "/studioflow/settings/schedule", label: "Schedule templates", visible: settings },
      ],
    },
    {
      heading: "Planning",
      items: [
        { key: "planning", href: "/studioflow/settings/planning", label: "Planning and holidays", visible: settings },
      ],
    },
    {
      heading: "Storage",
      items: [
        { key: "archived-files", href: "/studioflow/settings/archived-files", label: "Archived files", visible: settings || hasPermission(grants, P.projectManage) },
      ],
    },
  ];
}

export const STUDIOFLOW_SETTINGS_TRAIL = [
  { label: "StudioFlow", href: "/studioflow" },
  { label: "Settings", href: "/studioflow/settings" },
];
