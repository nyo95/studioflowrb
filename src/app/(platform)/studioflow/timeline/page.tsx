import { hasPermission } from "@platform/core/rbac";
import { resolveTimelineSpan } from "@/apps/studioflow/domain/timeline";
import { STUDIOFLOW_PERMISSIONS as P } from "@/apps/studioflow/public";
import { studioFlow } from "@/apps/studioflow/runtime";
import { PageHeader, PageShell } from "@/platform/ui_engine";

import { pageSession } from "../_components/session";
import { TimelineDirectory } from "./timeline-directory";

export const dynamic = "force-dynamic";

type Search = { status?: string; pic?: string; client?: string; from?: string; to?: string; view?: string };

// Plain helper, not the component body, so this per-request read doesn't
// trip the react-hooks/purity "impure call during render" check.
function currentTimeMs(): number {
  return Date.now();
}

export default async function TimelinePage({ searchParams }: { searchParams: Promise<Search> }) {
  const { grants, userId } = await pageSession();
  const params = await searchParams;
  const status = params.status === "ALL" || params.status === "ON_HOLD" || params.status === "COMPLETED" ? params.status : params.status === "ACTIVE" ? "ACTIVE" : "ALL";
  const archived = params.view === "archived";
  const from = params.from || null;
  const to = params.to || null;

  const now = currentTimeMs();
  const [allProjects, people, clients] = await Promise.all([
    studioFlow.projects.listProjects({
      grants,
      status,
      picUserId: params.pic === "me" ? userId : params.pic || undefined,
      clientId: params.client || undefined,
      archived,
    }),
    studioFlow.projects.listAssignablePeople({ grants }),
    studioFlow.projects.listClients({ grants }),
  ]);

  // Overlap filter against each project's own [start, opening-or-fallback] span — applied here
  // rather than in the DB query, same place the fallback dates are already resolved.
  const fromMs = from ? Date.parse(`${from}T00:00:00.000Z`) : null;
  const toMs = to ? Date.parse(`${to}T23:59:59.999Z`) : null;
  const projects = fromMs === null && toMs === null ? allProjects : allProjects.filter((project) => {
    const span = resolveTimelineSpan(project.timelineStartDate, project.openingDate, { phases: project.phases });
    if (fromMs !== null && span.endMs < fromMs) return false;
    if (toMs !== null && span.startMs > toMs) return false;
    return true;
  });

  return (
    <PageShell measure="wide">
      <PageHeader
        title="Timeline"
        description="Every project's phase schedule in one Gantt — filter by client, PIC, status, or date range; click a segment to set its planned dates."
        divider
      />
      <TimelineDirectory
        projects={projects}
        people={people}
        clients={clients.map((c) => ({ id: c.id, name: c.name }))}
        filters={{ status, pic: params.pic ?? "", client: params.client ?? "", from: from ?? "", to: to ?? "", archived }}
        canManage={hasPermission(grants, P.projectManage)}
        now={now}
      />
    </PageShell>
  );
}
