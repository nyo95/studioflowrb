import Link from "next/link";

import { hasPermission, type PermissionGrants } from "@platform/core/rbac";

export type SettingsNavActive = "general" | "users" | "roles";

const PLATFORM_ITEMS = [
  { key: "general", href: "/settings/general", label: "General Settings" },
  { key: "users", href: "/settings/access/users", label: "Users" },
  { key: "roles", href: "/settings/access/roles", label: "Roles & Access" },
] as const;

const LINK_BASE = "flex min-h-8 items-center rounded-control px-2.5 py-1.5 text-sm no-underline transition-colors";
const LINK_ACTIVE = "bg-surface-muted font-semibold text-ink";
const LINK_IDLE = "text-ink-secondary hover:bg-surface-muted hover:text-ink";

const SECTION_LABEL = "px-2.5 pb-1 pt-0.5 text-xs font-semibold uppercase tracking-wide text-ink-tertiary";

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
      <div className={SECTION_LABEL}>Settings</div>
      {PLATFORM_ITEMS.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          prefetch={false}
          aria-current={active === item.key ? "page" : undefined}
          className={`${LINK_BASE} ${active === item.key ? LINK_ACTIVE : LINK_IDLE}`}
        >
          {item.label}
        </Link>
      ))}
      {showMasterData || showStudioFlow ? (
        <>
          <div className="px-2.5 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-ink-tertiary">Applications</div>
          {showMasterData ? (
            <Link href="/settings/general/masterdata" prefetch={false} className={`${LINK_BASE} ${LINK_IDLE}`}>
              Master Data Settings
            </Link>
          ) : null}
          {showStudioFlow ? (
            <Link href="/studioflow/settings" prefetch={false} className={`${LINK_BASE} ${LINK_IDLE}`}>
              StudioFlow Settings
            </Link>
          ) : null}
        </>
      ) : null}
    </>
  );
}