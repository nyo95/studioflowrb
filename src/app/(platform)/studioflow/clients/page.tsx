import { hasPermission } from "@platform/core/rbac";
import { STUDIOFLOW_PERMISSIONS as P } from "@/apps/studioflow/public";
import { studioFlow } from "@/apps/studioflow/runtime";
import { PageHeader, PageShell } from "@/platform/ui_engine";

import { pageSession } from "../_components/session";
import { ClientDirectory } from "./client-directory";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const { grants } = await pageSession();
  const clients = await studioFlow.projects.listClients({ grants, includeArchived: true });
  return (
    <PageShell measure="wide">
      <PageHeader title="Clients" description="Who the studio works for. Clients are records, not users." divider />
      <ClientDirectory clients={clients} canManage={hasPermission(grants, P.projectManage)} />
    </PageShell>
  );
}
