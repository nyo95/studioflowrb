"use client";

import { AppShell, type AppShellProps } from "@/platform/ui_engine";
import { useHydratedPathname } from "./hydrated-pathname";
import { isRailPath } from "./shell-rules";

export function RouteAwareAppShell({ appRootPaths, ...shellProps }: AppShellProps & {
  appRootPaths: readonly string[];
}) {
  const pathname = useHydratedPathname();

  return (
    <AppShell
      {...shellProps}
      railVisible={pathname === null || isRailPath(pathname, appRootPaths)}
    />
  );
}
