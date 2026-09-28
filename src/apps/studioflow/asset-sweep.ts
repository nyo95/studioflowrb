/** Most batches one scheduled run may drain before it stops and waits for the next day. */
const MAX_BATCHES_PER_RUN = 10;

/**
 * App-owned boot scheduler. Injecting the run keeps timers independent of the DB runtime.
 * A run keeps going while a batch comes back full (`projectsPurged === batchSize`), so a large
 * backlog drains in one scheduled run instead of `batchSize` projects per day.
 */
export function startAssetSweep(
  run: () => Promise<unknown>,
  environment: { NODE_ENV?: string; STUDIOFLOW_ASSET_SWEEP?: string } = process.env,
  batchSize = 25,
) {
  const enabled = environment.STUDIOFLOW_ASSET_SWEEP === "on" ||
    (!environment.STUDIOFLOW_ASSET_SWEEP && environment.NODE_ENV === "production");
  if (!enabled) return;
  const sweep = async () => {
    try {
      for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch++) {
        const result = await run();
        const purged = (result as { projectsPurged?: unknown } | null | undefined)?.projectsPurged;
        if (purged !== batchSize) break;
      }
    }
    catch { console.error("StudioFlow asset cleanup failed."); }
  };
  const initial = setTimeout(() => { void sweep(); }, 10_000);
  const daily = setInterval(() => { void sweep(); }, 86_400_000);
  initial.unref();
  daily.unref();
  return () => { clearTimeout(initial); clearInterval(daily); };
}
