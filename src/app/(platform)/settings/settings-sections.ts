import { hasPermission, type PermissionGrants } from "@platform/core/rbac";

/**
 * Settings are owned by whoever owns the thing being configured (owner, 2026-10-06):
 *
 * - **My preferences** (`/account`) — the signed-in person's own account; everyone.
 * - **Platform settings** (`/settings/*`) — General, Users, Roles & Access; platform administrators only.
 * - **App settings** (`/<app>/settings/*`) — inside the app, with that app's rail; each page only for people
 *   who may change something on it.
 *
 * A settings sidebar lists only its own owner's pages, so no settings area links into another one. A page shows
 * in a sidebar only when the person may open it, and each page re-checks the same rule itself.
 */
export type SettingsSection = { key: string; href: string; label: string; visible: boolean };
export type SettingsSectionGroup = { heading: string; items: SettingsSection[] };

export function visibleSettingsGroups(groups: readonly SettingsSectionGroup[]): SettingsSectionGroup[] {
  return groups.map((group) => ({ ...group, items: group.items.filter((item) => item.visible) })).filter((group) => group.items.length > 0);
}

/** Where a settings area's own root sends the person: the first page they may open, or null if none. */
export function firstSettingsHref(groups: readonly SettingsSectionGroup[]): string | null {
  return visibleSettingsGroups(groups)[0]?.items[0]?.href ?? null;
}

export function canOpenSettingsSection(groups: readonly SettingsSectionGroup[], key: string): boolean {
  return groups.some((group) => group.items.some((item) => item.key === key && item.visible));
}

export function sectionLabel(groups: readonly SettingsSectionGroup[], key: string): string {
  for (const group of groups) for (const item of group.items) if (item.key === key) return item.label;
  return key;
}

export const PLATFORM_SETTINGS_ROOT = "/settings";

export function platformSettingsGroups(grants: PermissionGrants): SettingsSectionGroup[] {
  return [
    {
      heading: "Platform",
      items: [
        { key: "general", href: "/settings/general", label: "General", visible: hasPermission(grants, "platform.settings.read") },
      ],
    },
    {
      heading: "People & access",
      items: [
        { key: "users", href: "/settings/access/users", label: "Users", visible: hasPermission(grants, "platform.user.read") },
        { key: "roles", href: "/settings/access/roles", label: "Roles & Access", visible: hasPermission(grants, "platform.role.read") },
      ],
    },
  ];
}
