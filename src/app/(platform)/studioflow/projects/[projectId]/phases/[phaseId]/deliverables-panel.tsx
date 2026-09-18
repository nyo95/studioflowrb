"use client";

import { useRef, useState, useTransition } from "react";
import { FileDown, Trash2, Upload, AlertTriangle, CheckCircle2 } from "lucide-react";

import { Badge, Button, SectionCard, Text } from "@/platform/ui_engine";
import { deleteDeliverableAction, uploadDeliverableAction } from "../../../../actions";

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
  MISSING: { label: "No deliverable", tone: "danger", icon: AlertTriangle },
  CURRENT: { label: "Current", tone: "success", icon: CheckCircle2 },
  OUTDATED: { label: "Outdated", tone: "warning", icon: AlertTriangle },
};

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
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("projectId", projectId);
      fd.set("phaseId", phaseId);
      fd.set("name", file.name);
      fd.set("file", file);
      const result = await uploadDeliverableAction(fd);
      if (!result.ok) setUploadError(result.error.safeMessage);
      if (fileRef.current) fileRef.current.value = "";
    });
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
              </div>
              <a
                href={d.url}
                download={d.name}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-ink-muted transition-colors hover:text-ink"
                aria-label={`Download ${d.name}`}
              >
                <FileDown className="size-4" />
              </a>
              {canManage ? (
                <button
                  type="button"
                  disabled={pendingId === d.id && isPending}
                  onClick={() => remove(d)}
                  className="shrink-0 text-ink-muted opacity-0 transition-opacity hover:text-danger group-hover:opacity-100 focus:opacity-100"
                  aria-label={`Delete ${d.name}`}
                >
                  <Trash2 className="size-3.5" />
                </button>
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
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-sm font-medium text-ink-secondary transition-colors hover:border-line-emphasis hover:text-ink ${isPending ? "pointer-events-none opacity-60" : ""}`}
          >
            <Upload className="size-3.5" />
            {isPending ? "Uploading…" : "Upload file"}
          </label>
          {uploadError ? <p className="mt-1.5 text-xs text-danger">{uploadError}</p> : null}
          <p className="mt-1 text-xs text-ink-muted">PDF, PNG, JPEG, WebP, ZIP — max 25 MB</p>
        </div>
      ) : null}
    </SectionCard>
  );
}
