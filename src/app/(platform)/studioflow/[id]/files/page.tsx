import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ExternalLink, FolderOpen, Inbox } from "lucide-react";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import { prisma } from "@/platform/core/db";
import { readPlatformGeneralSettings } from "@platform/core/settings";
import {
  Breadcrumb,
  EmptyState,
  MetaList,
  PageHeader,
  SectionCard,
} from "@/platform/ui_engine";
import { STUDIOFLOW_PERMISSIONS } from "@/apps/studioflow/service";
import { studioFlowService } from "@/apps/studioflow/runtime";

import { DeliverableForm, FileRowControls } from "./file-controls";
import type { FolderOption } from "./file-controls";

export const dynamic = "force-dynamic";

const TREATMENT_LABELS: Record<string, string> = {
  RECORDED: "Dicatat",
  STORED: "Tersimpan",
  LINKED: "Link",
};

/** Bytes as a short human string. 0 means "size not known" (link records). */
function humanBytes(value: bigint): string {
  const bytes = Number(value);
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size < 10 && unit > 0 ? size.toFixed(1) : Math.round(size)} ${units[unit]}`;
}

export default async function ProjectFilesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;

  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { grants } = principalGrants;

  const canRead = hasPermission(grants, STUDIOFLOW_PERMISSIONS.projectRead);
  const canManage = hasPermission(grants, STUDIOFLOW_PERMISSIONS.iterationManage);

  if (!canRead) {
    return (
      <>
        <PageHeader eyebrow="StudioFlow" title="Files" divider />
        <SectionCard>
          <EmptyState icon={FolderOpen} title="Access denied" description="You do not have permission to view this project's files." />
        </SectionCard>
      </>
    );
  }

  const [project, listing, settings] = await Promise.all([
    studioFlowService.getProject(grants, projectId).catch((error: { kind?: string }) => {
      if (error?.kind === "NOT_FOUND") return null;
      throw error;
    }),
    studioFlowService.listProjectFiles(grants, projectId).catch(() => ({ files: [], folders: [] })),
    readPlatformGeneralSettings(prisma),
  ]);
  if (!project) notFound();

  const fmt = new Intl.DateTimeFormat(settings.locale, {
    timeZone: settings.timezone,
    dateStyle: "medium",
  });

  // flatMap narrows folder_key inside the ternary; a type predicate on an
  // intersection does not simplify `string | null` down to `string`.
  const folderOptions: FolderOption[] = listing.folders.flatMap((folder) =>
    folder.folder_key ? [{ folder_key: folder.folder_key, name: folder.name }] : [],
  );

  // Group: one bucket per phase output folder, plus the unsorted tray (§8.8).
  const groups: { key: string | null; label: string; files: typeof listing.files }[] = [
    ...folderOptions.map((folder) => ({
      key: folder.folder_key,
      label: folder.name,
      files: listing.files.filter((file) => file.folder_key === folder.folder_key),
    })),
    {
      key: null,
      label: "Tray belum disortir",
      files: listing.files.filter(
        (file) => !file.folder_key || !folderOptions.some((f) => f.folder_key === file.folder_key),
      ),
    },
  ];

  return (
    <>
      <Breadcrumb
        entries={[
          { label: "Project", href: "/studioflow/projects" },
          { label: project.name, href: `/studioflow/${projectId}` },
          { label: "File" },
        ]}
      />
      <PageHeader
        title="File project"
        description={`${listing.files.length} file tercatat`}
        divider
        meta={<MetaList items={[<span key="code" className="font-ui-mono text-xs">{project.code}</span>, project.name]} />}
      />

      {canManage && (
        <>
          <SectionCard title="Add deliverable">
            <p className="mb-3 text-xs text-ink-tertiary">
              Record deliverable metadata here. The file remains on the PC or in its original storage;
              StudioFlow menyimpan metadata dan filing project.
            </p>
            <DeliverableForm projectId={projectId} folders={folderOptions} />
          </SectionCard>
        </>
      )}

      {groups.map((group) => (
        <SectionCard key={group.key ?? "__unsorted"} title={group.label}>
          {group.files.length === 0 ? (
            <EmptyState
              icon={group.key === null ? Inbox : FolderOpen}
              title="Kosong"
              description={group.key === null ? "All files are sorted." : "No files in this folder."}
            />
          ) : (
            <div className="grid gap-2">
              {group.files.map((file) => (
                <div
                  key={file.id}
                  className="grid gap-2 rounded border border-line px-4 py-3 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className={`font-medium ${file.superseded_at ? "text-ink-tertiary line-through" : ""}`}>
                        {file.filename}
                      </p>
                      <p className="text-xs text-ink-tertiary">
                        Asli: {file.original_filename} · {humanBytes(file.bytes)} · {fmt.format(new Date(file.dropped_at))}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 text-xs">
                      <span className="rounded-full bg-surface-muted px-2 py-0.5">
                        {TREATMENT_LABELS[file.treatment] ?? file.treatment}
                      </span>
                      {file.sent_in_iteration_id && (
                        <span className="rounded-full bg-surface-muted px-2 py-0.5">terkirim</span>
                      )}
                      {file.superseded_at && (
                        <span className="rounded-full bg-surface-muted px-2 py-0.5">diganti</span>
                      )}
                      {file.external_url && (
                        <a
                          href={file.external_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-action hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Buka
                        </a>
                      )}
                    </div>
                  </div>
                  <FileRowControls
                    fileId={file.id}
                    projectId={projectId}
                    folders={folderOptions}
                    currentFolder={file.folder_key}
                    canManage={canManage}
                    frozen={Boolean(file.sent_in_iteration_id) || Boolean(file.superseded_at)}
                  />
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      ))}
    </>
  );
}
