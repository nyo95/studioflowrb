"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState, useTransition } from "react";

type Result = { ok: true; data: unknown } | { ok: false; error: { safeMessage: string } };

/**
 * Runs a StudioFlow server action, surfaces its safe error message, and
 * refreshes server data on success. Several commands may overlap; each key
 * stays pending until its own command settles.
 */
export function useCommand() {
  const router = useRouter();
  const inFlight = useRef(new Map<string, number>());
  const [pendingKeys, setPendingKeys] = useState<readonly string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const track = useCallback((key: string, delta: 1 | -1) => {
    const map = inFlight.current;
    const next = (map.get(key) ?? 0) + delta;
    if (next <= 0) map.delete(key);
    else map.set(key, next);
    setPendingKeys([...map.keys()]);
  }, []);

  const run = useCallback(
    /**
     * `refresh: false` is for an action that revalidates the page itself: its own response already carries the new
     * data, and a second refresh racing it can land later with older data (R9.232, a removed highlight that stayed).
     */
    (key: string, command: () => Promise<Result>, onSuccess?: (data: unknown) => void, options: { refresh?: boolean } = {}) =>
      new Promise<boolean>((resolve) => {
        track(key, 1);
        setError(null);
        startTransition(async () => {
          try {
            const result = await command();
            if (!result.ok) {
              setError(result.error.safeMessage);
              resolve(false);
              return;
            }
            onSuccess?.(result.data);
            if (options.refresh !== false) router.refresh();
            resolve(true);
          } catch {
            setError("The action could not be completed. Please try again.");
            resolve(false);
          } finally {
            track(key, -1);
          }
        });
      }),
    [router, track],
  );

  const pendingKey = pendingKeys.length > 0 ? pendingKeys[pendingKeys.length - 1] : null;
  return {
    run,
    /** Most recently started command still in flight (legacy single-key API). */
    pendingKey,
    pendingKeys,
    isPending: (key: string) => pendingKeys.includes(key),
    pending: pendingKeys.length > 0,
    error,
    clearError: () => setError(null),
  };
}
