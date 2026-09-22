"use client";

import { AlertTriangle, CalendarCheck2, MessageSquareText, MoreHorizontal, Plus } from "lucide-react";
import Link from "next/link";
import { Popover } from "radix-ui";
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
import { phaseAccentDotClass } from "@/apps/studioflow/domain/phase";
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
        <div className="group flex items-start gap-2.5 rounded-control px-1.5 py-1.5 hover:bg-surface-muted">
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
                <span aria-hidden="true" className={`h-2 w-2 rounded-pill ${phaseAccentDotClass(task.phaseDefinitionId)}`} />
                <Link className="text-xs text-ink-secondary hover:underline" prefetch={false} href={task.phaseId ? STUDIOFLOW_ROUTES.projectPhase(task.projectId, task.phaseId) : STUDIOFLOW_ROUTES.project(task.projectId)}>
                  {task.phaseLabel}
                </Link>
              </span>
            ) : <Text size="sm" tone="tertiary">General</Text>}
            {task.priority < 4 ? <Badge tone={task.priority === 1 ? "danger" : task.priority === 2 ? "warning" : "neutral"}>P{task.priority}</Badge> : null}
            {task.labels.map((label) => <Badge key={label.id}>#{label.name}</Badge>)}
            <DueLabel date={task.dueDate} done={task.isChecked} />
            <PersonChip person={task.assigneeId ? personById.get(task.assigneeId) : null} />
            {editable && !task.isChecked ? <TaskQuickEdit task={task} people={people} labels={labels} /> : null}
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
          <Checkbox checked={showCompleted} onCheckedChange={(c) => setShowCompleted(c === true)} label="Show done" className="ml-1 text-sm" />
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
            {canManageTasks ? (
              <InlineAddRow projectId={group.project.id} targets={addTargets.find((t) => t.projectId === group.project.id)?.targets ?? null} />
            ) : null}
          </SectionCard>
        ))
      )}

      {quickAdd ? <QuickAddDialog targets={addTargets} people={people} onClose={() => setQuickAdd(false)} /> : null}
    </div>
  );
}

const PRIORITY_STYLE: Record<number, string> = {
  1: "border-danger/40 text-danger",
  2: "border-warning/40 text-warning",
  3: "border-line text-ink-secondary",
  4: "border-line text-ink-secondary",
};

/**
 * Per-row quick edit: priority, due date, assignee, labels — each commits
 * immediately (no shared Save step), matching legacy's dropdown-embedded
 * controls. Built on Popover rather than a menu primitive: a Menu role
 * forces focus onto its content on open, which fights embedded inputs
 * (see the app-switcher fix in navigation.tsx for the same class of bug).
 */
function TaskQuickEdit({ task, people, labels }: { task: FeedTask; people: Person[]; labels: Array<{ id: string; name: string; color: string }> }) {
  const { run, pending } = useCommand();
  const [open, setOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const isChecklist = task.source !== "activity";

  const updateDue = (value: string) =>
    void run(
      `due-${task.key}`,
      () =>
        task.source === "activity"
          ? activityAction({ op: "update", projectId: task.projectId, activityId: task.id, dueDate: value })
          : checklistAction({ op: "update", projectId: task.projectId, itemId: task.id, dueDate: value }),
    );
  const updatePriority = (priority: number) =>
    void run(`pr-${task.key}`, () => checklistAction({ op: "update", projectId: task.projectId, itemId: task.id, priority }));
  const updateAssignee = (assignedToId: string | null) =>
    void run(`as-${task.key}`, () => checklistAction({ op: "update", projectId: task.projectId, itemId: task.id, assignedToId }));
  const attachLabel = (name: string) =>
    void run(`lb-${task.key}`, () => checklistAction({ op: "label", projectId: task.projectId, itemId: task.id, name }));
  const detachLabel = (labelId: string) =>
    void run(`ul-${task.key}`, () => checklistAction({ op: "unlabel", projectId: task.projectId, itemId: task.id, labelId }));

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label="Edit task"
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-action text-ink-tertiary hover:bg-surface-muted hover:text-ink data-[state=open]:bg-surface-muted data-[state=open]:text-ink"
        >
          <MoreHorizontal size={14} aria-hidden="true" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={6} className="z-[65] w-60 overflow-hidden rounded-control border border-line bg-surface-raised p-2.5 shadow-elevated">
          <div className="grid gap-3">
            {isChecklist ? (
              <div className="grid gap-1">
                <p className="text-label text-ink-tertiary">Priority</p>
                <div className="flex gap-1">
                  {[1, 2, 3, 4].map((level) => (
                    <button
                      key={level}
                      type="button"
                      disabled={pending}
                      onClick={() => updatePriority(level)}
                      className={`flex-1 rounded-action border py-1 text-xs font-semibold ${PRIORITY_STYLE[level]} ${task.priority === level ? "ring-1 ring-action" : ""}`}
                    >
                      P{level}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="grid gap-1">
              <p className="text-label text-ink-tertiary">Due date</p>
              <div className="flex items-center gap-1.5">
                <Input type="date" density="compact" value={task.dueDate ?? ""} disabled={pending} onChange={(event) => updateDue(event.target.value)} className="flex-1" />
                {task.dueDate ? <Button type="button" size="sm" variant="ghost" onClick={() => updateDue("")}>Clear</Button> : null}
              </div>
            </div>
            {isChecklist ? (
              <div className="grid gap-1">
                <p className="text-label text-ink-tertiary">Assignee</p>
                <PersonSelect people={people} value={task.assigneeId} onChange={updateAssignee} />
              </div>
            ) : null}
            {isChecklist ? (
              <div className="grid gap-1">
                <p className="text-label text-ink-tertiary">Labels</p>
                {labels.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {labels.map((label) => {
                      const attached = task.labels.some((l) => l.id === label.id);
                      return (
                        <button
                          key={label.id}
                          type="button"
                          disabled={pending}
                          onClick={() => (attached ? detachLabel(label.id) : attachLabel(label.name))}
                          className={`rounded-pill border px-2 py-0.5 text-xs ${attached ? "border-action bg-action/10 text-ink" : "border-line text-ink-secondary hover:bg-surface-muted"}`}
                        >
                          #{label.name}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
                <Input
                  density="compact"
                  placeholder="New label…"
                  value={newLabel}
                  disabled={pending}
                  onChange={(event) => setNewLabel(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    const trimmed = newLabel.trim();
                    if (!trimmed) return;
                    setNewLabel("");
                    attachLabel(trimmed);
                  }}
                />
              </div>
            ) : null}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/**
 * Per-project inline quick-add: click to reveal an inline input, Enter to
 * add, blur-when-empty to collapse. Ports legacy `today-inline-add.tsx`'s
 * ergonomics (no modal for the common case) without its `#phase` hashtag
 * autocomplete, which targeted legacy's now-removed Activity-as-Todo model.
 */
function InlineAddRow({ projectId, targets }: { projectId: string; targets: TodayAddTarget["targets"] | null }) {
  const { run, pending, error } = useCommand();
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState("");
  const [phaseId, setPhaseId] = useState("");

  if (!targets || targets.length === 0) return null;

  const submit = async () => {
    const trimmed = label.trim();
    if (!trimmed) {
      setEditing(false);
      return;
    }
    const ok = await run("add", () => addChecklistItemAction({ projectId, phaseId: phaseId || null, label: trimmed }));
    if (ok) {
      setLabel("");
      setPhaseId("");
      setEditing(false);
    }
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="mt-1 flex min-h-7 items-center gap-1.5 rounded-control px-1.5 text-sm text-ink-tertiary hover:bg-surface-muted hover:text-ink-secondary"
      >
        <Plus aria-hidden="true" className="h-3.5 w-3.5" />
        Add to-do…
      </button>
    );
  }

  return (
    <form
      className="mt-1 flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <Input
        autoFocus
        density="compact"
        className="min-w-[180px] flex-1"
        placeholder="What needs doing?"
        value={label}
        disabled={pending}
        maxLength={200}
        onChange={(event) => setLabel(event.target.value)}
        onBlur={() => {
          if (!label.trim() && !pending) setEditing(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setLabel("");
            setEditing(false);
          }
        }}
      />
      {targets.length > 1 ? (
        <div className="w-40 shrink-0">
          <Select aria-label="Phase" density="compact" value={phaseId} disabled={pending} onChange={(event) => setPhaseId(event.target.value)}>
            {targets.map((t) => (
              <option key={t.phaseId ?? "general"} value={t.phaseId ?? ""} disabled={t.disabledReason !== null}>
                {t.label}{t.disabledReason ? ` — ${t.disabledReason}` : ""}
              </option>
            ))}
          </Select>
        </div>
      ) : null}
      <Button type="submit" size="sm" pending={pending} disabled={!label.trim()}>Add</Button>
      {error ? <InlineError>{error}</InlineError> : null}
    </form>
  );
}

function QuickAddDialog({ targets, people, onClose }: { targets: TodayAddTarget[]; people: Person[]; onClose: () => void }) {
  const { run, pending, error } = useCommand();
  const [projectId, setProjectId] = useState(targets[0]?.projectId ?? "");
  const project = targets.find((t) => t.projectId === projectId);
  const [phaseChoice, setPhaseChoice] = useState<string>("general");
  const [content, setContent] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [assignee, setAssignee] = useState<string | null>(null);
  const phaseId = phaseChoice === "general" ? null : phaseChoice;

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
            <Select value={projectId} onChange={(e) => { setProjectId(e.target.value); setPhaseChoice("general"); }}>
              {targets.map((t) => <option key={t.projectId} value={t.projectId}>{t.projectName}</option>)}
            </Select>
          </Field>
          <Field label="Where">
            <Select value={phaseChoice} onChange={(e) => setPhaseChoice(e.target.value)}>
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
