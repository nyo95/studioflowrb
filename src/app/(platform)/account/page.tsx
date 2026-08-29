import { redirect } from "next/navigation";

import {
  PageHeader,
  PageSection,
  PageShell,
} from "@/platform/ui_engine";
import { formatInstant } from "@platform/utilities/date";
import { listUserSessions, logoutAllSessions, requirePrincipal, currentSessionId } from "@platform/core/auth";
import { prisma } from "@platform/core/db";
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

  const [sessions, currentId] = await Promise.all([
    listUserSessions(prisma, principal.userId),
    currentSessionId(),
  ]);

  return (
    <PageShell>
      <PageHeader
        eyebrow="Account"
        title="Your account"
        description="Update your profile, secure your password, and manage active sessions."
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
            createdAt: formatInstant(session.createdAt.toISOString()),
            lastSeenAt: formatInstant(session.lastSeenAt.toISOString()),
            expiresAt: formatInstant(session.absoluteExpiresAt.toISOString()),
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
