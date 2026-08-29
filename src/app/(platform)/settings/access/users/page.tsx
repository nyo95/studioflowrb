import { redirect } from "next/navigation";

import { ErrorState, PageHeader, PageShell, SectionCard } from "@/platform/ui_engine";
import { requirePrincipalGrants } from "@platform/core/auth";
import { hasAllPermissions } from "@platform/core/rbac";
import { toSafeErrorPayload, type SafeErrorPayload } from "@platform/core/errors";
import { platformAccess } from "@platform/runtime";
import { UsersDirectory } from "./users-directory";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { grants } = principalGrants;

  if (!hasAllPermissions(grants, ["platform.user.read"])) {
    return (
      <PageShell>
        <PageHeader eyebrow="Settings · Access" title="Users" />
        <SectionCard>
          <ErrorState title="Access denied" description="You do not have permission to view the user directory." />
        </SectionCard>
      </PageShell>
    );
  }

  let directory: Awaited<ReturnType<typeof platformAccess.listUsers>> | undefined;
  let roles: Awaited<ReturnType<typeof platformAccess.listAssignableRoles>> | undefined;
  let failure: SafeErrorPayload | undefined;
  try {
    directory = await platformAccess.listUsers({ grants, page: 1, pageSize: 50 });
    roles = await platformAccess.listAssignableRoles({ grants });
  } catch (error) {
    failure = toSafeErrorPayload(error);
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Settings · Access"
        title="Users"
        description="Platform accounts, their roles, and their status."
      />
      {failure || !directory || !roles ? (
        <SectionCard>
          <ErrorState title="Unable to load users" description={failure?.safeMessage ?? "The directory is unavailable."} />
        </SectionCard>
      ) : (
        <UsersDirectory
          users={directory.users}
          roles={roles}
          canManage={grants.includes("platform.user.manage")}
          canAssignRoles={grants.includes("platform.role.manage")}
        />
      )}
    </PageShell>
  );
}
