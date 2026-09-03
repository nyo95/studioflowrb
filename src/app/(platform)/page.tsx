import { redirect } from "next/navigation";
import Link from "next/link";
import { Lock, LayoutGrid } from "lucide-react";

import { EmptyState, PageHeader, PageShell, SectionCard, Text, buttonClasses } from "@/platform/ui_engine";
import { requirePrincipalGrants } from "@platform/core/auth";
import { getPermissionRegistry } from "@platform/core/rbac/registry";
import { hasPermission } from "@platform/core/rbac";
import { prisma } from "@platform/core/db";
import { readPlatformGeneralSettings } from "@platform/core/settings";

export const dynamic = "force-dynamic";

export default async function LauncherPage() {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { grants } = principalGrants;
  const settings = await readPlatformGeneralSettings(prisma);

  const registry = getPermissionRegistry();
  const accessible = registry.apps.filter((app) => hasPermission(grants, app.accessPermission));

  // The launcher is intentionally bypassed. Master Data is the owner-selected
  // default; a user without that grant still lands in their first allowed app.
  const defaultApp = accessible.find((app) => app.appId === "masterdata") ?? accessible[0];
  if (defaultApp) {
    redirect(defaultApp.rootPath);
  }

  return (
    <PageShell size="wide">
      <PageHeader
        eyebrow={settings.organizationName}
        title="Workspace"
        description={`Open an application in ${settings.appTitle}.`}
      />
      {accessible.length === 0 ? (
        <SectionCard>
          <EmptyState
            icon={Lock}
            title="No application access"
            description="Your account has no application access yet. Ask an administrator to assign your roles."
          />
        </SectionCard>
      ) : (
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
          {accessible.map((app) => (
            <Link key={app.appId} href={app.rootPath} className="text-inherit no-underline">
              <SectionCard className="h-full">
                <div className="flex items-center gap-3">
                  <LayoutGrid size={20} aria-hidden="true" />
                  <div className="min-w-0">
                    <Text as="span" weight="semibold">{app.name}</Text>
                    <Text as="p" tone="secondary" size="sm" className="m-0">
                      Open {app.name}
                    </Text>
                  </div>
                </div>
              </SectionCard>
            </Link>
          ))}
        </div>
      )}
      <Text as="p" tone="secondary" size="sm">
        More applications appear here automatically once you are granted access.
      </Text>
      <Link className={buttonClasses("secondary") + " mt-2"} href="/account">
        <span>Open account</span>
      </Link>
    </PageShell>
  );
}
