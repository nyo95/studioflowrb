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
    <div className={cx("ui-file-zone-wrap", className)}>
      <div
        className="ui-file-zone"
        data-dragging={dragging || undefined}
        data-disabled={disabled || undefined}
        onDragEnter={(event) => { event.preventDefault(); if (!disabled) setDragging(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }}
        onDrop={onDrop}
      >
        <UploadCloud aria-hidden="true" />
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
          className="ui-visually-hidden"
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          tabIndex={-1}
          onChange={(event) => applyFiles(event.target.files)}
        />
      </div>
      {files.length ? (
        <ul className="ui-file-list">
          {files.map((file) => (
            <li key={`${file.name}-${file.size}`}>
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
