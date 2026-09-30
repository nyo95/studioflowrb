"use client";

import { useRef, useState, useTransition } from "react";
import { FileDown, Trash2, Upload, AlertTriangle, CheckCircle2 } from "lucide-react";

import { Badge, Button, SectionCard, Text } from "@/platform/ui_engine";
import { deleteDeliverableAction, extendDeliverableExpiryAction, setDeliverableFinalAction } from "../../../../actions";

type Deliverable = {
  id: string;
  name: string;
  contentType: string | null;
  fileSizeBytes: number | null;
  revisionId: string | null;
  createdAt: Date;
  isFinal: boolean;
  expiresAt: Date | null;
  daysLeft: number | null;
  versionNumber: number;
  url: string;
};

type DeliverableStatus = "MISSING" | "CURRENT" | "OUTDATED";

const STATUS_CONFIG: Record<DeliverableStatus, { label: string; tone: "success" | "warning" | "danger"; icon: typeof CheckCircle2 }> = {
  MISSING: { label: "No deliverable", tone: "danger", icon: AlertTriangle },
  CURRENT: { label: "Current", tone: "success", icon: CheckCircle2 },
  OUTDATED: { label: "Outdated", tone: "warning", icon: AlertTriangle },
};

/** Client-side courtesy check; the server enforces its own (configurable) limit. */
const CLIENT_MAX_BYTES = 500 * 1024 * 1024;
const EXPIRY_WARNING_DAYS = 7;

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
}: {
  projectId: string;
  phaseId: string;
  deliverables: Deliverable[];
  status: DeliverableStatus;
  canWork: boolean;
  canManage: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const statusConfig = STATUS_CONFIG[status];
  const StatusIcon = statusConfig.icon;

  function remove(d: Deliverable) {
    setPendingId(d.id);
    startTransition(async () => {
      await deleteDeliverableAction({ projectId, deliverableId: d.id });
      setPendingId(null);
    });
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

  function setFinal(d: Deliverable, isFinal: boolean) {
    setPendingId(d.id);
    startTransition(async () => { await setDeliverableFinalAction({ projectId, deliverableId: d.id, isFinal }); setPendingId(null); });
  }

  function extend(d: Deliverable) {
    setPendingId(d.id);
    startTransition(async () => { await extendDeliverableExpiryAction({ projectId, deliverableId: d.id }); setPendingId(null); });
  }

  return (
    <SectionCard
      title="Deliverables"
      count={deliverables.length}
      description="Files produced and uploaded during this phase."
    >
      <div className="mb-3 flex items-center gap-2">
        <StatusIcon className={`size-4 ${status === "CURRENT" ? "text-success" : status === "OUTDATED" ? "text-warning" : "text-danger"}`} />
        <Badge tone={statusConfig.tone}>{statusConfig.label}</Badge>
      </div>
      {deliverables.length === 0 ? (
        <Text tone="secondary" size="sm">No deliverables uploaded yet.</Text>
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
                  {d.isFinal ? (
                    <Badge tone="success">Final · kept</Badge>
                  ) : (
                    <Badge tone={(d.daysLeft ?? 0) <= EXPIRY_WARNING_DAYS ? "warning" : "neutral"}>
                      {(d.daysLeft ?? 0) === 0 ? "Deleted soon" : `Deleted in ${d.daysLeft} day${d.daysLeft === 1 ? "" : "s"}`}
                    </Badge>
                  )}
                  <span>Version {d.versionNumber}{d.versionNumber === 1 ? " (newest)" : ""}</span>
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
                  disabled={pendingId === d.id && isPending}
                  onClick={() => remove(d)}
                  className="shrink-0 text-ink-tertiary opacity-0 transition-opacity hover:text-danger group-hover:opacity-100 focus:opacity-100"
                  aria-label={`Delete ${d.name}`}
                >
                  <Trash2 className="size-3.5" />
                </button>
              ) : null}
              {canWork || canManage ? (
                <div className="flex gap-1">
                  <Button type="button" size="sm" variant="ghost" disabled={pendingId === d.id && isPending} onClick={() => setFinal(d, !d.isFinal)}>
                    {d.isFinal ? "Clear final" : "Mark final"}
                  </Button>
                  {!d.isFinal ? <Button type="button" size="sm" variant="ghost" disabled={pendingId === d.id && isPending} onClick={() => extend(d)}>Extend</Button> : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canWork ? (
        <div className="mt-3">
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
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-sm font-medium text-ink-secondary transition-colors hover:border-line-emphasis hover:text-ink ${isPending || progress !== null ? "pointer-events-none opacity-60" : ""}`}
          >
            <Upload className="size-3.5" />
            {progress !== null ? `Uploading… ${progress}%` : "Upload file"}
          </label>
          {progress !== null ? <progress className="mt-2 block h-1.5 w-full max-w-xs" max={100} value={progress} aria-label="Upload progress" /> : null}
          {uploadError ? <p className="mt-1.5 text-xs text-danger">{uploadError}</p> : null}
          <p className="mt-1 text-xs text-ink-tertiary">PDF, PNG, JPEG, WebP, ZIP — up to 500 MB. Files that are not marked final delete themselves after 30 days; only the 2 newest versions of a file are kept.</p>
        </div>
      ) : null}
    </SectionCard>
  );
}
