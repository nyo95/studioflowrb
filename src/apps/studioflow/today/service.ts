import type { Prisma } from "@/generated/prisma/client";

import { dateToDateOnly } from "../domain/dates";
import { groupFeed, nestFeed, type FeedGroup, type FeedTask } from "../domain/feed";
import { phaseLabel, type PhaseKey } from "../domain/phase";
import { P, hasPermission, nowOf, requireCommand, type CommandContext, type Db, type StudioFlowPorts } from "../shared";
import { ITEM_ORDER, ITEM_SELECT, toItemView } from "../tasks/service";

/** Checked checklist rows older than this drop out of Today (legacy retention). */
export const DONE_RETENTION_DAYS = 7;

/** Phases whose items count as today's work (legacy `ACTIVE_PHASE_STATUSES`). */
const ACTIVE_PHASE_STATUSES = ["IN_PROGRESS", "ON_REVIEW_INTERNAL", "APPROVED_INTERNAL", "ON_REVIEW_CLIENT"] as const;

export type TodayAddTarget = {
  projectId: string;
  projectName: string;
  targets: Array<{ phaseId: string | null; label: string; disabledReason: string | null }>;
};

/** Resolve the display label for a phase, preferring snapshot over legacy key. */
function resolvePhaseName(phase: { key: string; name_snapshot?: string | null }): string {
  if (phase.name_snapshot) return phase.name_snapshot;
  return phaseLabel(phase.key as PhaseKey);
}

export function createTodayService(db: Db, ports: StudioFlowPorts) {
  return {
    /**
     * Legacy Today feed: every non-completed project the user holds as PIC,
     * or all live projects when `scope = "all"` (managers only).
     */
    async getToday(input: CommandContext & { scope?: "mine" | "all" }): Promise<{ groups: FeedGroup[]; addTargets: TodayAddTarget[]; scope: "mine" | "all" }> {
      const userId = requireCommand(input, P.projectRead);
      const scope = input.scope === "all" && hasPermission(input.grants, P.projectManage) ? "all" : "mine";
      const retention = new Date(nowOf(ports).getTime() - DONE_RETENTION_DAYS * 86_400_000);
      const where: Prisma.SfProjectWhereInput = {
        archived_at: null,
        status: { not: "COMPLETED" },
        ...(scope === "mine" ? { OR: [{ pic_designer_id: userId }, { pic_drafter_id: userId }] } : {}),
      };
      const notStale: Prisma.SfChecklistItemWhereInput = { NOT: { is_checked: true, checked_at: { lt: retention } } };
      const projects = await db.sfProject.findMany({
        where,
        orderBy: [{ priority: "asc" }, { name: "asc" }],
        include: {
          phases: {
            orderBy: { order_index: "asc" },
            include: {
              revisions: { where: { status: "ACTIVE" }, take: 1, include: { activities: { orderBy: { created_at: "asc" } } } },
              checklist_items: { where: notStale, select: ITEM_SELECT, orderBy: ITEM_ORDER },
            },
          },
          activities: { where: { phase_id: null }, orderBy: { created_at: "asc" } },
          checklist_items: { where: { phase_id: null, ...notStale }, select: ITEM_SELECT, orderBy: ITEM_ORDER },
        },
      });

      const rows: FeedTask[] = [];
      const activityRow = (projectId: string, phaseId: string | null, phaseKey: PhaseKey | null, label: string | null, a: { id: string; content: string; status: string; mode: string; due_at: Date | null; assigned_to_id: string | null; deferred_from_version: string | null }): FeedTask => ({
        key: `activity:${a.id}`, id: a.id, source: "activity", label: a.content, isChecked: a.status === "COMPLETED",
        projectId, phaseId, phaseKey, phaseLabel: a.deferred_from_version && label ? `${label} · deferred` : label,
        priority: 4, dueDate: dateToDateOnly(a.due_at), assigneeId: a.assigned_to_id, labels: [],
        // V2-D1: SfActivity is FEEDBACK-only
        mode: "FEEDBACK", templateId: null, parentId: null, children: [],
      });
      const itemRow = (projectId: string, phaseKey: PhaseKey | null, label: string | null, row: Parameters<typeof toItemView>[0]): FeedTask => {
        const view = toItemView(row);
        return {
          key: `checklist:${view.id}`, id: view.id, source: "checklist", label: view.label, isChecked: view.isChecked,
          projectId, phaseId: view.phaseId, phaseKey, phaseLabel: label, priority: view.priority, dueDate: view.dueDate,
          assigneeId: view.assigneeId, labels: view.labels, mode: null, templateId: view.templateId, parentId: view.parentId, children: [],
        };
      };

      const addTargets: TodayAddTarget[] = [];
      for (const project of projects) {
        for (const a of project.activities) rows.push(activityRow(project.id, null, null, null, a));
        for (const item of project.checklist_items) rows.push(itemRow(project.id, null, null, item));
        const targets: TodayAddTarget["targets"] = [{ phaseId: null, label: "General", disabledReason: null }];
        for (const phase of project.phases) {
          const phaseKey = phase.key as PhaseKey;
          const label = resolvePhaseName(phase);
          const active = (ACTIVE_PHASE_STATUSES as readonly string[]).includes(phase.status);
          const revision = phase.revisions[0];
          targets.push({ phaseId: phase.id, label, disabledReason: phase.is_locked ? "Approved" : !revision ? "Not started" : null });
          if (!active) continue;
          for (const a of revision?.activities ?? []) rows.push(activityRow(project.id, phase.id, phaseKey, label, a));
          for (const item of phase.checklist_items) rows.push(itemRow(project.id, phaseKey, label, item));
        }
        addTargets.push({ projectId: project.id, projectName: project.name, targets });
      }

      const groups = groupFeed(
        projects.map((project) => ({ id: project.id, name: project.name, isUrgent: project.priority === "URGENT" })),
        nestFeed(rows),
      );
      return { groups, addTargets, scope };
    },
  };
}
