import Link from "next/link";

import { hasPermission } from "@platform/core/rbac";
import { STUDIOFLOW_PERMISSIONS as P } from "@/apps/studioflow/public";
import { studioFlow } from "@/apps/studioflow/runtime";
import { EmptyState, filterChipClasses, PageHeader, PageShell } from "@/platform/ui_engine";

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
  const cards = await studioFlow.projects.listProjectCards({ grants, filter: scope, actorId: userId });
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
          <div className="flex flex-wrap items-center gap-3">
            {canSeeAll ? (
              <div className="flex gap-1.5" role="group" aria-label="Scope">
                <Link href={link({ scope: "mine", status: rawStatus })} prefetch={false} className={filterChipClasses(scope === "mine")} aria-current={scope === "mine" ? "page" : undefined}>Mine</Link>
                <Link href={link({ scope: "all", status: rawStatus })} prefetch={false} className={filterChipClasses(scope === "all")} aria-current={scope === "all" ? "page" : undefined}>Everyone&apos;s</Link>
              </div>
            ) : null}
            {canSeeAll ? <span aria-hidden="true" className="h-6 w-px bg-line-subtle" /> : null}
            <div className="flex gap-1.5" role="group" aria-label="Status">
              <Link href={link({ scope, status: "running" })} prefetch={false} className={filterChipClasses(statusView === "running")} aria-current={statusView === "running" ? "page" : undefined}>Running ({running.length})</Link>
              <Link href={link({ scope, status: "completed" })} prefetch={false} className={filterChipClasses(statusView === "completed")} aria-current={statusView === "completed" ? "page" : undefined}>Completed ({completed.length})</Link>
            </div>
          </div>
        )}
      />

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
