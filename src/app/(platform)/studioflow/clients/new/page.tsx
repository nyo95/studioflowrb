import { redirect } from "next/navigation";
import { Users } from "lucide-react";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import {
  Breadcrumb,
  EmptyState,
  PageHeader,
  SectionCard,
} from "@/platform/ui_engine";
import { STUDIOFLOW_PERMISSIONS } from "@/apps/studioflow/service";
import { ClientForm } from "./client-form";

export const dynamic = "force-dynamic";

export default async function NewClientPage() {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { grants } = principalGrants;

  if (!hasPermission(grants, STUDIOFLOW_PERMISSIONS.projectManage)) {
    return (
      <>
        <Breadcrumb
        entries={[
          { label: "Clients", href: "/studioflow/clients" },
          { label: "New client" },
        ]}
      />
      <PageHeader title="New client" description="Create a client for StudioFlow projects." divider />
        <SectionCard>
          <EmptyState icon={Users} title="Access denied" description="You do not have permission to add clients." />
        </SectionCard>
      </>
    );
  }

  return (
    <>
      <PageHeader eyebrow="StudioFlow · Client" title="New client" divider />
      <SectionCard>
        <ClientForm />
      </SectionCard>
    </>
  );
}
