import { redirect } from "next/navigation";

import {
  Breadcrumb,
  PageHeader,
  PageSection,
  PageShell,
} from "@/platform/ui_engine";
import { parseStoredTheme, PLATFORM_APPEARANCE_THEME_DEFAULT, readPlatformGeneralSettings } from "@platform/core/settings";
import { formatInstant } from "@platform/utilities/date";
import { listUserSessions, logoutAllSessions, requirePrincipal, requirePrincipalGrants, currentSessionId } from "@platform/core/auth";
import { prisma } from "@platform/core/db";
import { hasIntegrationModuleAccess, integrationTokens, REFERENCE_SCOPE_GRANTS } from "@platform/core/integrations";
import { enabledModuleIds } from "@platform/core/modules";
import { hasPermission } from "@platform/core/rbac";
import { userPreferences } from "@platform/runtime";
import { AccountForms } from "./account-forms";
import { AppearancePreference } from "./appearance-preference";
import { DisplayPreferencesForm } from "./display-preferences-form";
import { IntegrationTokens } from "./integration-tokens";
import { SCHEDULE_ASSISTANT_SCOPE_GRANTS } from "@/apps/schedule-assistant/public";
import { SKETCHUP_SCOPE_GRANTS } from "@/apps/sketchup/public";
import { SessionsTable } from "./sessions-table";

export const dynamic = "force-dynamic";

const SCOPE_LABELS: Record<string, string> = { "integration:ping": "Run the connection test", "schedule-assistant:read": "Schedule Assistant: read project schedules", "schedule-assistant:write": "Schedule Assistant: change project schedules", "sketchup:read": "SketchUp: read project schedules", "sketchup:write": "SketchUp: add schedule items" };

async function logoutAllAction(): Promise<void> {
  "use server";
  const principal = await requirePrincipal();
  await logoutAllSessions(principal.userId);
  redirect("/login");
}

/** A scope is offered only when this person has its permission, or the Developer listed them for its module (and it is On). */
async function allowedTokenScopes(userId: string, grants: Parameters<typeof hasPermission>[0]) {
  const enabled = new Set(await enabledModuleIds());
  const allowed: typeof REFERENCE_SCOPE_GRANTS[number][] = [];
  for (const entry of [...REFERENCE_SCOPE_GRANTS, ...SCHEDULE_ASSISTANT_SCOPE_GRANTS, ...SKETCHUP_SCOPE_GRANTS]) {
    const ok = entry.module !== undefined ? enabled.has(entry.module) && await hasIntegrationModuleAccess(prisma, userId, entry.module) : hasPermission(grants, entry.grant);
    if (ok) allowed.push(entry);
  }
  return allowed;
}

export default async function AccountPage() {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { principal, grants } = principalGrants;
  const tokenScopes = hasPermission(grants, "platform.integration.manage") ? await allowedTokenScopes(principal.userId, grants) : [];
  // Owner 2026-10-23: with no tool open to this person (no module listing, no connection test) the token menu stays
  // hidden altogether. A leftover token is harmless: every call checks the Developer list again.
  const canManageTokens = tokenScopes.length > 0;
  const tokens = canManageTokens ? await integrationTokens.listOwn({ userId: principal.userId, grants }) : [];

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
        description="Your own profile, appearance, display, password and sessions. Changes here affect only you."
        divider
      />

      <PageSection title="Profile">
        <AccountForms displayName={principal.displayName} email={principal.email} />
      </PageSection>

      <AppearancePreference theme={preferences.theme} organisationDefault={parseStoredTheme(organisation.theme) ?? PLATFORM_APPEARANCE_THEME_DEFAULT} />

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

      {canManageTokens ? (
        <PageSection
          title="Integration tokens"
          description="A token lets an outside tool, such as the SketchUp plugin, act as you, with no more access than you have. Revoke one to cut that tool off at once."
        >
          <IntegrationTokens
            tokens={tokens.map((token) => ({
              id: token.id,
              label: token.label,
              prefix: token.tokenPrefix,
              scopes: [...token.scopes],
              lastUsedAt: token.lastUsedAt ? formatInstant(token.lastUsedAt.toISOString(), { locale: settings.locale, timeZone: settings.timezone }) : null,
              expiresAt: token.expiresAt ? formatInstant(token.expiresAt.toISOString(), { locale: settings.locale, timeZone: settings.timezone }) : null,
              status: token.revokedAt ? "revoked" : token.expiresAt && token.expiresAt <= new Date() ? "expired" : "active",
            }))}
            scopes={tokenScopes.map((entry) => ({ scope: entry.scope, label: SCOPE_LABELS[entry.scope] ?? entry.scope }))}
          />
        </PageSection>
      ) : null}
    </PageShell>
  );
}
