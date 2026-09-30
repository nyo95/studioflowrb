import { redirect } from "next/navigation";

import { SettingsNavigation } from "@/app/(platform)/settings/settings-navigation";

import {
  PageHeader,
  PageSection,
  PageShell,
  SettingsShell,
} from "@/platform/ui_engine";
import { formatInstant } from "@platform/utilities/date";
import { listUserSessions, logoutAllSessions, requirePrincipal, requirePrincipalGrants, currentSessionId } from "@platform/core/auth";
import { prisma } from "@platform/core/db";
import { userPreferences } from "@platform/runtime";
import { AccountForms } from "./account-forms";
import { SessionsTable } from "./sessions-table";

export const dynamic = "force-dynamic";

async function logoutAllAction(): Promise<void> {
  "use server";
  const principal = await requirePrincipal();
  await logoutAllSessions(principal.userId);
  redirect("/login");
}

export default async function AccountPage() {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { principal, grants } = principalGrants;

  const [sessions, currentId, settings] = await Promise.all([
    listUserSessions(prisma, principal.userId),
    currentSessionId(),
    userPreferences.resolveDisplay({ userId: principal.userId }),
  ]);

  return (
    <PageShell>
      <PageHeader
        eyebrow="My Preferences"
        title="Account & security"
        description="Update your profile, secure your password, and manage active sessions."
        divider
      />

      <SettingsShell navigation={<SettingsNavigation grants={grants} active="account" />}>
      <PageSection title="Profile">
        <AccountForms displayName={principal.displayName} email={principal.email} />
      </PageSection>

      <PageSection
        title="Sessions"
        description="Revoking a session signs that browser out on its next request."
      >
        <SessionsTable
          sessions={sessions.map((session) => ({
            id: session.id,
            createdAt: formatInstant(session.createdAt.toISOString(), { locale: settings.locale, timeZone: settings.timezone }),
            lastSeenAt: formatInstant(session.lastSeenAt.toISOString(), { locale: settings.locale, timeZone: settings.timezone }),
            expiresAt: formatInstant(session.absoluteExpiresAt.toISOString(), { locale: settings.locale, timeZone: settings.timezone }),
            revoked: session.revokedAt !== null,
            userAgent: session.userAgent,
          }))}
          currentSessionId={currentId}
          onLogoutAll={logoutAllAction}
        />
      </PageSection>
      </SettingsShell>
    </PageShell>
  );
}
