import type { ReactNode } from "react";
import Link from "next/link";

import { Breadcrumb, ContextNavHeading, ContextNavLink, ErrorState, PageHeader, PageShell, SectionCard, SettingsShell } from "@/platform/ui_engine";

import { canOpenSettingsSection, visibleSettingsGroups, type SettingsSectionGroup } from "./settings-sections";

/**
 * The sidebar of one settings area (`SettingsShell`'s `navigation` slot). It renders only the groups it is
 * given — platform settings pass the platform groups, an app passes its own — so a settings area never
 * links into another owner's settings. See `settings-sections.ts` for the ownership rule.
 */
export function SettingsSectionNav({ groups, active, onThisPage }: { groups: readonly SettingsSectionGroup[]; active: string; onThisPage?: ReactNode }) {
  return (
    <>
      {visibleSettingsGroups(groups).map((group) => (
        <div key={group.heading} className="grid gap-1 not-first:mt-3">
          <ContextNavHeading>{group.heading}</ContextNavHeading>
          {group.items.map((item) => (
            <ContextNavLink key={item.key} component={Link} href={item.href} active={active === item.key}>
              {item.label}
            </ContextNavLink>
          ))}
        </div>
      ))}
      {onThisPage}
    </>
  );
}

/**
 * One settings page: capsule breadcrumb (the way back), title, the area's own sidebar, and the content.
 * A person who may not open this section gets an access-denied state, never the content.
 * `withPageShell={false}` is for an app whose layout already wraps pages in a `PageShell` (Master Data).
 */
export function SettingsFrame({
  appMark,
  trail,
  title,
  description,
  groups,
  active,
  withPageShell = true,
  fill = false,
  children,
}: {
  appMark?: string;
  /** Breadcrumb entries before the page itself, e.g. `[{ label: "StudioFlow", href: "/studioflow" }, { label: "Settings", href: "/studioflow/settings" }]`. */
  trail: Array<{ label: string; href: string }>;
  title: string;
  description?: string;
  groups: readonly SettingsSectionGroup[];
  active: string;
  withPageShell?: boolean;
  fill?: boolean;
  children: ReactNode;
}) {
  const allowed = canOpenSettingsSection(groups, active);
  const body = (
    <>
      <PageHeader
        context={<Breadcrumb variant="capsule" appMark={appMark} entries={[...trail, { label: title }]} />}
        title={title}
        description={allowed ? description : undefined}
        divider
      />
      {allowed ? (
        <SettingsShell fill={fill} navigation={<SettingsSectionNav groups={groups} active={active} />}>{children}</SettingsShell>
      ) : (
        <SectionCard>
          <ErrorState title="Access denied" description="You do not have permission to change these settings." />
        </SectionCard>
      )}
    </>
  );
  return withPageShell ? <PageShell measure="wide" fill={fill}>{body}</PageShell> : body;
}
