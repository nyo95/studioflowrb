import { redirect } from "next/navigation";

import { Button, PageHeader, PageShell } from "@/platform/ui_engine";
import { developerAccess, getDeveloperSessionCookie } from "@platform/core/developer-access";

import { developerSignOutAction } from "./actions";
import { DeveloperModuleConsole } from "./developer-module-console";

export const dynamic = "force-dynamic";

export default async function DeveloperConsolePage() {
  const rawToken = await getDeveloperSessionCookie();
  if (!rawToken || !await developerAccess.resolveSession(rawToken)) redirect("/system/login");
  const modules = await developerAccess.listModules(rawToken);
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
    </PageShell>
  );
}
