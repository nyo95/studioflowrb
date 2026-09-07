import { hasPermission } from "@platform/core/rbac";

export function isApplicationPath(pathname: string, appRootPaths: readonly string[]): boolean {
  return appRootPaths.some((rootPath) => pathname === rootPath || pathname.startsWith(`${rootPath}/`));
}

export function getAdministrationMenuVisibility(grants: readonly string[]) {
  const showGeneralSettings = hasPermission(grants, "platform.settings.read");
  const showUsers = hasPermission(grants, "platform.user.read");
  const showRoles = hasPermission(grants, "platform.role.read");

  return {
    showAdministration: showGeneralSettings || showUsers || showRoles,
    showGeneralSettings,
    showUsers,
    showRoles,
  } as const;
}
