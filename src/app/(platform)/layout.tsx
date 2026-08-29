import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppWindow, Settings, ShieldCheck, UserRound, Users } from "lucide-react";

import { AppShell, NavItem, Text, buttonClasses } from "@/platform/ui_engine";
import { requirePrincipalGrants } from "@platform/core/auth";
import { getPermissionRegistry } from "@platform/core/rbac/registry";
import { hasPermission } from "@platform/core/rbac";
import { logoutAction } from "./logout-action";

// The authenticated platform shell resolves live identity and grants on every
// request and must never be evaluated as static build-time content.
export const dynamic = "force-dynamic";

function LauncherBrand() {
  return (
    <Text as="span" style={{ fontWeight: 600, letterSpacing: "-0.01em" }}>
      StudioFlow
    </Text>
  );
}

function PlatformNav({ grants }: { grants: readonly string[] }) {
  const registry = getPermissionRegistry();
  return (
    <>
      {registry.apps.map((app) => (
        <NavItem key={app.appId} href={app.rootPath} icon={<AppWindow aria-hidden="true" size={17} />} active={false}>
          {app.name}
        </NavItem>
      ))}
      <NavItem href="/account" icon={<UserRound aria-hidden="true" size={17} />} active={false}>
        Account
      </NavItem>
      {hasPermission(grants, "platform.settings.read") ? (
        <NavItem href="/settings/general" icon={<Settings aria-hidden="true" size={17} />} active={false}>
          General Settings
        </NavItem>
      ) : null}
      {hasPermission(grants, "platform.user.read") ? (
        <NavItem href="/settings/access/users" icon={<Users aria-hidden="true" size={17} />} active={false}>
          Users
        </NavItem>
      ) : null}
      {hasPermission(grants, "platform.role.read") ? (
        <NavItem href="/settings/access/roles" icon={<ShieldCheck aria-hidden="true" size={17} />} active={false}>
          Roles & Access
        </NavItem>
      ) : null}
    </>
  );
}

function PlatformUtility() {
  return (
    <form action={logoutAction}>
      <button type="submit" className={buttonClasses("ghost")} style={{ width: "100%", justifyContent: "flex-start" }}>
        Sign out
      </button>
    </form>
  );
}

function PlatformTopbar({ displayName }: { displayName: string }) {
  return (
    <div style={{ width: "100%", display: "flex", alignItems: "center", gap: 12 }}>
      <div
        style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}
        title={`Signed in as ${displayName}`}
      >
        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 220 }}>
          {displayName}
        </span>
      </div>
    </div>
  );
}

export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { principal, grants } = principalGrants;

  return (
    <AppShell
      brand={<LauncherBrand />}
      collapsedBrand={<Text as="span" style={{ fontWeight: 700 }}>SF</Text>}
      collapsible
      navigationLabel="StudioFlow navigation"
      navigation={<PlatformNav grants={grants} />}
      utility={<PlatformUtility />}
      topbar={<PlatformTopbar displayName={principal.displayName} />}
    >
      {children}
    </AppShell>
  );
}
