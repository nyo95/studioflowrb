import { redirect } from "next/navigation";

import { developerAccess, getDeveloperSessionCookie } from "@platform/core/developer-access";
import { Notice, PageHeader, PageShell } from "@/platform/ui_engine";

import { DeveloperLoginForm } from "./developer-login-form";

export const dynamic = "force-dynamic";

export default async function DeveloperLoginPage() {
  const rawToken = await getDeveloperSessionCookie();
  if (rawToken && await developerAccess.resolveSession(rawToken)) redirect("/system");
  const { enrolled } = await developerAccess.enrollmentState();

  return (
    <PageShell measure="narrow" className="min-h-screen content-center">
      <PageHeader
        eyebrow="StudioFlowRB"
        title="Developer console"
        description="Separate system access for controlling optional modules. Application accounts and roles cannot open this console."
      />
      {enrolled ? (
        <DeveloperLoginForm />
      ) : (
        <Notice tone="warning" title="Developer access is not set up.">
          Run the one-time Developer setup on the server before signing in here.
        </Notice>
      )}
    </PageShell>
  );
}
