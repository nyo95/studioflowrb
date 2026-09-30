import { hasPermission } from "@platform/core/rbac";
import { STUDIOFLOW_PERMISSIONS as P } from "@/apps/studioflow/public";
import { studioFlow } from "@/apps/studioflow/runtime";
import { PageHeader, PageShell } from "@/platform/ui_engine";

import { pageSession } from "../_components/session";
import { ProjectDirectory } from "./project-directory";

export const dynamic = "force-dynamic";

type Search = { status?: string; priority?: string; pic?: string; client?: string; q?: string; view?: string };

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { grants, userId, actor } = await pageSession();
  const params = await searchParams;
  const status = params.status === "ALL" || params.status === "ON_HOLD" || params.status === "COMPLETED" ? params.status : params.status === "ACTIVE" ? "ACTIVE" : "ALL";
  const archived = params.view === "archived";
  const [projects, people, designers, drafters, clients, settings] = await Promise.all([
    studioFlow.projects.listProjects({
      grants,
      status,
      priority: params.priority === "URGENT" || params.priority === "NORMAL" || params.priority === "LOW" ? params.priority : undefined,
      picUserId: params.pic === "me" ? userId : params.pic || undefined,
      clientId: params.client || undefined,
      search: params.q,
      archived,
    }),
    studioFlow.projects.listAssignablePeople({ grants }),
    studioFlow.projects.listAssignablePeople({ grants, seat: "designer" }),
    studioFlow.projects.listAssignablePeople({ grants, seat: "drafter" }),
    studioFlow.projects.listClients({ grants }),
    studioFlow.projects.getStudioSettings({ grants }),
  ]);

  const accessRows = await Promise.all(projects.map(async (project) => [project.id, (await studioFlow.projects.getAccess({ grants, actor, projectId: project.id })).canEditProject] as const));
  const editableProjectIds = accessRows.filter(([, editable]) => editable).map(([id]) => id);

  return (
    <PageShell measure="wide">
      <PageHeader title="Projects" description="Every studio project, its five phases, and who holds it." divider />
      <ProjectDirectory
        projects={projects}
        people={people}
        designers={designers}
        drafters={drafters}
        editableProjectIds={editableProjectIds}
        clients={clients.map((c) => ({ id: c.id, name: c.name }))}
        filters={{ status, priority: params.priority ?? "", pic: params.pic ?? "", client: params.client ?? "", q: params.q ?? "", archived }}
        canManage={hasPermission(grants, P.projectManage)}
        archiveRetentionDays={settings.archiveRetentionDays}
        asOf={new Date().toISOString()}
      />
    </PageShell>
  );
}
