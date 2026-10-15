"use client";

import { ImagePlus, Send, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { Button, Checkbox, IconButton, InlineError, RichTextEditor, Text, shrinkImageFile, useFileIntake, type RichTextEditorProps } from "@/platform/ui_engine";

import { phaseNoteAction, postPhaseImageAction } from "../actions";

/** Mirrors the server limits (WO-SF-NOTEFEED-01); the server stays the authority. */
export const NOTE_MAX = 4000;
const NOTE_IMAGE_BYTES = 3 * 1024 * 1024;
const NOTE_IMAGE_LIMIT = 12;
const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];

export type NoteImage = { id: string; url: string | null; contentType: string; bytes: number };

/**
 * Posts images to a phase's notes, each as its own element, one at a time so the order holds and each request stays
 * small. `answeredIterationId` makes them part of that iteration's recorded client answer. Returns the problems and
 * the files that did not get through, so only those are offered again (a retry never repeats a file already added).
 */
export async function uploadPhaseImages(input: { projectId: string; phaseId: string; clientFeedback: boolean; answeredIterationId?: string; replyToId?: string; tags?: readonly string[] }, files: readonly File[]): Promise<{ problems: string[]; failed: File[] }> {
  const problems: string[] = [];
  const failed: File[] = [];
  for (const file of files) {
    try {
      const prepared = await shrinkImageFile(file, { maxBytes: NOTE_IMAGE_BYTES });
      const form = new FormData();
      form.set("projectId", input.projectId);
      form.set("phaseId", input.phaseId);
      form.set("clientFeedback", String(input.clientFeedback));
      if (input.answeredIterationId) form.set("answeredIterationId", input.answeredIterationId);
      if (input.replyToId) form.set("replyToId", input.replyToId);
      if (input.tags?.length) form.set("tags", JSON.stringify(input.tags));
      form.set("file", prepared);
      const result = await postPhaseImageAction(form);
      if (!result.ok) { problems.push(result.error.safeMessage); failed.push(file); }
    } catch {
      problems.push(`${file.name || "An image"} could not be added.`);
      failed.push(file);
    }
  }
  return { problems, failed };
}

type Attachment = { file: File; url: string };

/**
 * Text and images a message is being written with, before it is sent. Images arrive by paste (Ctrl+V), drop, or
 * "Add images" and wait here as thumbnails until the message goes.
 */
export function useNoteDraft(disabled = false) {
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const urls = useRef<string[]>([]);
  useEffect(() => { urls.current = attachments.map((item) => item.url); }, [attachments]);
  useEffect(() => () => { for (const url of urls.current) URL.revokeObjectURL(url); }, []);

  const add = (files: File[], refused: File[] = []) => {
    const room = NOTE_IMAGE_LIMIT - attachments.length;
    const taken = files.slice(0, Math.max(0, room));
    setProblem(refused.length ? "Only PNG, JPEG or WebP images can be added." : files.length > taken.length ? `A note holds at most ${NOTE_IMAGE_LIMIT} images.` : null);
    if (taken.length) setAttachments((current) => [...current, ...taken.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
  };
  const remove = (index: number) => setAttachments((current) => {
    const gone = current[index];
    if (gone) URL.revokeObjectURL(gone.url);
    return current.filter((_, at) => at !== index);
  });
  const clear = () => {
    for (const item of attachments) URL.revokeObjectURL(item.url);
    setAttachments([]); setText(""); setProblem(null);
  };
  /** After a send: the text went, so it is cleared; only the images that did not get through stay. */
  const keepOnly = (files: readonly File[]) => {
    const kept = new Set(files);
    for (const item of attachments) if (!kept.has(item.file)) URL.revokeObjectURL(item.url);
    setAttachments((current) => current.filter((item) => kept.has(item.file))); setText(""); setProblem(null);
  };
  const intake = useFileIntake({ accept: ACCEPTED.join(","), multiple: true, disabled, onFiles: add });
  return { text, setText, files: attachments.map((item) => item.file), attachments, add, remove, clear, keepOnly, intake, problem, setProblem, empty: !text.trim() && attachments.length === 0 };
}

export type NoteDraft = ReturnType<typeof useNoteDraft>;

/** The editor, the waiting images and "Add images" of one draft. Paste or drop an image anywhere on it. */
export function NoteDraftFields({ draft, label, placeholder, disabled = false, autoFocus = false, onSubmit, footer, hint = "Or paste (Ctrl+V) or drop them here.", roundAttach = false, ...tokenProps }: { draft: NoteDraft; label: string; placeholder?: string; disabled?: boolean; autoFocus?: boolean; onSubmit?: () => void; footer?: ReactNode; hint?: ReactNode; roundAttach?: boolean } & Pick<RichTextEditorProps, "tokenTriggers" | "onTokenChange" | "highlightPattern" | "listboxId" | "activeOptionId">) {
  const pickerRef = useRef<HTMLInputElement>(null);
  return (
    <div className={`grid gap-2 rounded-control ${draft.intake.active ? "outline-2 outline-dashed outline-offset-4 outline-line-focus" : ""}`} {...draft.intake.target}>
      <RichTextEditor compact aria-label={label} placeholder={placeholder} maxLength={NOTE_MAX} value={draft.text} disabled={disabled} autoFocus={autoFocus} onChange={draft.setText} onSubmit={onSubmit} {...tokenProps} />
      {draft.attachments.length > 0 ? (
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0" aria-label="Images to send">
          {draft.attachments.map((item, index) => (
            <li key={item.url} className="relative">
              {/* A local preview of a file that has not been sent yet. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.url} alt="" className="h-14 w-14 rounded-control border border-line-subtle object-cover" />
              <IconButton size="sm" variant="secondary" label={`Remove image ${index + 1}`} icon={<X aria-hidden="true" />} disabled={disabled} onClick={() => draft.remove(index)} className="!absolute -right-1.5 -top-1.5 !h-6 !min-h-6 !w-6 rounded-full !p-0" />
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {roundAttach
            ? <IconButton type="button" variant="ghost" label="Add images" icon={<ImagePlus />} disabled={disabled || draft.attachments.length >= NOTE_IMAGE_LIMIT} onClick={() => pickerRef.current?.click()} className="!h-11 !min-h-11 !w-11 !rounded-full !p-0" />
            : <Button type="button" size="sm" variant="ghost" leadingIcon={<ImagePlus className="h-3.5 w-3.5" />} disabled={disabled || draft.attachments.length >= NOTE_IMAGE_LIMIT} onClick={() => pickerRef.current?.click()}>Add images</Button>}
          <input ref={pickerRef} type="file" accept={ACCEPTED.join(",")} multiple hidden onChange={(event) => { const files = Array.from(event.target.files ?? []); event.target.value = ""; draft.add(files.filter((file) => ACCEPTED.includes(file.type)), files.filter((file) => !ACCEPTED.includes(file.type))); }} />
          {hint ? <Text size="sm" tone="tertiary">{hint}</Text> : null}
        </div>
        {footer}
      </div>
      {draft.problem ? <InlineError>{draft.problem}</InlineError> : null}
    </div>
  );
}

/**
 * Write and send one message to a phase's notes, like a chat to yourself (owner, 2026-10-08). Enter sends,
 * Shift+Enter starts a new line; tick "Client feedback" when it is what the client said.
 */
export function NoteComposer({ projectId, phaseId, autoFocus = false, onSent }: { projectId: string; phaseId: string; autoFocus?: boolean; onSent?: () => void }) {
  const router = useRouter();
  const draft = useNoteDraft();
  const [clientFeedback, setClientFeedback] = useState(false);
  const [sending, setSending] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const send = async () => {
    if (sending || draft.empty) return;
    const body = draft.text.trim();
    const files = draft.files;
    setSending(true); setErrors([]);
    try {
      // The text is its own element, each image another one with the same labels.
      if (body) {
        const posted = await phaseNoteAction({ command: "post", projectId, phaseId, body, clientFeedback });
        if (!posted.ok) { setErrors([posted.error.safeMessage]); return; }
      }
      const { problems, failed } = await uploadPhaseImages({ projectId, phaseId, clientFeedback }, files);
      // Images that did not get through stay in the draft, so Send tries them again instead of losing them.
      draft.keepOnly(failed);
      if (failed.length === 0) setClientFeedback(false);
      setErrors(problems);
      router.refresh();
      if (failed.length === 0) onSent?.();
    } catch {
      setErrors(["The note could not be sent. Please try again."]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="grid gap-1.5">
      <NoteDraftFields
        draft={draft}
        label="New note"
        placeholder="Write a note…"
        disabled={sending}
        autoFocus={autoFocus}
        onSubmit={() => void send()}
        footer={
          <div className="flex items-center gap-3">
            <Checkbox label="Client feedback" checked={clientFeedback} disabled={sending} onCheckedChange={(value) => setClientFeedback(value === true)} />
            <Button type="button" size="sm" variant="primary" leadingIcon={<Send className="h-3.5 w-3.5" />} pending={sending} disabled={draft.empty} onClick={() => void send()}>Send</Button>
          </div>
        }
      />
      <Text size="sm" tone="tertiary">Enter sends · Shift+Enter new line</Text>
      {errors.length > 0 ? <InlineError>{errors.join(" ")}</InlineError> : null}
    </div>
  );
}
