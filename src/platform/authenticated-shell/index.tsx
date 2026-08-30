import type { ReactNode } from "react";
import { UserRound } from "lucide-react";

import { AppShell, Text, buttonClasses } from "@/platform/ui_engine";
import type { SessionPrincipal } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import type { PlatformGeneralSettings } from "@platform/core/settings";

import { AuthenticatedPlatformNavigation, type ShellAppLink } from "./navigation";

export function AuthenticatedShell({ principal, grants, settings, apps, logoutAction, appName, appAbbreviation, domainNavigation, domainUtilityNavigation, contextSlot, children }: {
  principal: SessionPrincipal;
  grants: readonly string[];
  settings: PlatformGeneralSettings;
  apps: readonly ShellAppLink[];
  logoutAction: () => Promise<void>;
  appName?: string;
  appAbbreviation?: string;
  domainNavigation?: ReactNode;
  domainUtilityNavigation?: ReactNode;
  contextSlot?: ReactNode;
  children: ReactNode;
}) {
  const productMark = settings.appTitle.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "SF";
  return (
    <AppShell
      brand={<div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        {settings.brandMarkUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- owner-configured URL/path has no fixed image host.
          <img src={settings.brandMarkUrl} alt="" style={{ width: 28, height: 28, objectFit: "contain" }} />
        ) : null}
        <div style={{ minWidth: 0 }}>
          <Text as="span" style={{ display: "block", fontWeight: 650, whiteSpace: "nowrap" }}>{settings.appTitle}</Text>
          <Text as="span" tone="tertiary" style={{ display: "block", fontSize: 11, whiteSpace: "nowrap" }}>{appName ?? settings.organizationName}</Text>
        </div>
      </div>}
      collapsedBrand={<Text as="span" style={{ fontWeight: 700 }}>{appAbbreviation ?? productMark}</Text>}
      collapsible
      navigationLabel={`${settings.appTitle} navigation`}
      navigation={<AuthenticatedPlatformNavigation
        apps={apps}
        showGeneralSettings={hasPermission(grants, "platform.settings.read")}
        showUsers={hasPermission(grants, "platform.user.read")}
        showRoles={hasPermission(grants, "platform.role.read")}
        domainNavigation={domainNavigation}
      />}
      utility={<>
        {domainUtilityNavigation}
        <form action={logoutAction}>
          <button type="submit" className={buttonClasses("ghost")} style={{ width: "100%", justifyContent: "flex-start" }}>Sign out</button>
        </form>
      </>}
      topbar={<div style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, paddingInline: 16 }}>
        {contextSlot}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, minWidth: 0 }} title={`Signed in as ${principal.displayName}`}>
          <UserRound size={17} aria-hidden="true" />
          <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 220 }}>{principal.displayName}</span>
        </div>
      </div>}
    >
      {children}
    </AppShell>
  );
}
