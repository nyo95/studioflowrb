import { redirect } from "next/navigation";


import { requirePrincipalGrants } from "@platform/core/auth";

import { hasPermission } from "@platform/core/rbac";

import {
  ErrorState,
  PageHeader,
  SectionCard,
} from "@/platform/ui_engine";

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
      <>
        <PageHeader title="Deletions" divider />
        <SectionCard>
          <ErrorState title="Access denied" description="You do not have permission to view deletions." />
        </SectionCard>
      </>
    );
  }

  const pendingRequests = await masterDataService.listDeletionRequests({
    grants,
    status: "PENDING",
  });
  const canApprove = hasPermission(grants, MASTERDATA_PERMISSIONS.deletionApprove);

  return (
    <>
      <PageHeader
        title="Deletion Requests"
        divider
      />
      <DeletionDirectory pendingRequests={pendingRequests} canApprove={canApprove} />
    </>
  );
}
