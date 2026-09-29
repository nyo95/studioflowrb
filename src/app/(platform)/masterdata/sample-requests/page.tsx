import { redirect } from "next/navigation";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import { ErrorState, PageHeader, SectionCard } from "@/platform/ui_engine";

import { MASTERDATA_PERMISSIONS } from "@/apps/masterdata/public";
import { sampleRequestCoordinator } from "@/app/sample-request-runtime";

import { SampleRequestDirectory } from "./sample-request-directory";

export const dynamic = "force-dynamic";

export default async function SampleRequestsPage() {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { grants } = principalGrants;

  if (!hasPermission(grants, MASTERDATA_PERMISSIONS.sampleRequestManage)) {
    return (
      <>
        <PageHeader title="Sample requests" divider />
        <SectionCard>
          <ErrorState title="Access denied" description="You do not have permission to view sample requests." />
        </SectionCard>
      </>
    );
  }

  const queue = await sampleRequestCoordinator.listQueue({ grants, includeFinished: true });

  return (
    <>
      <PageHeader title="Sample requests" divider />
      <SampleRequestDirectory rows={queue} />
    </>
  );
}
