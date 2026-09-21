import Link from "next/link";

import { hasPermission } from "@platform/core/rbac";
import { STUDIOFLOW_PERMISSIONS as P } from "@/apps/studioflow/public";
import { studioFlow } from "@/apps/studioflow/runtime";
import { FilterChip, PageHeader } from "@/platform/ui_engine";

import { pageSession } from "./_components/session";
import { TodayView } from "./today-view";

export const dynamic = "force-dynamic";

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const { userId, displayName, grants, actor } = await pageSession();
  const { scope: rawScope } = await searchParams;
  const canSeeAll = hasPermission(grants, P.projectManage);
  const [today, people, labels, filters] = await Promise.all([
    studioFlow.today.getToday({ grants, actor, scope: rawScope === "all" ? "all" : "mine" }),
    studioFlow.projects.listAssignablePeople({ grants }),
    studioFlow.tasks.listLabels({ grants }),
    studioFlow.tasks.listFilterViews({ grants, actor }),
  ]);
  const firstName = displayName.split(" ")[0] ?? displayName;

  return (
    <>
      <PageHeader
        eyebrow="StudioFlow"
        title="Today"
        description={today.scope === "mine" ? `What is on your plate, ${firstName} — every project where you are the designer or drafter.` : "Open work across every running project."}
        actions={canSeeAll ? (
          <div className="flex gap-1.5" role="group" aria-label="Scope">
            <Link href="/studioflow" prefetch={false}><FilterChip selected={today.scope === "mine"}>My projects</FilterChip></Link>
            <Link href="/studioflow?scope=all" prefetch={false}><FilterChip selected={today.scope === "all"}>All projects</FilterChip></Link>
          </div>
        ) : undefined}
        divider
      />
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
    </>
  );
}
