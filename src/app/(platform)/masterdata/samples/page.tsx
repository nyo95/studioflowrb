import { redirect } from "next/navigation";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import { ErrorState, PageHeader, SectionCard } from "@/platform/ui_engine";

import { MASTERDATA_PERMISSIONS } from "@/apps/masterdata/public";
import { masterDataService } from "@/apps/masterdata/runtime";
import { sampleRequestCoordinator } from "@/app/sample-request-runtime";

import { SampleShelf } from "./sample-shelf";

export const dynamic = "force-dynamic";

export default async function SamplesPage() {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { grants } = principalGrants;

  if (!hasPermission(grants, MASTERDATA_PERMISSIONS.sampleRead)) {
    return (
      <>
        <PageHeader title="Samples" divider />
        <SectionCard>
          <ErrorState title="Access denied" description="You do not have permission to view the sample shelf." />
        </SectionCard>
      </>
    );
  }

  const canManage = hasPermission(grants, MASTERDATA_PERMISSIONS.sampleManage);
  const [samples, skus, projects] = await Promise.all([
    masterDataService.listSamples({ grants }),
    canManage ? masterDataService.listSampleSkuChoices({ grants }) : [],
    canManage ? sampleRequestCoordinator.listProjectChoices({ grants }) : [],
  ]);

  return <SampleShelf samples={samples} skus={skus} projects={projects} canManage={canManage} />;
}
