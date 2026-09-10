"use client";

import {
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type HTMLAttributes,
  type ReactNode,
} from "react";

import { cx } from "../internal/cx";
import { selectFiles, type FileDescriptor } from "../internal/file-drop";

export type { FileDescriptor };

export type FileDropZoneProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  "children" | "onDrop" | "onDragEnter" | "onDragOver" | "onDragLeave" | "role"
> & {
  /** Accessible name for the region. Required: an unnamed box announces nothing. */
  label: string;
  /**
   * Receives the files one gesture yielded, already filtered by `accept` and
   * trimmed to one unless `multiple`. Never called with an empty list, so a
   * consumer needs no "did anything arrive" branch.
   */
  onFiles: (files: FileDescriptor[]) => void;
  /** Native accept list. Applied to both the drop filter and the picker. */
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  /** Caller-owned note under the zone, e.g. what happens to the bytes. */
  hint?: ReactNode;
  /** Caller-owned wording for the keyboard-reachable picker. */
  browseLabel?: ReactNode;
  /** Controls composed inside the zone, e.g. the field a drop fills in. */
  children?: ReactNode;
};

/**
 * Generic file drop region.
 *
 * The engine owns the drag/drop gesture, the active-target presentation, the
 * accept filter, and the keyboard path to a real file picker. It owns no
 * storage, upload, transport, validation, or retention policy: it reports the
 * name, size, and media type of what was dropped and nothing else.
 *
 * The zone deliberately carries no `name` on its picker, so a file never rides
 * along with a form submission. A consumer that wants bytes on a server must
 * send them through its own approved boundary.
 */
export function FileDropZone({
  label,
  onFiles,
  accept,
  multiple = false,
  disabled = false,
  hint,
  browseLabel = "Choose file",
  children,
  className,
  ...props
}: FileDropZoneProps) {
  const [active, setActive] = useState(false);
  const pickerRef = useRef<HTMLInputElement>(null);

  const emit = (list: FileList | null) => {
    if (disabled || !list) return;
    const chosen = selectFiles(Array.from(list), { accept, multiple });
    if (chosen.length) onFiles(chosen);
  };

  // Without preventDefault the browser leaves the page and opens the file.
  const hold = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!disabled) setActive(true);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    emit(event.target.files);
    // Picking the same file twice must fire change twice.
    event.target.value = "";
  };

  return (
    <div
      {...props}
      className={cx(
        "rounded-control border border-dashed px-3 py-2 transition-colors",
        disabled
          ? "border-line-subtle bg-surface-muted"
          : active
            ? "border-action bg-action/5"
            : "border-line",
        className,
      )}
      role="group"
      aria-label={label}
      aria-disabled={disabled || undefined}
      data-drop-active={active || undefined}
      onDragEnter={hold}
      onDragOver={hold}
      onDragLeave={(event) => {
        // Only leaving the zone's own boundary ends the highlight; crossing a
        // child element does not, or the target flickers while dragging over it.
        if (event.currentTarget === event.target) setActive(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setActive(false);
        emit(event.dataTransfer.files);
      }}
    >
      {children}
      <div
        className={cx(
          "mt-1 flex flex-wrap items-center gap-x-3 gap-y-1",
          hint ? "justify-between" : "justify-end",
        )}
      >
        {hint ? <p className="text-xs text-ink-tertiary">{hint}</p> : null}
        <button
          type="button"
          className="shrink-0 rounded-action text-xs font-semibold text-ink-secondary underline decoration-line-strong underline-offset-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-focus disabled:cursor-not-allowed disabled:text-ink-tertiary disabled:no-underline"
          disabled={disabled}
          onClick={() => pickerRef.current?.click()}
        >
          {browseLabel}
        </button>
      </div>
      {/* Dragging is a pointer-only gesture, so the zone keeps a real picker
          that the button above reaches for keyboard and assistive-technology
          users. It stays out of the accessibility tree because the button is
          the affordance, and it carries no `name` so no byte is ever
          submitted with the surrounding form. */}
      <input
        ref={pickerRef}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleChange}
      />
    </div>
  );
}
