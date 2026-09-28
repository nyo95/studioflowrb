/** App-owned boot scheduler. Injecting the run keeps timers independent of the DB runtime. */
export function startAssetSweep(
  run: () => Promise<unknown>,
  environment: { NODE_ENV?: string; STUDIOFLOW_ASSET_SWEEP?: string } = process.env,
) {
  const enabled = environment.STUDIOFLOW_ASSET_SWEEP === "on" ||
    (!environment.STUDIOFLOW_ASSET_SWEEP && environment.NODE_ENV === "production");
  if (!enabled) return;
  const sweep = async () => {
    try { await run(); }
    catch { console.error("StudioFlow asset cleanup failed."); }
  };
  const initial = setTimeout(() => { void sweep(); }, 10_000);
  const daily = setInterval(() => { void sweep(); }, 86_400_000);
  initial.unref();
  daily.unref();
  return () => { clearTimeout(initial); clearInterval(daily); };
}
