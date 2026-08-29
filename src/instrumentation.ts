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
  const { initializePermissionRegistry } = await import("@platform/core/rbac/registry");
  const { APP_REGISTRATIONS } = await import("./app/app-registrations");
  initializePermissionRegistry(APP_REGISTRATIONS);
}
