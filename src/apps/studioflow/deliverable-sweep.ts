/** App-owned daily lifecycle runner. It follows the asset-sweep enablement rule. */
export function startDeliverableExpirySweep(
  run: () => Promise<unknown>,
  environment: { NODE_ENV?: string; STUDIOFLOW_DELIVERABLE_SWEEP?: string } = process.env,
) {
  const enabled = environment.STUDIOFLOW_DELIVERABLE_SWEEP === "on" ||
    (!environment.STUDIOFLOW_DELIVERABLE_SWEEP && environment.NODE_ENV === "production");
  if (!enabled) return;
  const sweep = async () => { try { await run(); } catch { console.error("StudioFlow deliverable cleanup failed."); } };
  const initial = setTimeout(() => { void sweep(); }, 10_000);
  const daily = setInterval(() => { void sweep(); }, 86_400_000);
  initial.unref();
  daily.unref();
  return () => { clearTimeout(initial); clearInterval(daily); };
}
