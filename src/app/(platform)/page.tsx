import { redirect } from "next/navigation";
import Link from "next/link";
import { Lock, LayoutGrid } from "lucide-react";

import { EmptyState, PageHeader, PageShell, SectionCard, Text, buttonClasses } from "@/platform/ui_engine";
import { requirePrincipalGrants } from "@platform/core/auth";
import { getPermissionRegistry } from "@platform/core/rbac/registry";
import { hasPermission } from "@platform/core/rbac";

export const dynamic = "force-dynamic";

export default async function LauncherPage() {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { grants } = principalGrants;

  const registry = getPermissionRegistry();
  const accessible = registry.apps.filter((app) => hasPermission(grants, app.accessPermission));

  // One accessible app goes straight to the app (login already did this for
  // fresh logins; this keeps the root route consistent for deep visits).
  if (accessible.length === 1) {
    redirect(accessible[0].rootPath);
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="StudioFlow"
        title="Workspace"
        description="Open an application from your workspace."
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
        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
          {accessible.map((app) => (
            <Link key={app.appId} href={app.rootPath} style={{ textDecoration: "none", color: "inherit" }}>
              <SectionCard>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <LayoutGrid size={20} aria-hidden="true" />
                  <div style={{ minWidth: 0 }}>
                    <Text as="span" style={{ fontWeight: 600 }}>{app.name}</Text>
                    <Text as="p" tone="secondary" style={{ margin: 0, fontSize: 13 }}>
                      Open {app.name}
                    </Text>
                  </div>
                </div>
              </SectionCard>
            </Link>
          ))}
        </div>
      )}
      <Text as="p" tone="secondary" style={{ fontSize: 13 }}>
        More applications appear here automatically once you are granted access.
      </Text>
      <Link className={buttonClasses("secondary") + " mt-2"} href="/account">
        <span>Open account</span>
      </Link>
    </PageShell>
  );
}
