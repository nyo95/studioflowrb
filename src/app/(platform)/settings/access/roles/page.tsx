import { redirect } from "next/navigation";

import { ErrorState, PageHeader, PageShell, SectionCard } from "@/platform/ui_engine";
import { requirePrincipalGrants } from "@platform/core/auth";
import { hasAllPermissions } from "@platform/core/rbac";
import { getPermissionRegistry } from "@platform/core/rbac/registry";
import { toSafeErrorPayload, type SafeErrorPayload } from "@platform/core/errors";
import { platformAccess } from "@platform/runtime";
import { listGrantIntegrityIssues } from "@platform/core/rbac/services";
import { prisma } from "@platform/core/db";
import { groupPermissionsByApp } from "./permission-grouping";
import { RolesDirectory } from "./roles-directory";

export const dynamic = "force-dynamic";

export default async function RolesPage() {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { grants } = principalGrants;

  if (!hasAllPermissions(grants, ["platform.role.read"])) {
    return (
      <PageShell>
        <PageHeader eyebrow="Settings · Access" title="Roles & Access" divider />
        <SectionCard>
          <ErrorState title="Access denied" description="You do not have permission to view roles." />
        </SectionCard>
      </PageShell>
    );
  }

  let directory: Awaited<ReturnType<typeof platformAccess.listRoles>> | undefined;
  let integrityIssues: Awaited<ReturnType<typeof listGrantIntegrityIssues>> | undefined;
  let failure: SafeErrorPayload | undefined;
  try {
    [directory, integrityIssues] = await Promise.all([
      platformAccess.listRoles({ grants, includeArchived: true }),
      listGrantIntegrityIssues(prisma),
    ]);
  } catch (error) {
    failure = toSafeErrorPayload(error);
  }

  return (
    <PageShell fill>
      <PageHeader
        eyebrow="Settings · Access"
        title="Roles & Access"
        description="Roles compose the registered permissions their members hold."
        divider
      />
      {failure || !directory || !integrityIssues ? (
        <SectionCard>
          <ErrorState title="Unable to load roles" description={failure?.safeMessage ?? "The role directory is unavailable."} />
        </SectionCard>
      ) : (
        <RolesDirectory
          roles={directory.roles.map((role) => ({
            ...role,
            archivedAt: role.archivedAt ? role.archivedAt.toISOString() : null,
          }))}
          permissionGroups={groupPermissionsByApp(getPermissionRegistry().permissions, getPermissionRegistry())}
          canManage={grants.includes("platform.role.manage")}
          integrityIssues={integrityIssues}
        />
      )}
    </PageShell>
  );
}
