import { redirect } from "next/navigation";
import Link from "next/link";
import { Lock, Box, FileText, Workflow } from "lucide-react";

import { EmptyState, PageHeader, PageShell, SectionCard, Text, buttonClasses } from "@/platform/ui_engine";
import { requirePrincipalGrants } from "@platform/core/auth";
import { getPermissionRegistry } from "@platform/core/rbac/registry";
import { hasPermission } from "@platform/core/rbac";
import { prisma } from "@platform/core/db";
import { readPlatformGeneralSettings } from "@platform/core/settings";
import { resolveMainRoute } from "./main-route";

export const dynamic = "force-dynamic";

export default async function LauncherPage() {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { grants } = principalGrants;
  const settings = await readPlatformGeneralSettings(prisma);

  const registry = getPermissionRegistry();
  const accessible = registry.apps.filter((app) => hasPermission(grants, app.accessPermission));

  // The launcher is intentionally bypassed. See `resolveMainRoute`: an
  // eligible user goes to the owner-configured main app; otherwise the
  // configured landing app if they can reach it, else the previous fixed
  // default (Master Data, then first accessible app).
  const target = resolveMainRoute(
    accessible.map(({ appId, rootPath }) => ({ appId, rootPath })),
    settings.mainAppId,
    settings.landingAppId,
  );
  if (target) {
    redirect(target);
  }

  const APP_META: Record<string, { Icon: typeof Box; description: string }> = {
    masterdata: {
      Icon: Box,
      description: "Brands, suppliers, SKUs, and pricing catalog for operational work",
    },
    bq: {
      Icon: FileText,
      description: "Project cost estimates and bill of quantities",
    },
    studioflow: {
      Icon: Workflow,
      description: "Design project execution and task management",
    },
  };

  return (
    <PageShell size="wide">
      <PageHeader
        eyebrow={settings.organizationName}
        title="Workspace"
        description={`Open an application in ${settings.appTitle}.`}
        divider
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
          {accessible.map((app) => {
            const meta = APP_META[app.appId] ?? { Icon: Box, description: `Access ${app.name}` };
            return (
              <Link key={app.appId} href={app.rootPath} className="text-inherit no-underline">
                <SectionCard className="h-full">
                  <div className="flex items-center gap-3">
                    <meta.Icon size={20} aria-hidden="true" />
                    <div className="min-w-0">
                      <Text as="span" weight="semibold">{app.name}</Text>
                      <Text as="p" tone="secondary" size="sm" className="m-0">
                        {meta.description}
                      </Text>
                    </div>
                  </div>
                </SectionCard>
              </Link>
            );
          })}
        </div>
      )}
      <Link className={buttonClasses("secondary") + " mt-2"} href="/account">
        <span>Open account</span>
      </Link>
    </PageShell>
  );
}
