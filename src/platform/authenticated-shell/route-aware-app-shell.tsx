"use client";

import { usePathname } from "next/navigation";

import { AppShell, type AppShellProps } from "@/platform/ui_engine";
import { isApplicationPath } from "./shell-rules";

export function RouteAwareAppShell({ appRootPaths, ...shellProps }: AppShellProps & {
  appRootPaths: readonly string[];
}) {
  const pathname = usePathname();

  return (
    <AppShell
      {...shellProps}
      railVisible={isApplicationPath(pathname, appRootPaths)}
    />
  );
}
