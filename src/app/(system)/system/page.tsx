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
        description="Control which modules are available and who may use connected tools."
        actions={<form action={developerSignOutAction}><Button type="submit" variant="secondary">Sign out</Button></form>}
        divider
      />
      <nav aria-label="Developer console sections" className="flex flex-wrap gap-5 border-b border-line-subtle text-sm font-medium">
        <a className="border-b-2 border-transparent pb-3 text-ink-secondary hover:border-ink-tertiary hover:text-ink" href="#modules">Modules</a>
        <a className="border-b-2 border-transparent pb-3 text-ink-secondary hover:border-ink-tertiary hover:text-ink" href="#integration-access">AI &amp; plugin access</a>
      </nav>
      <DeveloperModuleConsole modules={modules} />
      <DeveloperIntegrationAccess
        modules={access.modules.map((module) => ({ moduleId: module.moduleId, name: module.name, enabled: modules.some((entry) => entry.id === module.moduleId && entry.state === "ENABLED"), allowed: module.allowed.map((entry) => ({ userId: entry.userId, displayName: entry.displayName, email: entry.email })) }))}
        users={access.users}
      />
    </PageShell>
  );
}
