"use client";

import { useRef, useState } from "react";
import { FileDown, Trash2, Upload, AlertTriangle, CheckCircle2 } from "lucide-react";

import { Badge, InlineError, SectionCard, Text, useConfirm } from "@/platform/ui_engine";
import { useCommand } from "../../../../_components/use-command";
import { deleteDeliverableAction } from "../../../../actions";

type Deliverable = {
  id: string;
  name: string;
  contentType: string | null;
  fileSizeBytes: number | null;
  revisionId: string | null;
  createdAt: Date;
  url: string;
};

type DeliverableStatus = "MISSING" | "CURRENT" | "OUTDATED";

const STATUS_CONFIG: Record<DeliverableStatus, { label: string; tone: "success" | "warning" | "danger"; icon: typeof CheckCircle2 }> = {
  MISSING: { label: "No files", tone: "warning", icon: AlertTriangle },
  CURRENT: { label: "Current", tone: "success", icon: CheckCircle2 },
  OUTDATED: { label: "Outdated", tone: "warning", icon: AlertTriangle },
};

/** Client-side courtesy check; the server enforces its own (configurable) limit. */
const CLIENT_MAX_BYTES = 500 * 1024 * 1024;
function formatBytes(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DeliverablesPanel({
  projectId,
  phaseId,
  deliverables,
  status,
  canWork,
  canManage,
  title = "Deliverables",
  description = "Files produced and uploaded during this phase.",
}: {
  projectId: string;
  phaseId: string;
  deliverables: Deliverable[];
  status: DeliverableStatus;
  canWork: boolean;
  canManage: boolean;
  title?: string;
  description?: string;
}) {
  const command = useCommand();
  const confirm = useConfirm();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const statusConfig = STATUS_CONFIG[status];
  const StatusIcon = statusConfig.icon;

  async function remove(d: Deliverable) {
    const accepted = await confirm.confirm({
      title: `Delete ${d.name}?`,
      description: "This permanently deletes the file for this phase. This cannot be undone.",
      confirmLabel: "Delete file",
      tone: "danger",
    });
    if (!accepted) return;
    await command.run(`deliverable:${d.id}`, () => deleteDeliverableAction({ projectId, deliverableId: d.id }));
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    setUploadError(null);
    if (file.size > CLIENT_MAX_BYTES) {
      setUploadError(`That file is ${formatBytes(file.size)}. The limit is ${formatBytes(CLIENT_MAX_BYTES)}.`);
      input.value = "";
      return;
    }
    // XMLHttpRequest, not fetch: fetch cannot report upload progress, which matters for files of hundreds of MB.
    const request = new XMLHttpRequest();
    request.open("PUT", "/api/studioflow/deliverables");
    request.setRequestHeader("content-type", file.type);
    request.setRequestHeader("x-studioflow-project-id", projectId);
    request.setRequestHeader("x-studioflow-phase-id", phaseId);
    request.setRequestHeader("x-studioflow-file-name", file.name);
    request.upload.onprogress = (event) => { if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100)); };
    const finish = (message: string | null) => {
      setProgress(null);
      input.value = "";
      if (message) setUploadError(message);
      else window.location.reload();
    };
    request.onerror = () => finish("The upload was interrupted. Check the connection and try again.");
    request.onabort = () => finish("The upload was cancelled.");
    request.onload = () => {
      try {
        const result = JSON.parse(request.responseText) as { ok: boolean; error?: { safeMessage: string } };
        finish(result.ok ? null : result.error?.safeMessage ?? "Upload failed.");
      } catch {
        finish("Upload failed.");
      }
    };
    setProgress(0);
    request.send(file);
  }

  return (
    <SectionCard
      title={title}
      count={deliverables.length}
      description={description}
    >
      {status !== "MISSING" ? <div className="mb-3 flex items-center gap-2">
        <StatusIcon className={`size-4 ${status === "CURRENT" ? "text-success" : status === "OUTDATED" ? "text-warning" : "text-danger"}`} />
        <Badge tone={statusConfig.tone}>{statusConfig.label}</Badge>
      </div> : null}
      {deliverables.length === 0 ? (
        <Text tone="secondary" size="sm">No files uploaded yet.</Text>
      ) : (
        <ul className="divide-y divide-line-subtle">
          {deliverables.map((d) => (
            <li key={d.id} className="group flex items-center gap-2.5 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-ink">{d.name}</p>
                {d.fileSizeBytes !== null ? (
                  <p className="text-xs text-ink-secondary">{formatBytes(d.fileSizeBytes)}</p>
                ) : null}
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-secondary">
                  <span>Current phase file</span>
                </p>
              </div>
              <a
                href={d.url}
                download={d.name}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-ink-tertiary transition-colors hover:text-ink"
                aria-label={`Download ${d.name}`}
              >
                <FileDown className="size-4" />
              </a>
              {canManage ? (
                <button
                  type="button"
                  disabled={command.isPending(`deliverable:${d.id}`)}
                  onClick={() => void remove(d)}
                  className="shrink-0 text-ink-tertiary opacity-0 transition-opacity hover:text-danger group-hover:opacity-100 focus:opacity-100"
                  aria-label={`Delete ${d.name}`}
                >
                  <Trash2 className="size-3.5" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {command.error ? <div className="mt-3"><InlineError>{command.error}</InlineError></div> : null}

      {canWork ? (
        <div className={`mt-3 ${status === "MISSING" ? "rounded-control bg-surface-muted p-3" : ""}`}>
          <input
            ref={fileRef}
            type="file"
            id={`deliverable-upload-${phaseId}`}
            className="sr-only"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.zip,application/pdf,image/png,image/jpeg,image/webp,application/zip"
            onChange={handleFileChange}
          />
          <label
            htmlFor={`deliverable-upload-${phaseId}`}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-sm font-medium text-ink-secondary transition-colors hover:border-line-emphasis hover:text-ink ${command.pending || progress !== null ? "pointer-events-none opacity-60" : ""}`}
          >
            <Upload className="size-3.5" />
            {progress !== null ? `Uploading… ${progress}%` : "Upload file"}
          </label>
          {progress !== null ? <progress className="mt-2 block h-1.5 w-full max-w-xs" max={100} value={progress} aria-label="Upload progress" /> : null}
          {uploadError ? <p className="mt-1.5 text-xs text-danger">{uploadError}</p> : null}
          <p className="mt-1 text-xs text-ink-tertiary">PDF, PNG, JPEG, WebP or ZIP · up to 500 MB. A new upload replaces this phase&apos;s previous file.</p>
        </div>
      ) : null}
      {confirm.dialog}
    </SectionCard>
  );
}
