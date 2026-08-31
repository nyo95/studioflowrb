import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageShell, PageHeader, Text } from "@/platform/ui_engine";
import { getPrincipalGrants } from "@platform/core/auth";
import { prisma } from "@platform/core/db";
import { getPermissionRegistry } from "@platform/core/rbac/registry";
import { readPlatformGeneralSettings } from "@platform/core/settings";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await readPlatformGeneralSettings(prisma);
  return { title: `Sign in — ${settings.appTitle}` };
}

export default async function LoginPage() {
  const [principalGrants, settings] = await Promise.all([
    getPrincipalGrants(),
    readPlatformGeneralSettings(prisma),
  ]);
  if (principalGrants) {
    const accessible = getPermissionRegistry().apps.filter((app) =>
      principalGrants.grants.includes(app.accessPermission));
    redirect(accessible.length === 1 ? accessible[0].rootPath : "/");
  }

  return (
    <PageShell className="min-h-screen place-items-center">
      <div className="grid w-full justify-items-center gap-6">
        {settings.brandMarkUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- owner-configured URL/path has no fixed image host.
          <img src={settings.brandMarkUrl} alt="" className="max-h-16 max-w-16 object-contain" />
        ) : null}
        <PageHeader
          eyebrow={settings.organizationName}
          title="Sign in"
          divider={false}
        />
        <Text as="p" tone="secondary" className="m-0">{settings.appTitle}</Text>
        <LoginForm />
      </div>
    </PageShell>
  );
}
