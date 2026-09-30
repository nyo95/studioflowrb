import Link from "next/link";

import { prisma } from "@platform/core/db";
import { hasPermission } from "@platform/core/rbac";
import { userPreferences } from "@platform/runtime";
import { currentDateOnly } from "@platform/utilities/date";
import { STUDIOFLOW_PERMISSIONS as P } from "@/apps/studioflow/public";
import { studioFlow } from "@/apps/studioflow/runtime";
import { filterChipClasses, PageHeader, PageShell } from "@/platform/ui_engine";

import { pageSession } from "./_components/session";
import { PhaseAttentionSection } from "./_components/phase-attention";
import { TodayView } from "./today-view";

export const dynamic = "force-dynamic";

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const { userId, displayName, grants, actor } = await pageSession();
  const { scope: rawScope } = await searchParams;
  const canSeeAll = hasPermission(grants, P.projectManage);
  const [today, phaseAttention, people, labels, filters] = await Promise.all([
    studioFlow.today.getToday({ grants, actor, scope: rawScope === "all" ? "all" : "mine" }),
    studioFlow.today.listPhaseAttention({ grants }),
    studioFlow.projects.listAssignablePeople({ grants }),
    studioFlow.tasks.listLabels({ grants }),
    studioFlow.tasks.listFilterViews({ grants, actor }),
  ]);
  const firstName = displayName.split(" ")[0] ?? displayName;

  const allTasks = today.groups.flatMap((g) => g.tasks);
  // Must match the timezone the client checklist and every DueLabel badge use (the person's own, else the studio's),
  // or the header and the filter chips below it count the same tasks against two
  // different "today" values for the first hours of each local day.
  const { timezone } = await userPreferences.resolveDisplay({ userId });
  const dateToday = currentDateOnly({ timeZone: timezone });
  const openTasks = allTasks.filter((t) => !t.isChecked);
  const overdue = openTasks.filter((t) => t.dueDate && t.dueDate < dateToday);
  const dueToday = openTasks.filter((t) => t.dueDate === dateToday);
  const summary = [
    openTasks.length > 0 ? `${openTasks.length} open` : null,
    overdue.length > 0 ? `${overdue.length} overdue` : null,
    dueToday.length > 0 ? `${dueToday.length} due today` : null,
  ].filter(Boolean).join(" · ") || "No open work";

  return (
    <PageShell measure="wide">
      <PageHeader
        title="Today"
        description={today.scope === "mine" ? `${firstName}, ${summary.toLowerCase()}` : `${summary} across running projects`}
        actions={canSeeAll ? (
          <div className="flex gap-1.5" role="group" aria-label="Scope">
            <Link href="/studioflow" prefetch={false} className={filterChipClasses(today.scope === "mine")} aria-current={today.scope === "mine" ? "page" : undefined}>My projects</Link>
            <Link href="/studioflow?scope=all" prefetch={false} className={filterChipClasses(today.scope === "all")} aria-current={today.scope === "all" ? "page" : undefined}>All projects</Link>
          </div>
        ) : undefined}
        divider
      />
      {phaseAttention.length > 0 && (
        <PhaseAttentionSection phases={phaseAttention} />
      )}
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
    </PageShell>
  );
}
