"use client";

import { useActionState, useState } from "react";
import type { ActionResult } from "@platform/core/actions";
import { Button, Field, FileDropZone, InlineError, Input, Select } from "@/platform/ui_engine";

import { linkFileAction, moveFileAction, recordFileAction, supersedeFileAction } from "./actions";

const INITIAL: ActionResult<void> | null = null;

const failureOf = (state: ActionResult<void> | null) =>
  state?.ok === false ? state.error.safeMessage : null;

export type FolderOption = { folder_key: string; name: string };

export function DeliverableForm({ projectId, folders }: { projectId: string; folders: FolderOption[] }) {
  const [mode, setMode] = useState<"record" | "link">("record");
  const [filename, setFilename] = useState("");
  const [bytes, setBytes] = useState("");
  const [recordState, recordAction, recordPending] = useActionState(recordFileAction.bind(null, projectId), INITIAL);
  const [linkState, linkAction, linkPending] = useActionState(linkFileAction.bind(null, projectId), INITIAL);
  const state = mode === "record" ? recordState : linkState;
  const failure = failureOf(state);
  const pending = recordPending || linkPending;

  return (
    <form action={mode === "record" ? recordAction : linkAction} className="grid gap-3 sm:grid-cols-3">
      {failure ? <div className="sm:col-span-3"><InlineError>{failure}</InlineError></div> : null}
      <Field label="File deliverable" required>
        {/* Drop interaction, the accept filter, and the keyboard picker belong
            to the shared zone. What a dropped file means here — filename plus
            byte count, never the bytes — stays this app's decision. */}
        <FileDropZone
          label="File deliverable"
          hint="File bytes are not uploaded or stored by the application."
          browseLabel="Choose file"
          onFiles={(files) => {
            const [file] = files;
            if (!file) return;
            setFilename(file.name);
            setBytes(String(file.size));
          }}
        >
          <Input name="original_filename" value={filename} onChange={(event) => setFilename(event.target.value)} required maxLength={300} placeholder="Drop a file here or type its name" />
        </FileDropZone>
      </Field>
      <Field label="Storage method">
        <Select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}>
          <option value="record">File on PC (record metadata)</option>
          <option value="link">External file link</option>
        </Select>
      </Field>
      {mode === "record" ? (
        <Field label="Size (bytes)" required>
          <Input name="bytes" type="number" min="1" value={bytes} onChange={(event) => setBytes(event.target.value)} required placeholder="2048000" />
        </Field>
      ) : (
        <Field label="Link" required>
          <Input name="external_url" type="url" required maxLength={2000} placeholder="https://drive.google.com/..." />
        </Field>
      )}
      <Field label="Output folder">
        <FolderSelect folders={folders} />
      </Field>
      <div className="sm:col-span-3">
        <Button type="submit" variant="primary" pending={pending}>Save deliverable</Button>
      </div>
    </form>
  );
}

function FolderSelect({ folders, defaultValue }: { folders: FolderOption[]; defaultValue?: string }) {
  return (
    <Select name="folder_key" defaultValue={defaultValue ?? ""}>
      <option value="">Unsorted tray</option>
      {folders.map((folder) => (
        <option key={folder.folder_key} value={folder.folder_key}>{folder.name}</option>
      ))}
    </Select>
  );
}

// ── Record a RECORDED file (metadata only) ───────────────────────────────────

export function RecordFileForm({ projectId, folders }: { projectId: string; folders: FolderOption[] }) {
  const [state, formAction, pending] = useActionState(recordFileAction.bind(null, projectId), INITIAL);
  const failure = failureOf(state);

  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-3">
      {failure ? <div className="sm:col-span-3"><InlineError>{failure}</InlineError></div> : null}
      <Field label="Original file name" required>
        <Input name="original_filename" required maxLength={300} placeholder="Denah Lantai 1.pdf" />
      </Field>
      <Field label="Size (bytes)" required>
        <Input name="bytes" type="number" min="1" required placeholder="2048000" />
      </Field>
      <Field label="Folder">
        <FolderSelect folders={folders} />
      </Field>
      <div className="sm:col-span-3">
        <Button type="submit" variant="primary" pending={pending}>Record file</Button>
      </div>
    </form>
  );
}

// ── Link an external file (LINKED) ───────────────────────────────────────────

export function LinkFileForm({ projectId, folders }: { projectId: string; folders: FolderOption[] }) {
  const [state, formAction, pending] = useActionState(linkFileAction.bind(null, projectId), INITIAL);
  const failure = failureOf(state);

  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-3">
      {failure ? <div className="sm:col-span-3"><InlineError>{failure}</InlineError></div> : null}
      <Field label="File name" required>
        <Input name="original_filename" required maxLength={300} placeholder="Render Ruang Tamu.jpg" />
      </Field>
      <Field label="Link" required>
        <Input name="external_url" type="url" required maxLength={2000} placeholder="https://drive.google.com/..." />
      </Field>
      <Field label="Folder">
        <FolderSelect folders={folders} />
      </Field>
      <div className="sm:col-span-3">
        <Button type="submit" variant="primary" pending={pending}>Save link</Button>
      </div>
    </form>
  );
}

// ── Per-file row controls ────────────────────────────────────────────────────

export function FileRowControls({
  fileId,
  projectId,
  folders,
  currentFolder,
  canManage,
  frozen,
}: {
  fileId: string;
  projectId: string;
  folders: FolderOption[];
  currentFolder: string | null;
  canManage: boolean;
  frozen: boolean;
}) {
  const [moveState, moveAction, movePending] = useActionState(
    moveFileAction.bind(null, fileId, projectId),
    INITIAL,
  );
  const [supState, supAction, supPending] = useActionState(
    supersedeFileAction.bind(null, fileId, projectId),
    INITIAL,
  );
  const failure = failureOf(moveState) ?? failureOf(supState);

  if (!canManage || frozen) return null;

  return (
    <div className="grid gap-1">
      <div className="flex items-center gap-2">
        <form action={moveAction} className="flex items-center gap-1">
          <FolderSelect folders={folders} defaultValue={currentFolder ?? ""} />
          <Button type="submit" size="sm" variant="ghost" pending={movePending}>Move</Button>
        </form>
        <form action={supAction}>
          <Button type="submit" size="sm" variant="ghost" pending={supPending}>Mark superseded</Button>
        </form>
      </div>
      {failure ? <InlineError>{failure}</InlineError> : null}
    </div>
  );
}
