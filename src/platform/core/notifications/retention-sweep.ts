/**
 * Boot scheduler for the notification retention run. Injecting the run keeps the timer independent of the DB runtime.
 * Enabled in production, or anywhere with NOTIFICATION_RETENTION=on; a development server does not delete anything.
 */
export function startNotificationRetention(
  run: () => Promise<unknown>,
  environment: { NODE_ENV?: string; NOTIFICATION_RETENTION?: string } = process.env,
) {
  const enabled = environment.NOTIFICATION_RETENTION === "on" || (!environment.NOTIFICATION_RETENTION && environment.NODE_ENV === "production");
  if (!enabled) return;
  const sweep = async () => {
    try { await run(); } catch { console.error("Notification retention failed."); }
  };
  const initial = setTimeout(() => { void sweep(); }, 15_000);
  const daily = setInterval(() => { void sweep(); }, 86_400_000);
  initial.unref();
  daily.unref();
  return () => { clearTimeout(initial); clearInterval(daily); };
}
