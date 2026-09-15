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
    (key: string, command: () => Promise<Result>, onSuccess?: (data: unknown) => void) =>
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
            router.refresh();
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
