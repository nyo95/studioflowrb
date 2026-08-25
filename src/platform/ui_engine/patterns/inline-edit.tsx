"use client";

import { useState, type KeyboardEvent, type ReactNode } from "react";

import { cx } from "../internal/cx";
import { InlineError } from "../components";
import { Spinner } from "../primitives";

export type InlineEditKeyAction = "commit" | "cancel" | null;

export function getInlineEditKeyAction(key: string): InlineEditKeyAction {
  if (key === "Enter") return "commit";
  if (key === "Escape") return "cancel";
  return null;
}

export type InlineEditProps = {
  value: ReactNode;
  editor: ReactNode;
  editing?: boolean;
  defaultEditing?: boolean;
  onEditingChange?: (editing: boolean) => void;
  onCommit: () => void;
  onCancel: () => void;
  pending?: boolean;
  error?: ReactNode;
  editLabel?: string;
  className?: string;
};

export function InlineEdit({
  value,
  editor,
  editing,
  defaultEditing = false,
  onEditingChange,
  onCommit,
  onCancel,
  pending = false,
  error,
  editLabel = "Edit value",
  className,
}: InlineEditProps) {
  const [internalEditing, setInternalEditing] = useState(defaultEditing);
  const active = editing ?? internalEditing;
  const setEditing = (next: boolean) => {
    if (editing === undefined) setInternalEditing(next);
    onEditingChange?.(next);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!active || pending) return;
    const action = getInlineEditKeyAction(event.key);
    if (action === "commit") {
      event.preventDefault();
      onCommit();
    }
    if (action === "cancel") {
      event.preventDefault();
      onCancel();
      setEditing(false);
    }
  };

  return (
    <div
      className={cx("ui-inline-edit", className)}
      data-editing={active || undefined}
      data-pending={pending || undefined}
      onKeyDown={handleKeyDown}
    >
      {active ? (
        <div className="ui-inline-edit-editor">
          {editor}
          {pending ? <Spinner label="Saving" /> : null}
        </div>
      ) : (
        <button type="button" className="ui-inline-edit-value" aria-label={editLabel} onClick={() => setEditing(true)}>
          {value}
        </button>
      )}
      {error ? <InlineError>{error}</InlineError> : null}
    </div>
  );
}
