"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Circle, Trash2, Plus } from "lucide-react";

import { Button, SectionCard, Text } from "@/platform/ui_engine";
import {
  createRequirementAction,
  deleteRequirementAction,
  toggleRequirementAction,
} from "../../../../actions";

type Requirement = {
  id: string;
  phaseId: string | null;
  title: string;
  description: string | null;
  isMet: boolean;
  metAt: Date | null;
  metById: string | null;
  createdAt: Date;
};

export function RequirementsPanel({
  projectId,
  phaseId,
  requirements,
  canWork,
  canManage,
}: {
  projectId: string;
  phaseId: string;
  requirements: Requirement[];
  canWork: boolean;
  canManage: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  function toggle(req: Requirement) {
    setPendingId(req.id);
    startTransition(async () => {
      await toggleRequirementAction({ projectId, requirementId: req.id, met: !req.isMet });
      setPendingId(null);
    });
  }

  function remove(req: Requirement) {
    setPendingId(req.id);
    startTransition(async () => {
      await deleteRequirementAction({ projectId, requirementId: req.id });
      setPendingId(null);
    });
  }

  function add() {
    if (!newTitle.trim()) return;
    startTransition(async () => {
      await createRequirementAction({ projectId, phaseId, title: newTitle.trim(), description: newDesc.trim() || null });
      setNewTitle("");
      setNewDesc("");
      setShowAdd(false);
    });
  }

  const phaseReqs = requirements.filter((r) => r.phaseId !== null);
  const globalReqs = requirements.filter((r) => r.phaseId === null);

  return (
    <SectionCard
      title="Requirements"
      count={requirements.length}
      description="Items that must be addressed before this phase can be approved."
    >
      {requirements.length === 0 && !canManage ? (
        <Text tone="secondary" size="sm">No requirements for this phase.</Text>
      ) : null}

      {phaseReqs.length > 0 ? (
        <ul className="divide-y divide-line-subtle">
          {phaseReqs.map((req) => (
            <RequirementRow
              key={req.id}
              req={req}
              canWork={canWork}
              canManage={canManage}
              isLoading={pendingId === req.id && isPending}
              onToggle={toggle}
              onDelete={remove}
            />
          ))}
        </ul>
      ) : null}

      {globalReqs.length > 0 ? (
        <>
          <Text meta className="mt-3">Project-wide</Text>
          <ul className="divide-y divide-line-subtle">
            {globalReqs.map((req) => (
              <RequirementRow
                key={req.id}
                req={req}
                canWork={canWork}
                canManage={false}
                isLoading={pendingId === req.id && isPending}
                onToggle={toggle}
                onDelete={remove}
              />
            ))}
          </ul>
        </>
      ) : null}

      {canManage ? (
        showAdd ? (
          <div className="mt-3 grid gap-2">
            <input
              autoFocus
              className="block w-full rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-brand-line"
              placeholder="Requirement title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void add(); } if (e.key === "Escape") { setShowAdd(false); } }}
            />
            <textarea
              className="block w-full resize-none rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-brand-line"
              rows={2}
              placeholder="Description (optional)"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
            />
            <div className="flex gap-2">
              <Button size="sm" variant="primary" pending={isPending} onClick={() => void add()}>Add</Button>
              <Button size="sm" variant="ghost" onClick={() => { setShowAdd(false); setNewTitle(""); setNewDesc(""); }}>Cancel</Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="mt-3 flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink"
            onClick={() => setShowAdd(true)}
          >
            <Plus className="size-3.5" /> Add requirement
          </button>
        )
      ) : null}
    </SectionCard>
  );
}

function RequirementRow({
  req,
  canWork,
  canManage,
  isLoading,
  onToggle,
  onDelete,
}: {
  req: Requirement;
  canWork: boolean;
  canManage: boolean;
  isLoading: boolean;
  onToggle: (req: Requirement) => void;
  onDelete: (req: Requirement) => void;
}) {
  return (
    <li className="flex items-start gap-2.5 py-2.5">
      {canWork ? (
        <button
          type="button"
          disabled={isLoading}
          onClick={() => onToggle(req)}
          className={`mt-0.5 shrink-0 transition-colors ${req.isMet ? "text-success" : "text-ink-muted hover:text-ink-secondary"}`}
          aria-label={req.isMet ? "Mark as not met" : "Mark as met"}
        >
          {req.isMet ? <CheckCircle2 className="size-4" /> : <Circle className="size-4" />}
        </button>
      ) : (
        <span className={`mt-0.5 shrink-0 ${req.isMet ? "text-success" : "text-ink-muted"}`}>
          {req.isMet ? <CheckCircle2 className="size-4" /> : <Circle className="size-4" />}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className={`text-sm leading-snug ${req.isMet ? "text-ink-secondary line-through" : "text-ink"}`}>{req.title}</p>
        {req.description ? <p className="mt-0.5 text-xs text-ink-secondary">{req.description}</p> : null}
      </div>
      {canManage ? (
        <button
          type="button"
          disabled={isLoading}
          onClick={() => onDelete(req)}
          className="shrink-0 text-ink-muted opacity-0 transition-opacity hover:text-danger group-hover:opacity-100 focus:opacity-100"
          aria-label="Delete requirement"
        >
          <Trash2 className="size-3.5" />
        </button>
      ) : null}
    </li>
  );
}
