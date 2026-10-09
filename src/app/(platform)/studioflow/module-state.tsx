"use client";

import { createContext, useContext, type ReactNode } from "react";

const StudioFlowModuleContext = createContext<ReadonlySet<string> | null>(null);

export function StudioFlowModuleState({ enabledModuleIds, children }: { enabledModuleIds: readonly string[]; children: ReactNode }) {
  return <StudioFlowModuleContext value={new Set(enabledModuleIds)}>{children}</StudioFlowModuleContext>;
}

export function useStudioFlowModuleEnabled(moduleId: "ideas" | "presentation"): boolean {
  const enabled = useContext(StudioFlowModuleContext);
  if (!enabled) throw new Error("StudioFlow module state is unavailable.");
  return enabled.has(moduleId);
}
