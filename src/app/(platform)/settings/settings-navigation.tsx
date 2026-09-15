import Link from "next/link";

import { hasPermission, type PermissionGrants } from "@platform/core/rbac";
import { ContextNavHeading, ContextNavLink } from "@/platform/ui_engine";

export type SettingsNavActive = "general" | "users" | "roles";

const PLATFORM_ITEMS = [
  { key: "general", href: "/settings/general", label: "General Settings" },
  { key: "users", href: "/settings/access/users", label: "Users" },
  { key: "roles", href: "/settings/access/roles", label: "Roles & Access" },
] as const;

/**
 * Platform settings navigation. Platform-owned settings (General, Users,
 * Roles) come from the admin menu; the tied rows below make the ratified
 * D-SF ownership boundary visible by listing app-owned settings surfaces:
 * Master Data and StudioFlow workflow settings remain theirs, never the
 * platform's.
 */
export function SettingsNavigation({
  grants,
  active,
}: {
  grants: PermissionGrants;
  active: SettingsNavActive;
}) {
  const showMasterData = hasPermission(grants, "masterdata.dictionary.read");
  const showStudioFlow = hasPermission(grants, "studioflow.project.read");
  return (
    <>
      <ContextNavHeading>Settings</ContextNavHeading>
      {PLATFORM_ITEMS.map((item) => (
        <ContextNavLink key={item.key} component={Link} href={item.href} active={active === item.key}>
          {item.label}
        </ContextNavLink>
      ))}
      {showMasterData || showStudioFlow ? (
        <>
          <ContextNavHeading>Applications</ContextNavHeading>
          {showMasterData ? (
            <ContextNavLink component={Link} href="/settings/general/masterdata">Master Data Settings</ContextNavLink>
          ) : null}
          {showStudioFlow ? (
            <ContextNavLink component={Link} href="/studioflow/settings">StudioFlow Settings</ContextNavLink>
          ) : null}
        </>
      ) : null}
    </>
  );
}