import type { Prisma } from "@/generated/prisma/client";

import { dateToDateOnly } from "../domain/dates";
import { groupFeed, nestFeed, type FeedGroup, type FeedTask } from "../domain/feed";
import { P, hasPermission, nowOf, requireCommand, type CommandContext, type Db, type StudioFlowPorts } from "../shared";
import { ITEM_ORDER, ITEM_SELECT, toItemView } from "../tasks/service";

/** Checked checklist rows older than this drop out of Today (legacy retention). */
export const DONE_RETENTION_DAYS = 7;

/** Phases whose items count as today's work (legacy `ACTIVE_PHASE_STATUSES`). */
const ACTIVE_PHASE_STATUSES = ["ACTIVE"] as const;

export type TodayAddTarget = {
  projectId: string;
  projectName: string;
  targets: Array<{ phaseId: string | null; label: string; disabledReason: string | null }>;
};

export function createTodayService(db: Db, ports: StudioFlowPorts) {
  return {
    /**
     * Legacy Today feed: every non-completed project the user holds as PIC or has an open task
     * assigned in, or all live projects when `scope = "all"` (managers only).
     */
    async getToday(input: CommandContext & { scope?: "mine" | "all" }): Promise<{ groups: FeedGroup[]; addTargets: TodayAddTarget[]; scope: "mine" | "all" }> {
      const userId = requireCommand(input, P.projectRead);
      const scope = input.scope === "all" && hasPermission(input.grants, P.projectManage) ? "all" : "mine";
      const retention = new Date(nowOf(ports).getTime() - DONE_RETENTION_DAYS * 86_400_000);
      const where: Prisma.SfProjectWhereInput = {
        archived_at: null,
        status: { not: "COMPLETED" },
        ...(scope === "mine"
          ? { OR: [{ pic_designer_id: userId }, { pic_drafter_id: userId }, { checklist_items: { some: { assigned_to_id: userId, is_checked: false, dismissed_at: null } } }] }
          : {}),
      };
      const notStale: Prisma.SfChecklistItemWhereInput = { dismissed_at: null, NOT: { is_checked: true, checked_at: { lt: retention } } };
      const projects = await db.sfProject.findMany({
        where,
        orderBy: [{ priority: "asc" }, { name: "asc" }],
        include: {
          phases: {
            orderBy: { order_index: "asc" },
            include: {
              revisions: { where: { status: { in: ["NOT_SENT", "SENT", "ANSWERED"] } }, take: 1, select: { id: true } },
              checklist_items: { where: notStale, select: ITEM_SELECT, orderBy: ITEM_ORDER },
            },
          },
          checklist_items: { where: { phase_id: null, ...notStale }, select: ITEM_SELECT, orderBy: ITEM_ORDER },
        },
      });

      const rows: FeedTask[] = [];
      const itemRow = (projectId: string, phaseDefinitionId: string | null, label: string | null, row: Parameters<typeof toItemView>[0]): FeedTask => {
        const view = toItemView(row);
        return {
          key: `checklist:${view.id}`, id: view.id, source: "checklist", label: view.label, isChecked: view.isChecked,
          projectId, phaseId: view.phaseId, phaseDefinitionId, phaseLabel: label, priority: view.priority, dueDate: view.dueDate,
          assigneeId: view.assigneeId, labels: view.labels, templateId: view.templateId, parentId: view.parentId, children: [],
        };
      };

      // The same rule the server applies when a task is added (project access): only a PIC or an override holder may add.
      const override = hasPermission(input.grants, P.projectOverride);
      const addTargets: TodayAddTarget[] = [];
      for (const project of projects) {
        const isDesigner = project.pic_designer_id === userId;
        const isDrafter = project.pic_drafter_id === userId;
        const notYours = "Not your project";
        for (const item of project.checklist_items) rows.push(itemRow(project.id, null, null, item));
        const targets: TodayAddTarget["targets"] = [{ phaseId: null, label: "General", disabledReason: override || isDesigner || isDrafter ? null : notYours }];
        for (const phase of project.phases) {
          const label = phase.name_snapshot;
          const active = (ACTIVE_PHASE_STATUSES as readonly string[]).includes(phase.status);
          const revision = phase.revisions[0];
          const seatHolder = override || isDesigner || (isDrafter && phase.seat_snapshot === "drafter");
          targets.push({ phaseId: phase.id, label, disabledReason: phase.is_locked ? "Approved" : !revision ? "Not started" : !seatHolder ? (isDesigner || isDrafter ? "Not your phase" : notYours) : null });
          // Client remarks are iteration notes, not tasks (owner, 2026-10-05). A finished phase keeps its
          // unticked requirements here until they are ticked or dismissed.
          if (active || phase.status === "DONE") {
            for (const item of phase.checklist_items) rows.push(itemRow(project.id, phase.definition_id, label, item));
          }
        }
        addTargets.push({ projectId: project.id, projectName: project.name, targets });
      }

      const groups = groupFeed(
        projects.map((project) => ({ id: project.id, name: project.name, isUrgent: project.priority === "URGENT" })),
        nestFeed(rows),
      );
      return { groups, addTargets, scope };
    },

    /** Compact home-strip projection.  It intentionally delegates to Today so
     * task filtering and retention stay one source of truth. */
    async myTasksSummary(input: CommandContext) {
      const today = await this.getToday({ ...input, scope: "mine" });
      const now = dateToDateOnly(nowOf(ports))!;
      const items = today.groups.flatMap((group) => group.tasks);
      return {
        today: items.filter((item) => !item.isChecked && item.dueDate === now).length,
        overdue: items.filter((item) => !item.isChecked && item.dueDate !== null && item.dueDate < now).length,
        items,
      };
    },
  };
}
