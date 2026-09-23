import type { getPermissionRegistry } from "@platform/core/rbac/registry";

type Registry = ReturnType<typeof getPermissionRegistry>;

/** `app.resource.action` (e.g. `studioflow.schedule.manage`) or the two-segment app-access form (`masterdata.access`). */
function parsePermissionId(id: string): { appId: string; resource: string | null; action: string } {
  const parts = id.split(".");
  if (parts.length <= 2) return { appId: parts[0] ?? id, resource: null, action: parts[1] ?? "access" };
  return { appId: parts[0], resource: parts.slice(1, -1).join("."), action: parts[parts.length - 1] };
}

function titleCase(segment: string): string {
  return segment
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function appLabelOf(appId: string, registry: Registry): string {
  if (appId === "platform") return "Platform";
  return registry.findAppById(appId)?.name ?? appId;
}

export type PermissionRow = { id: string; actionLabel: string };
export type ResourceGroup = { resourceLabel: string; permissions: PermissionRow[] };
export type AppGroup = { appLabel: string; resources: ResourceGroup[] };

/**
 * Groups the flat registry permission list by app, then by resource within
 * that app, so a resource with a Read/Manage pair (or any other set of
 * actions) renders as one row instead of two unrelated lines lost in a
 * 39-item scroll. Order is preserved from the input list (already Platform,
 * then each registered app, in registration order — `composePermissionRegistry`
 * builds `.permissions` that way) rather than re-sorted alphabetically, so a
 * resource's actions stay in the order the app itself declared them.
 */
export function groupPermissionsByApp(permissionIds: readonly string[], registry: Registry): AppGroup[] {
  const apps: AppGroup[] = [];
  for (const id of permissionIds) {
    const { appId, resource, action } = parsePermissionId(id);
    const appLabel = appLabelOf(appId, registry);
    let app = apps.find((a) => a.appLabel === appLabel);
    if (!app) { app = { appLabel, resources: [] }; apps.push(app); }
    const resourceLabel = resource ? titleCase(resource) : "Access this app";
    let group = app.resources.find((r) => r.resourceLabel === resourceLabel);
    if (!group) { group = { resourceLabel, permissions: [] }; app.resources.push(group); }
    group.permissions.push({ id, actionLabel: titleCase(action) });
  }
  return apps;
}
