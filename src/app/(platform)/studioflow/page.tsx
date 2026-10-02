import Link from "next/link";

import { hasPermission } from "@platform/core/rbac";
import { userPreferences } from "@platform/runtime";
import { currentDateOnly } from "@platform/utilities/date";
import { STUDIOFLOW_PERMISSIONS as P } from "@/apps/studioflow/public";
import { studioFlow } from "@/apps/studioflow/runtime";
import { Badge, EmptyState, filterChipClasses, PageHeader, PageShell } from "@/platform/ui_engine";

import { pageSession } from "./_components/session";
import { ProjectCard } from "./_components/project-card";
import { TodayView } from "./today-view";

export const dynamic = "force-dynamic";

type StatusView = "running" | "completed";

/**
 * Home: one card per project (phases, the iteration that is with the client, the next step as a button),
 * with the person's own task list folded into a strip above. Replaces the task-first Today page.
 */
export default async function HomePage({ searchParams }: { searchParams: Promise<{ scope?: string; status?: string }> }) {
  const { userId, displayName, grants, actor } = await pageSession();
  const { scope: rawScope, status: rawStatus } = await searchParams;
  const canSeeAll = hasPermission(grants, P.projectManage);
  const scope = canSeeAll && rawScope === "all" ? "all" : "mine";
  const statusView: StatusView = rawStatus === "completed" ? "completed" : "running";
  const [cards, today, people, labels, filters] = await Promise.all([
    studioFlow.projects.listProjectCards({ grants, filter: scope, actorId: userId }),
    studioFlow.today.getToday({ grants, actor, scope: "mine" }),
    studioFlow.projects.listAssignablePeople({ grants }),
    studioFlow.tasks.listLabels({ grants }),
    studioFlow.tasks.listFilterViews({ grants, actor }),
  ]);
  const firstName = displayName.split(" ")[0] ?? displayName;

  // Must match the timezone the checklist and every DueLabel badge use (the person's own, else the studio's).
  const { timezone } = await userPreferences.resolveDisplay({ userId });
  const dateToday = currentDateOnly({ timeZone: timezone });
  const openTasks = today.groups.flatMap((group) => group.tasks).filter((task) => !task.isChecked);
  const overdue = openTasks.filter((task) => task.dueDate && task.dueDate < dateToday).length;
  const dueToday = openTasks.filter((task) => task.dueDate === dateToday).length;

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
          <div className="flex flex-wrap gap-1.5">
            <div className="flex gap-1.5" role="group" aria-label="Show">
              <Link href={link({ scope, status: "running" })} prefetch={false} className={filterChipClasses(statusView === "running")} aria-current={statusView === "running" ? "page" : undefined}>Running ({running.length})</Link>
              <Link href={link({ scope, status: "completed" })} prefetch={false} className={filterChipClasses(statusView === "completed")} aria-current={statusView === "completed" ? "page" : undefined}>Completed ({completed.length})</Link>
            </div>
            {canSeeAll ? (
              <div className="flex gap-1.5" role="group" aria-label="Scope">
                <Link href={link({ scope: "mine", status: rawStatus })} prefetch={false} className={filterChipClasses(scope === "mine")} aria-current={scope === "mine" ? "page" : undefined}>My projects</Link>
                <Link href={link({ scope: "all", status: rawStatus })} prefetch={false} className={filterChipClasses(scope === "all")} aria-current={scope === "all" ? "page" : undefined}>All projects</Link>
              </div>
            ) : null}
          </div>
        )}
        divider
      />

      <details className="group mb-4 rounded-surface border border-line bg-surface-raised" aria-label="My tasks">
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-4 py-2.5 text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">
          <span>My tasks</span>
          {openTasks.length === 0 ? <span className="font-normal text-ink-tertiary">Nothing open</span> : <Badge>{openTasks.length} open</Badge>}
          {overdue > 0 ? <Badge tone="danger">{overdue} overdue</Badge> : null}
          {dueToday > 0 ? <Badge tone="warning">{dueToday} due today</Badge> : null}
          <span className="ml-auto text-xs font-normal text-ink-tertiary group-open:hidden">Show</span>
          <span className="ml-auto hidden text-xs font-normal text-ink-tertiary group-open:inline">Hide</span>
        </summary>
        <div className="border-t border-line p-4">
          <TodayView
            groups={today.groups}
            addTargets={today.addTargets}
            people={people}
            currentUserId={userId}
            labels={labels}
            savedFilters={filters}
            canWork={hasPermission(grants, P.phaseWork)}
            canManageTasks={hasPermission(grants, P.taskManage)}
          />
        </div>
      </details>

      {shown.length === 0 ? (
        <EmptyState
          title={statusView === "running" ? (scope === "mine" ? "No running projects of yours" : "No running projects") : "No completed projects"}
          description={statusView === "running" ? "Create a project from the Projects list, or switch to All projects." : "A project appears here after someone marks it as completed."}
        />
      ) : (
        <div className="grid gap-3">
          {shown.map((card) => (
            <ProjectCard key={card.id} card={card} viewer={{ userId, canOverride: hasPermission(grants, P.projectOverride) }} />
          ))}
        </div>
      )}
    </PageShell>
  );
}
