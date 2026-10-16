import { hasPermission } from "@platform/core/rbac";
import { STUDIOFLOW_PERMISSIONS as P } from "@/apps/studioflow/public";
import { studioFlow } from "@/apps/studioflow/runtime";
import { EmptyState, PageHeader, PageShell, PillTabs, StatCard, StatGrid } from "@/platform/ui_engine";

import { pageSession } from "./_components/session";
import { ProjectCard } from "./_components/project-card";

export const dynamic = "force-dynamic";

type StatusView = "running" | "completed";

/**
 * Home: one card per project. Requirements are presented on the project page.
 */
export default async function HomePage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { userId, displayName, grants } = await pageSession();
  const { status: rawStatus } = await searchParams;
  const statusView: StatusView = rawStatus === "completed" ? "completed" : "running";
  const [cards, stats] = await Promise.all([
    studioFlow.projects.listProjectCards({ grants, filter: "mine", actorId: userId }),
    studioFlow.projects.getHomeStats({ grants, filter: "mine", actorId: userId }),
  ]);
  const firstName = displayName.split(" ")[0] ?? displayName;

  const running = cards.filter((card) => card.status !== "COMPLETED");
  const completed = cards.filter((card) => card.status === "COMPLETED");
  const shown = statusView === "running" ? running : completed;
  return (
    <PageShell measure="wide">
      <PageHeader
        title="Home"
        description={`${firstName}, these are your projects`}
        actions={(
          <PillTabs label="Project status" items={[{ key: "running", label: "Running", href: "/studioflow", active: statusView === "running", count: running.length }, { key: "completed", label: "Completed", href: "/studioflow?status=completed", active: statusView === "completed", count: completed.length }]} />
        )}
      />

      {stats.runningProjects > 0 ? <StatGrid><StatCard label="Waiting on you" value={stats.waitingOnYou} caption="Client answered" /><StatCard label="With client" value={stats.withClient} caption={stats.withClient === 0 ? "nothing sent" : stats.longestClientDays > 0 ? `longest ${stats.longestClientDays} day${stats.longestClientDays === 1 ? "" : "s"}` : "all sent today"} /><StatCard label="Phases done" value={`${stats.phasesDone} / ${stats.phasesTotal}`} caption="across running projects" /><StatCard label="Samples waiting" value={stats.samplesWaiting} caption="Requested samples" /></StatGrid> : null}

      {shown.length === 0 ? (
        <EmptyState
          title={statusView === "running" ? "No running projects of yours" : "No completed projects"}
          description={statusView === "running" ? "Create a project from the Projects list." : "A project appears here after someone marks it as completed."}
        />
      ) : (
        <div className="grid gap-4">
          {shown.map((card) => <ProjectCard key={card.id} card={card} viewer={{ userId, canManageProjects: hasPermission(grants, P.projectManage), canOverride: hasPermission(grants, P.projectManage) && hasPermission(grants, P.projectOverride), canWork: hasPermission(grants, P.phaseWork), canReview: hasPermission(grants, P.phaseReview) }} defaultExpanded={shown.length <= 3} />)}
        </div>
      )}
    </PageShell>
  );
}
