/**
 * Pure main-route resolution (roadmap, Platform Foundation: "configurable
 * main-route settings"). Kept outside `@platform/core` because it is a
 * StudioFlow-rebuild launcher policy, not a domain-neutral Core mechanism.
 *
 * Both `mainAppId` and `landingAppId` are advisory: an id that is null,
 * unknown, or not currently accessible is silently ignored rather than
 * enforced, so a stale or misconfigured setting degrades to the previous
 * fixed behavior instead of erroring or redirecting nowhere. Every candidate
 * this function can return comes from `accessibleApps[].rootPath`, which the
 * permission registry restricts to canonical, non-root local paths in
 * `platform/core/rbac/registry.ts`, so this can never redirect a user back
 * to the launcher route itself — there is no loop to guard against by
 * construction, not by a runtime check.
 */

export type MainRouteApp = { appId: string; rootPath: string };

export function resolveMainRoute(
  accessibleApps: readonly MainRouteApp[],
  mainAppId: string | null,
  landingAppId: string | null,
): string | null {
  if (accessibleApps.length === 0) return null;

  const findAccessible = (appId: string | null): MainRouteApp | undefined =>
    appId ? accessibleApps.find((app) => app.appId === appId) : undefined;

  const main = findAccessible(mainAppId ?? "masterdata");
  if (main) return main.rootPath;

  const landing = findAccessible(landingAppId);
  if (landing) return landing.rootPath;

  // No usable owner preference: preserve the previous fixed default so an
  // unconfigured instance behaves exactly as it did before this setting
  // existed. Master Data was the hardcoded default; first accessible app
  // (in registry order) was the fallback for everyone else.
  const legacyDefault = accessibleApps.find((app) => app.appId === "masterdata") ?? accessibleApps[0];
  return legacyDefault.rootPath;
}
