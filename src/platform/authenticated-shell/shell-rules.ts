import { hasPermission } from "@platform/core/rbac";

export function isApplicationPath(pathname: string, appRootPaths: readonly string[]): boolean {
  return appRootPaths.some((rootPath) => pathname === rootPath || pathname.startsWith(`${rootPath}/`));
}

/**
 * One flag for the account menu's single "Settings" entry — General
 * Settings, Users, and Roles & Access all live inside the same settings
 * canvas now (one sidebar, `SettingsShell`), so the menu only needs to know
 * whether the principal can read into that canvas at all, not which
 * individual destination. Per-destination gating still happens on each
 * settings page itself.
 */
export function getSettingsMenuVisibility(grants: readonly string[]) {
  const showSettings = hasPermission(grants, "platform.settings.read")
    || hasPermission(grants, "platform.user.read")
    || hasPermission(grants, "platform.role.read");

  return { showSettings } as const;
}
