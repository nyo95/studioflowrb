"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

const subscribe = () => () => undefined;
const clientSnapshot = () => true;
const serverSnapshot = () => false;

/**
 * Route-dependent shell structure must not use a server pathname that can differ from the browser's first value.
 * React reads the server snapshot again for the hydration render, then switches to the live Next pathname.
 */
export function useHydratedPathname(): string | null {
  const pathname = usePathname();
  const hydrated = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  return hydrated ? pathname : null;
}
