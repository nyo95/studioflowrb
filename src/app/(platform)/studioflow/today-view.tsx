"use client";

import { AlertTriangle, CalendarCheck2, MessageSquareText, Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import {
  applyChecklistFilter,
  countChecklistFilters,
  fromChecklistFilterQuery,
  toChecklistFilterQuery,
  type ChecklistFilter,
  type ChecklistFilterQuery,
} from "@/apps/studioflow/domain/checklist";
import { countOpen, type FeedGroup, type FeedTask } from "@/apps/studioflow/domain/feed";
import { phaseAccentDotClass, type PhaseKey } from "@/apps/studioflow/domain/phase";
import type { TodayAddTarget } from "@/apps/studioflow/today/service";
import { STUDIOFLOW_ROUTES } from "@/apps/studioflow/public/nav";
import { currentDateOnly } from "@platform/utilities/date";
import { useDisplaySettings } from "@/platform/authenticated-shell/display-settings";
import {
  Badge,
  Button,
  Checkbox,
  CountBadge,
  Dialog,
  EmptyState,
  Field,
  FilterChip,
  FormActions,
  GroupHeader,
  InlineError,
  Input,
  RowActionMenu,
  SectionCard,
  Select,
  Text,
} from "@/platform/ui_engine";

import { activityAction, addChecklistItemAction, checklistAction, deleteFilterViewAction, saveFilterViewAction } from "./actions";
import { DueLabel } from "./_components/due-label";
import { PersonChip, PersonSelect, type Person } from "./_components/people";
import { useCommand } from "./_components/use-command";

const FILTER_LABELS: Record<ChecklistFilter, string> = { all: "All", today: "Due today", overdue: "Overdue", p1: "P1", mine: "Assigned to me" };

type Props = {
  groups: FeedGroup[];
  addTargets: TodayAddTarget[];
  people: Person[];
  currentUserId: string;
  labels: Array<{ id: string; name: string; color: string }>;
  savedFilters: Array<{ id: string; name: string; query: ChecklistFilterQuery }>;
  canWork: boolean;
  canManageTasks: boolean;
};

function filterTree(tasks: FeedTask[], keep: (task: FeedTask) => boolean): FeedTask[] {
  return tasks.flatMap((task) => {
    const children = task.children.filter(keep);
    return keep(task) || children.length > 0 ? [{ ...task, children }] : [];
  });
}

export function TodayView({ groups, addTargets, people, currentUserId, labels, savedFilters, canWork, canManageTasks }: Props) {
  const { timezone } = useDisplaySettings();
  const today = currentDateOnly({ timeZone: timezone });
  const [filter, setFilter] = useState<ChecklistFilter>("all");
  const [showCompleted, setShowCompleted] = useState(false);
  const [labelFilter, setLabelFilter] = useState<string>("");
  const [quickAdd, setQuickAdd] = useState(false);
  const [saveName, setSaveName] = useState("");
  const { run, pendingKey, error } = useCommand();
  const personById = new Map(people.map((p) => [p.id, p]));

  const allRows = useMemo(() => groups.flatMap((g) => g.tasks.flatMap((t) => [t, ...t.children])).map((t) => ({ ...t, assigneeId: t.assigneeId })), [groups]);
  const counts = countChecklistFilters(allRows.filter((t) => !t.isChecked), currentUserId, today);

  const visibleGroups = groups.map((group) => {
    const matching = new Set(applyChecklistFilter(group.tasks.flatMap((t) => [t, ...t.children]), filter, currentUserId, today).map((t) => t.key));
    const keep = (task: FeedTask) =>
      matching.has(task.key) &&
      (showCompleted || !task.isChecked) &&
      (!labelFilter || task.labels.some((label) => label.id === labelFilter));
    return { ...group, tasks: filterTree(group.tasks, keep) };
  });
  const filtering = filter !== "all" || labelFilter !== "";
  const shownGroups = filtering ? visibleGroups.filter((g) => g.tasks.length > 0) : visibleGroups;
  const totalOpen = groups.reduce((sum, g) => sum + countOpen(g.tasks), 0);

  const toggle = (task: FeedTask, checked: boolean) =>
    task.source === "activity"
      ? run(task.key, () => activityAction({ op: "done", projectId: task.projectId, activityId: task.id, done: checked }))
      : run(task.key, () => checklistAction({ op: "check", projectId: task.projectId, itemId: task.id, checked }));

  const renderTask = (task: FeedTask, nested = false) => {
    const editable = task.source === "activity" ? canWork : canManageTasks;
    return (
      <li key={task.key} className={`grid gap-px ${nested ? "ml-7" : ""}`}>
        <div className="flex items-start gap-2.5 rounded-control px-1.5 py-1.5 hover:bg-surface-muted">
          {task.mode === "FEEDBACK" ? <MessageSquareText aria-label="Feedback" className="mt-0.5 h-4 w-4 shrink-0 text-warning" /> : null}
          <Checkbox
            checked={task.isChecked}
            disabled={!editable || pendingKey === task.key}
            onCheckedChange={(checked) => toggle(task, checked === true)}
            label={<span className={task.isChecked ? "text-ink-tertiary line-through" : ""}>{task.label}</span>}
            className="min-w-0 flex-1"
          />
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {task.phaseLabel ? (
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className={`h-2 w-2 rounded-pill ${phaseAccentDotClass(task.phaseKey as PhaseKey | null)}`} />
                <Link className="text-xs text-ink-secondary hover:underline" prefetch={false} href={task.phaseId ? STUDIOFLOW_ROUTES.projectPhase(task.projectId, task.phaseId) : STUDIOFLOW_ROUTES.project(task.projectId)}>
                  {task.phaseLabel}
                </Link>
              </span>
            ) : <Text size="sm" tone="tertiary">General</Text>}
            {task.priority < 4 ? <Badge tone={task.priority === 1 ? "danger" : task.priority === 2 ? "warning" : "neutral"}>P{task.priority}</Badge> : null}
            {task.labels.map((label) => <Badge key={label.id}>#{label.name}</Badge>)}
            <DueLabel date={task.dueDate} done={task.isChecked} />
            <PersonChip person={task.assigneeId ? personById.get(task.assigneeId) : null} />
            {task.source === "activity" && canWork ? (
              <RowActionMenu items={[{ label: "Delete", danger: true, onSelect: () => run(task.key, () => activityAction({ op: "delete", projectId: task.projectId, activityId: task.id })) }]} />
            ) : null}
          </div>
        </div>
        {task.children.length > 0 ? <ul className="m-0 grid list-none gap-px p-0">{task.children.map((child) => renderTask(child, true))}</ul> : null}
      </li>
    );
  };

  const currentQuery = toChecklistFilterQuery(filter, showCompleted);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter">
          {(Object.keys(FILTER_LABELS) as ChecklistFilter[]).map((key) => (
            <FilterChip key={key} selected={filter === key} count={key === "all" ? totalOpen : counts[key]} onClick={() => setFilter(key)}>
              {key === "overdue" && counts.overdue > 0 ? <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5 text-danger" /> : null}
              {FILTER_LABELS[key]}
            </FilterChip>
          ))}
          {labels.length > 0 ? (
            <div className="w-40 shrink-0"><Select aria-label="Label" density="compact" value={labelFilter} onChange={(e) => setLabelFilter(e.target.value)}>
              <option value="">Any label</option>
              {labels.map((label) => <option key={label.id} value={label.id}>#{label.name}</option>)}
            </Select></div>
          ) : null}
          <Checkbox checked={showCompleted} onCheckedChange={(c) => setShowCompleted(c === true)} label="Show done" className="ml-1 text-[0.8125rem]" />
        </div>
        <div className="flex items-center gap-2">
          {savedFilters.length > 0 ? (
            <div className="w-44 shrink-0"><Select aria-label="Saved filters" density="compact" value="" onChange={(e) => {
              const view = savedFilters.find((f) => f.id === e.target.value);
              if (view) { const next = fromChecklistFilterQuery(view.query); setFilter(next.filter); setShowCompleted(next.showCompleted); }
            }}>
              <option value="">Saved filters…</option>
              {savedFilters.map((view) => <option key={view.id} value={view.id}>{view.name}</option>)}
            </Select></div>
          ) : null}
          {canManageTasks && addTargets.length > 0 ? (
            <Button variant="primary" leadingIcon={<Plus aria-hidden="true" />} onClick={() => setQuickAdd(true)}>Quick add</Button>
          ) : null}
        </div>
      </div>

      {filtering || showCompleted ? (
        <form className="flex flex-wrap items-center gap-2" onSubmit={async (event) => {
          event.preventDefault();
          if (await run("save-filter", () => saveFilterViewAction({ name: saveName, query: currentQuery }))) setSaveName("");
        }}>
          <Input aria-label="Filter name" density="compact" className="w-56" placeholder="Save this view as…" value={saveName} maxLength={60} onChange={(e) => setSaveName(e.target.value)} />
          <Button type="submit" size="sm" disabled={!saveName.trim()} pending={pendingKey === "save-filter"}>Save view</Button>
          {savedFilters.map((view) => (
            <Button key={view.id} type="button" size="sm" variant="ghost" onClick={() => run(`del-${view.id}`, () => deleteFilterViewAction(view.id))} title="Delete saved view">
              Remove “{view.name}”
            </Button>
          ))}
        </form>
      ) : null}

      {error ? <InlineError>{error}</InlineError> : null}

      {groups.length === 0 ? (
        <SectionCard>
          <EmptyState icon={CalendarCheck2} title="You are not on any running project" description="Projects appear here as soon as you are their designer or drafter." />
        </SectionCard>
      ) : shownGroups.length === 0 ? (
        <SectionCard><EmptyState title="Nothing matches this filter" /></SectionCard>
      ) : (
        shownGroups.map((group) => (
          <SectionCard
            key={group.project.id}
            padded
            title={<Link href={STUDIOFLOW_ROUTES.project(group.project.id)} prefetch={false} className="hover:underline">{group.project.name}</Link>}
            count={<CountBadge>{countOpen(group.tasks)} open</CountBadge>}
            action={group.project.isUrgent ? <Badge tone="danger">Urgent</Badge> : undefined}
          >
            {group.tasks.length === 0 ? (
              <Text tone="tertiary" size="sm">Nothing open on this project.</Text>
            ) : (
              <ul className="m-0 grid list-none gap-px p-0">{group.tasks.map((task) => renderTask(task))}</ul>
            )}
          </SectionCard>
        ))
      )}

      {quickAdd ? <QuickAddDialog targets={addTargets} people={people} onClose={() => setQuickAdd(false)} /> : null}
    </div>
  );
}

function QuickAddDialog({ targets, people, onClose }: { targets: TodayAddTarget[]; people: Person[]; onClose: () => void }) {
  const { run, pending, error } = useCommand();
  const [projectId, setProjectId] = useState(targets[0]?.projectId ?? "");
  const project = targets.find((t) => t.projectId === projectId);
  const [phaseKey, setPhaseKey] = useState<string>("general");
  const [content, setContent] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [assignee, setAssignee] = useState<string | null>(null);
  const phaseId = phaseKey === "general" ? null : phaseKey;

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !pending) onClose(); }} title="Quick add to-do" dismissible={!pending}>
      <form className="grid gap-3.5" onSubmit={async (event) => {
        event.preventDefault();
        const ok = await run("quick-add", () => addChecklistItemAction({ projectId, phaseId, label: content, dueDate: dueDate || null, assignedToId: assignee }));
        if (ok) onClose();
      }}>
        <Field label="To-do" required>
          <Input autoFocus value={content} maxLength={2000} onChange={(e) => setContent(e.target.value)} placeholder="What needs doing?" />
        </Field>
        <div className="grid grid-cols-2 gap-3 max-[560px]:grid-cols-1">
          <Field label="Project" required>
            <Select value={projectId} onChange={(e) => { setProjectId(e.target.value); setPhaseKey("general"); }}>
              {targets.map((t) => <option key={t.projectId} value={t.projectId}>{t.projectName}</option>)}
            </Select>
          </Field>
          <Field label="Where">
            <Select value={phaseKey} onChange={(e) => setPhaseKey(e.target.value)}>
              {project?.targets.map((t) => (
                <option key={t.phaseId ?? "general"} value={t.phaseId ?? "general"} disabled={t.disabledReason !== null}>
                  {t.label}{t.disabledReason ? ` — ${t.disabledReason}` : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Due date"><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
          <Field label="Assignee"><PersonSelect people={people} value={assignee} onChange={setAssignee} /></Field>
        </div>
        {error ? <InlineError>{error}</InlineError> : null}
        <FormActions>
          <Button type="button" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button type="submit" variant="primary" pending={pending} disabled={!content.trim() || !projectId}>Add to-do</Button>
        </FormActions>
      </form>
    </Dialog>
  );
}
