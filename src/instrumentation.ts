/**
 * Server boot composition (Next.js instrumentation `register()` hook).
 *
 * The one code-owned permission registry is composed here, once per server
 * instance, from the platform vocabulary and each registered app's public
 * permission list. Registry-dependent code fails closed until this has run,
 * so no request can be evaluated against an incomplete vocabulary.
 *
 * Heavy modules load only in the Node.js runtime; other runtimes never
 * resolve grants.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Fail at boot rather than serve private assets behind a guessable signature:
  // the private read route authorizes on the HMAC alone, so an unset or short
  // SESSION_SECRET is a data-exposure risk, not a degraded feature.
  const { assertAssetSigningConfigured } = await import(
    "@platform/infrastructure/storage/asset-signing"
  );
  assertAssetSigningConfigured();
  // The folder holds the only copy of every upload; refuse to start on a
  // fallback, relative, or in-checkout location rather than lose files later.
  const { assertStorageRootConfigured } = await import("@platform/infrastructure/storage/storage-root");
  await assertStorageRootConfigured();
  const { initializePermissionRegistry } = await import("@platform/core/rbac/registry");
  const { initializeModuleRegistry } = await import("@platform/core/modules/manifest");
  const { synchronizeModuleVersions } = await import("@platform/core/modules/state");
  const { APP_REGISTRATIONS, MODULE_MANIFESTS } = await import("./app/app-registrations");
  initializePermissionRegistry(APP_REGISTRATIONS);
  initializeModuleRegistry(MODULE_MANIFESTS);
  await synchronizeModuleVersions();
  try {
    const { startStudioFlowAssetSweep } = await import("./apps/studioflow/runtime");
    startStudioFlowAssetSweep();
  } catch {
    console.error("StudioFlow asset cleanup startup failed.");
  }
  try {
    const { startNotificationRetention } = await import("@platform/core/notifications/retention-sweep");
    const { notificationRetention } = await import("@platform/runtime");
    startNotificationRetention(() => notificationRetention.purgeReadNotifications());
  } catch {
    console.error("Notification retention startup failed.");
  }
}
