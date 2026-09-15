"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";

type Result = { ok: true; data: unknown } | { ok: false; error: { safeMessage: string } };

/**
 * Runs a StudioFlow server action, surfaces its safe error message, and
 * refreshes server data on success. One pending command at a time.
 */
export function useCommand() {
  const router = useRouter();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const run = useCallback(
    (key: string, command: () => Promise<Result>, onSuccess?: (data: unknown) => void) =>
      new Promise<boolean>((resolve) => {
        setPendingKey(key);
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
            setPendingKey(null);
          }
        });
      }),
    [router],
  );

  return { run, pendingKey, pending: pendingKey !== null, error, clearError: () => setError(null) };
}
