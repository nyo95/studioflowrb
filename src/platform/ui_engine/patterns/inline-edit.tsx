"use client";

import { LoaderCircle } from "lucide-react";
import {
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { cx } from "../internal/cx";

export type InlineEditProps = {
  /** Current committed value. The caller owns it; this control never mutates it. */
  value: string;
  /**
   * Commits an edit. Reject or throw to refuse it: the control restores the
   * previous value and shows the failure, per the shared interaction contract.
   */
  onCommit: (next: string) => void | Promise<void>;
  /** Accessible name for the field. Table headers are not announced per cell. */
  label: string;
  align?: "start" | "center" | "end";
  disabled?: boolean;
  placeholder?: string;
  /**
   * Blur commits only when the owning pattern explicitly enables it. Off by
   * default: a click elsewhere is not a decision.
   */
  commitOnBlur?: boolean;
  inputMode?: "text" | "decimal" | "numeric";
  /** Read-mode presentation, e.g. a formatted amount. Editing always uses raw text. */
  display?: (value: string) => ReactNode;
  /** Failure presentation. The engine owns when; the caller owns the wording. */
  errorLabel?: (error: unknown) => ReactNode;
  className?: string;
};

const ALIGN_CLASSES: Record<"start" | "center" | "end", string> = {
  start: "text-left justify-start",
  center: "text-center justify-center",
  end: "text-right justify-end tabular-nums",
};

/**
 * Generic editable cell shell.
 *
 * The engine owns edit/focus state, the keyboard convention, and the pending and
 * failed-save presentation. It owns no validation and no persistence: what a
 * value means, whether it is allowed, and where it is written are the caller's.
 *
 * Keyboard, per `DESIGN.md` §13: Enter commits, Escape cancels and restores,
 * blur commits only when `commitOnBlur` says so. A refused commit restores the
 * prior value rather than leaving an unsaved edit that looks saved.
 */
export function InlineEdit({
  value,
  onCommit,
  label,
  align = "start",
  disabled = false,
  placeholder,
  commitOnBlur = false,
  inputMode = "text",
  display,
  errorLabel = () => "Could not save that change.",
  className,
}: InlineEditProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ReactNode>(null);
  const errorId = useId();
  // Escape must not be followed by the blur handler committing what it cancelled.
  const cancelledRef = useRef(false);

  const startEditing = () => {
    if (disabled || pending) return;
    setDraft(value);
    setError(null);
    cancelledRef.current = false;
    setEditing(true);
  };

  const cancel = () => {
    cancelledRef.current = true;
    setDraft(value);
    setError(null);
    setEditing(false);
  };

  const commit = async () => {
    if (cancelledRef.current) return;
    const next = draft.trim();
    if (next === value) {
      setEditing(false);
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onCommit(next);
      setEditing(false);
    } catch (failure) {
      // A refused save must not leave the refused text on screen looking saved.
      setDraft(value);
      setError(errorLabel(failure));
    } finally {
      setPending(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void commit();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
    }
  };

  if (!editing) {
    return (
      <span className={cx("inline-flex w-full min-w-0 items-center gap-1.5", ALIGN_CLASSES[align], className)}>
        <button
          type="button"
          className={cx(
            "min-w-0 max-w-full truncate rounded-action border border-transparent bg-transparent px-1.5 py-0.5 text-[inherit] [font:inherit]",
            ALIGN_CLASSES[align],
            disabled
              ? "cursor-not-allowed text-ink-tertiary"
              : "cursor-text hover:border-line hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-line-focus",
          )}
          aria-label={`${label}${value ? `: ${value}` : ""}`}
          aria-describedby={error ? errorId : undefined}
          disabled={disabled}
          onClick={startEditing}
          onFocus={(event) => {
            // Tabbing onto a cell opens it, so keyboard entry never needs a click.
            if (event.currentTarget === document.activeElement) startEditing();
          }}
        >
          {display ? display(value) : value || <span className="text-ink-tertiary">{placeholder ?? "—"}</span>}
        </button>
        {error ? (
          <span id={errorId} role="alert" className="shrink-0 text-xs text-danger">
            {error}
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <span className={cx("inline-flex w-full min-w-0 items-center gap-1.5", ALIGN_CLASSES[align], className)}>
      <input
        /* The cell was just opened for editing, so focus belongs here. */
        autoFocus
        className={cx(
          "w-full min-w-0 rounded-action border border-line-focus bg-surface px-1.5 py-0.5 text-[inherit] [font:inherit] shadow-[0_0_0_3px_rgb(87_83_78/0.12)] focus:outline-0",
          ALIGN_CLASSES[align],
        )}
        value={draft}
        inputMode={inputMode}
        aria-label={label}
        aria-busy={pending || undefined}
        aria-describedby={error ? errorId : undefined}
        disabled={pending}
        placeholder={placeholder}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={(event) => event.currentTarget.select()}
        onBlur={() => (commitOnBlur ? void commit() : cancel())}
      />
      {pending ? <LoaderCircle aria-hidden="true" className="h-3.5 w-3.5 shrink-0 animate-ui-spin text-ink-tertiary" /> : null}
      {error ? (
        <span id={errorId} role="alert" className="shrink-0 text-xs text-danger">
          {error}
        </span>
      ) : null}
    </span>
  );
}
