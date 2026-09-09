import { redirect } from "next/navigation";

import {
  PageHeader,
  PageSection,
  PageShell,
} from "@/platform/ui_engine";
import { formatInstant } from "@platform/utilities/date";
import { listUserSessions, logoutAllSessions, requirePrincipal, currentSessionId } from "@platform/core/auth";
import { prisma } from "@platform/core/db";
import { readPlatformGeneralSettings } from "@platform/core/settings";
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
  const principal = await requirePrincipal().catch(() => null);
  if (!principal) redirect("/login");

  const [sessions, currentId, settings] = await Promise.all([
    listUserSessions(prisma, principal.userId),
    currentSessionId(),
    readPlatformGeneralSettings(prisma),
  ]);

  return (
    <PageShell>
      <PageHeader
        eyebrow="Account"
        title="Your account"
        description="Update your profile, secure your password, and manage active sessions."
        divider
      />

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
    </PageShell>
  );
}
