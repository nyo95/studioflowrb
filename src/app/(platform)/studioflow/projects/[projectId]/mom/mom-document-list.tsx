"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FilePlus2, Printer } from "lucide-react";
import { useState } from "react";

import { useDisplaySettings } from "@/platform/authenticated-shell/display-settings";
import { formatDateOnly } from "@platform/utilities/date";
import { STUDIOFLOW_ROUTES } from "@/apps/studioflow/public";
import { Badge, Button, Dialog, EmptyState, Field, FormattedInstant, InlineError, Input, RowActionMenu, Text, useConfirm } from "@/platform/ui_engine";
import { MOM_LIMITS } from "@/apps/studioflow/domain/mom";
import { versionLabel } from "@/apps/studioflow/domain/revisions";

import { createMomDocumentAction, deleteMomDocumentAction } from "../../../actions";
import { useCommand } from "../../../_components/use-command";

type MomSummary = {
  id: string;
  topic: string;
  meetingDate: string;
  venue: string | null;
  preparedByName: string;
  sectionCount: number;
  latestRevision: number | null;
  updatedAt: Date;
};

export function MomDocumentList({ projectId, documents, canEdit }: { projectId: string; documents: readonly MomSummary[]; canEdit: boolean }) {
  const router = useRouter();
  const { run, pendingKey, error } = useCommand();
  const confirm = useConfirm();
  const { locale, timezone } = useDisplaySettings();

  const [naming, setNaming] = useState(false);
  const [topic, setTopic] = useState("");

  const create = () =>
    run("create", () => createMomDocumentAction({ projectId, topic }), (data) => {
      setNaming(false);
      router.push(STUDIOFLOW_ROUTES.projectMomDocument(projectId, (data as { documentId: string }).documentId));
    });

  const remove = async (doc: MomSummary) => {
    const ok = await confirm.confirm({
      title: "Delete this MOM?",
      description: `"${doc.topic}" (${formatDateOnly(doc.meetingDate)}) with all its sections, notes, and photos will be deleted permanently.`,
      confirmLabel: "Delete MOM",
      tone: "danger",
    });
    if (ok) await run(doc.id, () => deleteMomDocumentAction({ projectId, documentId: doc.id }));
  };

  return (
    <div className="grid">
      {canEdit ? (
        <div className="flex items-center justify-between gap-3 border-b border-line-subtle px-(--ui-section-px) py-2.5">
          <Text tone="secondary" size="sm">A project can hold any number of MOM. Each one keeps its own revision history.</Text>
          <Button variant="primary" size="sm" leadingIcon={<FilePlus2 className="h-3.5 w-3.5" />} onClick={() => { setTopic(""); setNaming(true); }}>
            New MOM
          </Button>
        </div>
      ) : null}
      {error && !naming ? <InlineError className="px-(--ui-section-px) pt-2">{error}</InlineError> : null}
      {documents.length === 0 ? (
        <EmptyState title="No MOM yet" description={canEdit ? "Create the first meeting or site report for this project." : "Nobody has written a MOM for this project yet."} className="py-10" />
      ) : (
        <ul className="m-0 list-none divide-y divide-line-subtle p-0">
          {documents.map((doc) => (
            <li key={doc.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-(--ui-section-px) py-3 hover:bg-surface-muted">
              <div className="w-24 shrink-0 text-sm font-medium tabular-nums text-ink">{formatDateOnly(doc.meetingDate)}</div>
              <div className="grid min-w-0 flex-1 gap-0.5">
                <div className="flex min-w-0 items-center gap-2">
                  <Link prefetch={false} href={STUDIOFLOW_ROUTES.projectMomDocument(projectId, doc.id)} className="truncate font-medium text-ink hover:underline">
                    {doc.topic}
                  </Link>
                  <Badge className="shrink-0">{doc.latestRevision === null ? "Draft" : versionLabel(doc.latestRevision)}</Badge>
                </div>
                <Text tone="tertiary" size="sm" className="truncate">
                  {[doc.venue ?? "No venue", `${doc.sectionCount} section${doc.sectionCount === 1 ? "" : "s"}`, `by ${doc.preparedByName}`].join(" · ")}
                  {" · updated "}
                  <FormattedInstant value={doc.updatedAt} locale={locale} timeZone={timezone} style="datetime" />
                </Text>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Link
                  prefetch={false}
                  target="_blank"
                  href={STUDIOFLOW_ROUTES.projectMomPrint(projectId, doc.id)}
                  className="inline-flex items-center gap-1.5 rounded-control px-2 py-1 text-xs font-medium text-ink-secondary hover:bg-surface hover:text-ink"
                >
                  <Printer aria-hidden="true" className="h-3.5 w-3.5" /> Print
                </Link>
                {canEdit ? (
                  <RowActionMenu
                    label={`Actions for ${doc.topic}`}
                    items={[
                      { label: "Open", onSelect: () => router.push(STUDIOFLOW_ROUTES.projectMomDocument(projectId, doc.id)) },
                      { label: "Delete", danger: true, onSelect: () => void remove(doc), disabled: pendingKey === doc.id },
                    ]}
                  />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={naming}
        onOpenChange={setNaming}
        title="New MOM"
        description="Give it a title you will recognise in the list, for example “Site inspection – Level 2”."
        size="sm"
        dismissible={pendingKey !== "create"}
        footer={(
          <>
            <Button variant="ghost" onClick={() => setNaming(false)} disabled={pendingKey === "create"}>Cancel</Button>
            <Button variant="primary" type="submit" form="new-mom-form" pending={pendingKey === "create"} disabled={topic.trim().length === 0}>Create MOM</Button>
          </>
        )}
      >
        <form id="new-mom-form" className="grid gap-3" onSubmit={(event) => { event.preventDefault(); if (topic.trim().length > 0) void create(); }}>
          <Field label="Title" required>
            <Input id="new-mom-title" value={topic} onChange={(event) => setTopic(event.target.value)} maxLength={MOM_LIMITS.topic} autoFocus placeholder="Weekly meeting, site inspection…" />
          </Field>
          {error && naming ? <InlineError>{error}</InlineError> : null}
        </form>
      </Dialog>
      {confirm.dialog}
    </div>
  );
}
