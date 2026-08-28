"use client";

import { File as FileIcon, UploadCloud } from "lucide-react";
import { useId, useRef, useState, type DragEvent, type ReactNode } from "react";

import { cx } from "../internal/cx";
import { Button, Text } from "../primitives";

export type FileDropZoneProps = {
  files?: readonly File[];
  onFiles: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  maxSize?: number;
  disabled?: boolean;
  label?: ReactNode;
  description?: ReactNode;
  className?: string;
};

export function FileDropZone({
  files = [],
  onFiles,
  accept,
  multiple = false,
  maxSize,
  disabled = false,
  label = "Drop files here",
  description = "or choose from your device",
  className,
}: FileDropZoneProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const applyFiles = (list: FileList | null) => {
    const selected = Array.from(list ?? []);
    const valid = maxSize ? selected.filter((file) => file.size <= maxSize) : selected;
    onFiles(multiple ? valid : valid.slice(0, 1));
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (!disabled) applyFiles(event.dataTransfer.files);
  };

  return (
    <div className={cx("grid gap-2", className)}>
      <div
        className={cx(
          "grid min-h-[150px] place-content-center justify-items-center gap-2 rounded-card border border-dashed border-line-strong bg-canvas p-5 text-center transition-[border-color,background-color] duration-[120ms]",
          dragging ? "border-line-focus bg-surface-muted" : "border-line-strong bg-canvas",
          disabled && "opacity-50",
        )}
        data-dragging={dragging || undefined}
        data-disabled={disabled || undefined}
        onDragEnter={(event) => { event.preventDefault(); if (!disabled) setDragging(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }}
        onDrop={onDrop}
      >
        <UploadCloud aria-hidden="true" className="h-6 w-6 text-ink-tertiary" />
        <div>
          <strong>{label}</strong>
          {description ? <Text as="p" tone="secondary" size="sm">{description}</Text> : null}
        </div>
        <Button variant="secondary" size="sm" disabled={disabled} onClick={() => inputRef.current?.click()}>
          Choose files
        </Button>
        <input
          ref={inputRef}
          id={inputId}
          className="sr-only"
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          tabIndex={-1}
          onChange={(event) => applyFiles(event.target.files)}
        />
      </div>
      {files.length ? (
        <ul className="m-0 grid list-none gap-1 p-0 [&_svg]:h-[15px] [&_svg]:w-[15px] [&_svg]:text-ink-tertiary">
          {files.map((file) => (
            <li
              key={`${file.name}-${file.size}`}
              className="grid grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-2 rounded-control border border-line-subtle bg-surface px-[9px] py-[7px]"
            >
              <FileIcon aria-hidden="true" />
              <span>{file.name}</span>
              <Text size="sm" tone="tertiary">{formatFileSize(file.size)}</Text>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
