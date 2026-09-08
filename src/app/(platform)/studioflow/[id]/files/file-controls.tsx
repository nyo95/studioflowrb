"use client";

import { useActionState } from "react";
import type { ActionResult } from "@platform/core/actions";
import { Button, Field, InlineError, Input, Select } from "@/platform/ui_engine";

import { linkFileAction, moveFileAction, recordFileAction, supersedeFileAction } from "./actions";

const INITIAL: ActionResult<void> | null = null;

const failureOf = (state: ActionResult<void> | null) =>
  state && !state.ok ? state.error.safeMessage : null;

export type FolderOption = { folder_key: string; name: string };

function FolderSelect({ folders, defaultValue }: { folders: FolderOption[]; defaultValue?: string }) {
  return (
    <Select name="folder_key" defaultValue={defaultValue ?? ""}>
      <option value="">Tray belum disortir</option>
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
      <Field label="Nama file asli" required>
        <Input name="original_filename" required maxLength={300} placeholder="Denah Lantai 1.pdf" />
      </Field>
      <Field label="Ukuran (bytes)" required>
        <Input name="bytes" type="number" min="1" required placeholder="2048000" />
      </Field>
      <Field label="Folder">
        <FolderSelect folders={folders} />
      </Field>
      <div className="sm:col-span-3">
        <Button type="submit" variant="primary" pending={pending}>Catat file</Button>
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
      <Field label="Nama file" required>
        <Input name="original_filename" required maxLength={300} placeholder="Render Ruang Tamu.jpg" />
      </Field>
      <Field label="Link" required>
        <Input name="external_url" type="url" required maxLength={2000} placeholder="https://drive.google.com/..." />
      </Field>
      <Field label="Folder">
        <FolderSelect folders={folders} />
      </Field>
      <div className="sm:col-span-3">
        <Button type="submit" variant="primary" pending={pending}>Simpan link</Button>
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
          <Button type="submit" size="sm" variant="ghost" pending={movePending}>Pindah</Button>
        </form>
        <form action={supAction}>
          <Button type="submit" size="sm" variant="ghost" pending={supPending}>Tandai diganti</Button>
        </form>
      </div>
      {failure ? <InlineError>{failure}</InlineError> : null}
    </div>
  );
}
