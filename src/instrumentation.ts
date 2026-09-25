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
  const { initializePermissionRegistry } = await import("@platform/core/rbac/registry");
  const { APP_REGISTRATIONS } = await import("./app/app-registrations");
  initializePermissionRegistry(APP_REGISTRATIONS);
}
