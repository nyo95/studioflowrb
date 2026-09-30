import type { ReactNode } from "react";
import Link from "next/link";

import { hasPermission, type PermissionGrants } from "@platform/core/rbac";
import { ContextNavHeading, ContextNavLink } from "@/platform/ui_engine";

export type SettingsNavActive =
  | "account"
  | "general"
  | "users"
  | "roles"
  | "masterdata"
  | "studioflow"
  | "schedule-templates";

type Item = { key: SettingsNavActive; href: string; label: string; visible: boolean };
type Group = { heading: string; items: Item[] };

/**
 * The one settings sidebar (`SettingsShell`'s `navigation` slot) that every settings destination renders,
 * whichever area it lives in, so settings look and behave the same everywhere:
 *
 * - **My Preferences** — the signed-in person's own account (everyone).
 * - **Platform** — General, Users, Roles & Access (platform administrators).
 * - **One group per application** with settings (Master Data, StudioFlow). An application with nothing to
 *   configure has no group; add one here when it gets its first setting.
 *
 * Each application also keeps a single "Settings" entry in its own side menu that lands on its group here.
 * A link only shows when the person may open that page; each page still checks access itself.
 * `onThisPage` lets a long page add its own in-page jump links under the list.
 */
export function SettingsNavigation({
  grants,
  active,
  onThisPage,
}: {
  grants: PermissionGrants;
  active: SettingsNavActive;
  onThisPage?: ReactNode;
}) {
  const groups: Group[] = [
    {
      heading: "My Preferences",
      items: [{ key: "account", href: "/account", label: "Account & security", visible: true }],
    },
    {
      heading: "Platform",
      items: [
        { key: "general", href: "/settings/general", label: "General Settings", visible: hasPermission(grants, "platform.settings.read") },
        { key: "users", href: "/settings/access/users", label: "Users", visible: hasPermission(grants, "platform.user.read") },
        { key: "roles", href: "/settings/access/roles", label: "Roles & Access", visible: hasPermission(grants, "platform.role.read") },
      ],
    },
    {
      heading: "Master Data",
      items: [
        {
          key: "masterdata",
          href: "/settings/general/masterdata",
          label: "Dictionaries & approvals",
          visible: hasPermission(grants, "masterdata.dictionary.read") || hasPermission(grants, "masterdata.promotion.approve"),
        },
      ],
    },
    {
      heading: "StudioFlow",
      items: [
        { key: "studioflow", href: "/studioflow/settings", label: "Studio Settings", visible: hasPermission(grants, "studioflow.project.read") },
        { key: "schedule-templates", href: "/studioflow/schedule-templates", label: "Schedule templates", visible: hasPermission(grants, "studioflow.project.read") },
      ],
    },
  ];

  return (
    <>
      {groups.map((group) => {
        const items = group.items.filter((item) => item.visible);
        if (items.length === 0) return null;
        return (
          <div key={group.heading} className="grid gap-1">
            <ContextNavHeading>{group.heading}</ContextNavHeading>
            {items.map((item) => (
              <ContextNavLink key={item.key} component={Link} href={item.href} active={active === item.key}>
                {item.label}
              </ContextNavLink>
            ))}
          </div>
        );
      })}
      {onThisPage}
    </>
  );
}
