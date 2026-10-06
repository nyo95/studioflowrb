import type { Prisma } from "@/generated/prisma/client";

import { dateToDateOnly } from "../domain/dates";
import { groupFeed, nestFeed, type FeedGroup, type FeedTask } from "../domain/feed";
import { P, hasPermission, nowOf, requireCommand, type CommandContext, type Db, type StudioFlowPorts } from "../shared";
import { ITEM_ORDER, ITEM_SELECT, toItemView } from "../tasks/service";

/** Checked checklist rows older than this drop out of Today (legacy retention). */
export const DONE_RETENTION_DAYS = 7;

export type TodayAddTarget = {
  projectId: string;
  projectName: string;
  /** The same rule the server applies to a project-level add: a PIC or an override holder. */
  canAdd: boolean;
};

export function createTodayService(db: Db, ports: StudioFlowPorts) {
  return {
    /**
     * My Tasks feed: ad-hoc project-level to-dos for every non-completed project the
     * user holds as PIC or has an open to-do assigned in, or all live projects when `scope = "all"` (managers only).
     * Template-backed requirements remain requirements even when they are general,
     * and phase requirements remain on their phase; neither is duplicated here.
     */
    async getToday(input: CommandContext & { scope?: "mine" | "all" }): Promise<{ groups: FeedGroup[]; addTargets: TodayAddTarget[]; scope: "mine" | "all" }> {
      const userId = requireCommand(input, P.projectRead);
      const scope = input.scope === "all" && hasPermission(input.grants, P.projectManage) ? "all" : "mine";
      const retention = new Date(nowOf(ports).getTime() - DONE_RETENTION_DAYS * 86_400_000);
      const where: Prisma.SfProjectWhereInput = {
        archived_at: null,
        status: { not: "COMPLETED" },
        ...(scope === "mine"
          ? { OR: [{ pic_designer_id: userId }, { pic_drafter_id: userId }, { checklist_items: { some: { assigned_to_id: userId, is_checked: false, dismissed_at: null, phase_id: null, template_id: null, parent_id: null } } }] }
          : {}),
      };
      const notStale: Prisma.SfChecklistItemWhereInput = { dismissed_at: null, NOT: { is_checked: true, checked_at: { lt: retention } } };
      const projects = await db.sfProject.findMany({
        where,
        orderBy: [{ priority: "asc" }, { name: "asc" }],
        include: {
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

      const override = hasPermission(input.grants, P.projectOverride);
      const addTargets: TodayAddTarget[] = [];
      for (const project of projects) {
        const todoRootIds = new Set(
          project.checklist_items
            .filter((item) => item.parent_id === null && item.template_id === null)
            .map((item) => item.id),
        );
        for (const item of project.checklist_items) {
          if (todoRootIds.has(item.id) || (item.parent_id !== null && todoRootIds.has(item.parent_id))) {
            rows.push(itemRow(project.id, null, null, item));
          }
        }
        addTargets.push({ projectId: project.id, projectName: project.name, canAdd: override || project.pic_designer_id === userId || project.pic_drafter_id === userId });
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
