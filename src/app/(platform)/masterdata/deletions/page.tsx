import { redirect } from "next/navigation";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import { ErrorState, PageHeader, SectionCard } from "@/platform/ui_engine";
import { MASTERDATA_PERMISSIONS } from "@/apps/masterdata/service";
import { masterDataService } from "@/apps/masterdata/runtime";

import { DeletionDirectory } from "./deletion-directory";

export const dynamic = "force-dynamic";

export default async function DeletionsPage() {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { grants } = principalGrants;

  if (!hasPermission(grants, MASTERDATA_PERMISSIONS.access)) {
    return (
      <div className="grid gap-4">
        <PageHeader eyebrow="Master Data" title="Deletions" />
        <SectionCard>
          <ErrorState title="Access denied" description="You do not have permission to view deletions." />
        </SectionCard>
      </div>
    );
  }

  const pendingRequests = await masterDataService.listDeletionRequests({
    grants,
    status: "PENDING",
  });
  const canApprove = hasPermission(grants, MASTERDATA_PERMISSIONS.deletionApprove);

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Master Data"
        title="Deletion Requests"
        description="Approve or reject pending deletion requests for master data entities."
      />
      <DeletionDirectory pendingRequests={pendingRequests} canApprove={canApprove} />
    </div>
  );
}
