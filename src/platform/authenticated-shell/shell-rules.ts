import { hasPermission } from "@platform/core/rbac";

export function isApplicationPath(pathname: string, appRootPaths: readonly string[]): boolean {
  return appRootPaths.some((rootPath) => pathname === rootPath || pathname.startsWith(`${rootPath}/`));
}

/** Platform settings and My preferences: not an app, but they keep the same rail so every settings page looks alike. */
export const PLATFORM_AREA_ROOTS = ["/settings", "/account"] as const;

export function isPlatformAreaPath(pathname: string): boolean {
  return PLATFORM_AREA_ROOTS.some((rootPath) => pathname === rootPath || pathname.startsWith(`${rootPath}/`));
}

/** Where the rail shows: inside an app, and on the platform settings/preferences area. The launcher (`/`) has none. */
export function isRailPath(pathname: string, appRootPaths: readonly string[]): boolean {
  return isApplicationPath(pathname, appRootPaths) || isPlatformAreaPath(pathname);
}

/**
 * The account menu's and rail footer's single "Platform settings" entry (General, Users, Roles & Access).
 * It shows for any platform-settings read permission; `/settings` then opens the first page the person may
 * use. App settings are not reached from here: each app has its own Settings entry in its rail.
 */
export function getSettingsMenuVisibility(grants: readonly string[]) {
  const showSettings = hasPermission(grants, "platform.settings.read")
    || hasPermission(grants, "platform.user.read")
    || hasPermission(grants, "platform.role.read");

  return { showSettings } as const;
}
