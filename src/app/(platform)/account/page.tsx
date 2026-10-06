import { redirect } from "next/navigation";

import {
  Breadcrumb,
  PageHeader,
  PageSection,
  PageShell,
} from "@/platform/ui_engine";
import { readPlatformGeneralSettings } from "@platform/core/settings";
import { formatInstant } from "@platform/utilities/date";
import { listUserSessions, logoutAllSessions, requirePrincipal, requirePrincipalGrants, currentSessionId } from "@platform/core/auth";
import { prisma } from "@platform/core/db";
import { userPreferences } from "@platform/runtime";
import { AccountForms } from "./account-forms";
import { DisplayPreferencesForm } from "./display-preferences-form";
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
  const { principal } = principalGrants;

  const [sessions, currentId, settings, preferences, organisation] = await Promise.all([
    listUserSessions(prisma, principal.userId),
    currentSessionId(),
    userPreferences.resolveDisplay({ userId: principal.userId }),
    userPreferences.get({ userId: principal.userId }),
    readPlatformGeneralSettings(prisma),
  ]);

  return (
    <PageShell>
      <PageHeader
        context={<Breadcrumb variant="capsule" entries={[{ label: "Home", href: "/" }, { label: "My preferences" }]} />}
        title="My preferences"
        description="Your own profile, display, password and sessions. Changes here affect only you."
        divider
      />

      <PageSection title="Profile">
        <AccountForms displayName={principal.displayName} email={principal.email} />
      </PageSection>

      <DisplayPreferencesForm
        locale={preferences.locale}
        timezone={preferences.timezone}
        organisationLocale={organisation.locale}
        organisationTimezone={organisation.timezone}
      />

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
    </PageShell>
  );
}
