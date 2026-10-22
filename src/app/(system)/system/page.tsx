import { redirect } from "next/navigation";

import { Button, PageHeader, PageShell } from "@/platform/ui_engine";
import { developerAccess, getDeveloperSessionCookie } from "@platform/core/developer-access";

import { developerSignOutAction } from "./actions";
import { DeveloperIntegrationAccess } from "./developer-integration-access";
import { DeveloperModuleConsole } from "./developer-module-console";

export const dynamic = "force-dynamic";

export default async function DeveloperConsolePage() {
  const rawToken = await getDeveloperSessionCookie();
  if (!rawToken || !await developerAccess.resolveSession(rawToken)) redirect("/system/login");
  const modules = await developerAccess.listModules(rawToken);
  const access = await developerAccess.listIntegrationAccess(rawToken);
  return (
    <PageShell>
      <PageHeader
        eyebrow="System authority"
        title="Developer console"
        description="Optional modules can be switched off without deleting their data. Core applications are always on."
        actions={<form action={developerSignOutAction}><Button type="submit" variant="secondary">Sign out</Button></form>}
        divider
      />
      <DeveloperModuleConsole modules={modules} />
      <DeveloperIntegrationAccess
        modules={access.modules.map((module) => ({ moduleId: module.moduleId, name: module.name, allowed: module.allowed.map((entry) => ({ userId: entry.userId, displayName: entry.displayName, email: entry.email })) }))}
        users={access.users}
      />
    </PageShell>
  );
}
