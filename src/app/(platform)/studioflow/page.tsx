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
export default async function HomePage({ searchParams }: { searchParams: Promise<{ scope?: string; status?: string }> }) {
  const { userId, displayName, grants } = await pageSession();
  const { scope: rawScope, status: rawStatus } = await searchParams;
  const canSeeAll = hasPermission(grants, P.projectManage);
  const scope = canSeeAll && rawScope === "all" ? "all" : "mine";
  const statusView: StatusView = rawStatus === "completed" ? "completed" : "running";
  const [cards, stats] = await Promise.all([
    studioFlow.projects.listProjectCards({ grants, filter: scope, actorId: userId }),
    studioFlow.projects.getHomeStats({ grants, filter: scope, actorId: userId }),
  ]);
  const firstName = displayName.split(" ")[0] ?? displayName;

  const running = cards.filter((card) => card.status !== "COMPLETED");
  const completed = cards.filter((card) => card.status === "COMPLETED");
  const shown = statusView === "running" ? running : completed;
  const link = (next: { scope?: string; status?: string }) => {
    const query = new URLSearchParams();
    if (next.scope === "all") query.set("scope", "all");
    if (next.status === "completed") query.set("status", "completed");
    const text = query.toString();
    return text ? `/studioflow?${text}` : "/studioflow";
  };

  return (
    <PageShell measure="wide">
      <PageHeader
        title="Home"
        description={scope === "mine" ? `${firstName}, these are your projects` : "Every running project in the studio"}
        actions={(
          <div className="grid min-w-0 gap-2">
            {canSeeAll ? (
              <PillTabs label="Project scope" items={[{ key: "mine", label: "Mine", href: link({ scope: "mine", status: rawStatus }), active: scope === "mine" }, { key: "all", label: "Everyone's", href: link({ scope: "all", status: rawStatus }), active: scope === "all" }]} />
            ) : null}
            <PillTabs label="Project status" items={[{ key: "running", label: "Running", href: link({ scope, status: "running" }), active: statusView === "running", count: running.length }, { key: "completed", label: "Completed", href: link({ scope, status: "completed" }), active: statusView === "completed", count: completed.length }]} />
          </div>
        )}
      />

      {stats.runningProjects > 0 ? <StatGrid><StatCard label="Waiting on you" value={stats.waitingOnYou} caption="Client answered" /><StatCard label="With client" value={stats.withClient} caption={stats.withClient === 0 ? "nothing sent" : stats.longestClientDays > 0 ? `longest ${stats.longestClientDays} day${stats.longestClientDays === 1 ? "" : "s"}` : "all sent today"} /><StatCard label="Phases done" value={`${stats.phasesDone} / ${stats.phasesTotal}`} caption="across running projects" /><StatCard label="Samples waiting" value={stats.samplesWaiting} caption="Requested samples" /></StatGrid> : null}

      {shown.length === 0 ? (
        <EmptyState
          title={statusView === "running" ? (scope === "mine" ? "No running projects of yours" : "No running projects") : "No completed projects"}
          description={statusView === "running" ? "Create a project from the Projects list, or switch to All projects." : "A project appears here after someone marks it as completed."}
        />
      ) : (
        <div className="grid gap-4">
          {shown.map((card) => <ProjectCard key={card.id} card={card} viewer={{ userId, canOverride: hasPermission(grants, P.projectOverride), canWork: hasPermission(grants, P.phaseWork), canReview: hasPermission(grants, P.phaseReview) }} defaultExpanded={shown.length <= 3} />)}
        </div>
      )}
    </PageShell>
  );
}
