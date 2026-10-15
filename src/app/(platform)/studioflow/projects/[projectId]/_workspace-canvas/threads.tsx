"use client";

import { MessageSquare, X } from "lucide-react";
import { useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";

import { Drawer, IconButton, shrinkImageFile } from "@/platform/ui_engine";

import { postThreadImageAction, threadCommandAction, type ThreadCommandInput } from "../../../actions";
import { NOTE_IMAGE_BYTES } from "../../../_components/phase-note-composer";
import { NotesChat, type ChatNote, type ChatPhase, type NotePoster } from "../_notes-stream/notes-chat";

/** A board thread as the board reads it (WO-SF-BOARD-THREADS-01). */
export type BoardThread = {
  id: string;
  version: number;
  x: number;
  y: number;
  anchorCardId: string | null;
  offsetX: number | null;
  offsetY: number | null;
  messageCount: number;
  clientFeedback: boolean;
};
export type ThreadSpec = Extract<ThreadCommandInput, { command: "post" }>["thread"];
/** The thread window: an existing thread, or a new one that exists once its first message is sent. */
export type OpenThread = { key: string; spec: ThreadSpec; title: string; world: { x: number; y: number } };

/** What the board needs to show a Notes chat for a thread. */
export type ThreadChatProps = {
  projectId: string;
  projectName: string;
  phases: readonly ChatPhase[];
  writablePhaseIds: readonly string[];
  canEditGeneral: boolean;
  defaultPhaseId: string | null;
  canUseIdeas: boolean;
  canUsePresentation: boolean;
};

const EMPTY = { notes: [] as readonly ChatNote[], cursor: null };

/** Sends to a thread; the first message creates it, and later messages (and the images of the same send) join it. */
type ThreadBox = { spec: ThreadSpec; onCreated: (threadId: string) => void };
function threadPoster(projectId: string, box: ThreadBox): NotePoster {
  const joined = (threadId: string) => {
    if ("threadId" in box.spec) return;
    box.spec = { threadId };
    box.onCreated(threadId);
  };
  return {
    text: async (input) => {
      const result = await threadCommandAction({ command: "post", projectId, thread: box.spec, ...input });
      if (!result.ok) return { ok: false, message: result.error.safeMessage };
      joined(result.data.threadId);
      return { ok: true };
    },
    images: async (input, files) => {
      const problems: string[] = [];
      const failed: File[] = [];
      for (const file of files) {
        try {
          const prepared = await shrinkImageFile(file, { maxBytes: NOTE_IMAGE_BYTES });
          const form = new FormData();
          form.set("projectId", projectId);
          form.set("phaseId", input.phaseId);
          form.set("clientFeedback", String(input.clientFeedback));
          for (const [name, value] of Object.entries(box.spec)) form.set(name, String(value));
          if (input.replyToId) form.set("replyToId", input.replyToId);
          if (input.tags.length) form.set("tags", JSON.stringify(input.tags));
          form.set("file", prepared);
          const result = await postThreadImageAction(form);
          if (!result.ok) { problems.push(result.error.safeMessage); failed.push(file); continue; }
          joined(result.data.threadId);
        } catch {
          problems.push(`${file.name || "An image"} could not be added.`);
          failed.push(file);
        }
      }
      return { problems, failed };
    },
  };
}

/** The small chat window that opens where the board was double-clicked, or from a marker. */
export function ThreadWindow({ open, chat, style, onClose, onCreated }: {
  open: OpenThread;
  chat: ThreadChatProps;
  style: CSSProperties;
  onClose: () => void;
  onCreated: (threadId: string) => void;
}) {
  // One mutable box per window (keyed by thread): the first message turns the new spot into its thread id.
  // `onCreated` is read once: the board passes one that only uses functional state updates.
  const [box] = useState<ThreadBox>(() => ({ spec: open.spec, onCreated }));
  const [poster] = useState(() => threadPoster(chat.projectId, box));
  const canWrite = chat.writablePhaseIds.length > 0;
  return (
    <div
      data-board-ui=""
      role="dialog"
      aria-label={open.title}
      style={style}
      onKeyDown={(event: KeyboardEvent) => { if (event.key === "Escape" && !event.defaultPrevented) { event.stopPropagation(); onClose(); } }}
      className="absolute z-30 flex h-[440px] max-h-[calc(100%-16px)] w-[380px] max-w-[calc(100%-16px)] flex-col overflow-hidden rounded-card bg-surface shadow-over"
    >
      <NotesChat
        {...chat}
        initial={EMPTY}
        scopeOf={() => ({ threadId: "threadId" in box.spec ? box.spec.threadId : null })}
        poster={poster}
        composer={canWrite}
        emptyText={canWrite ? "Write the first note here. It stays on this spot of the board." : "No notes here yet."}
        header={(
          <div className="flex shrink-0 items-center gap-2 border-b border-line-subtle py-1.5 pl-4 pr-1.5">
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{open.title}</span>
            <IconButton variant="ghost" label="Close" icon={<X aria-hidden="true" />} onClick={onClose} className="!h-11 !min-h-11 !w-11" />
          </div>
        )}
      />
    </div>
  );
}

/** The speech-bubble marker a thread leaves on the board: its message count, amber when it holds client feedback. */
export function ThreadMarker({ thread, x, y, active, movable, onOpen, onMoveStart }: {
  thread: BoardThread;
  x: number;
  y: number;
  active: boolean;
  movable: boolean;
  onOpen: () => void;
  onMoveStart?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  const count = thread.messageCount;
  return (
    <button
      type="button"
      data-board-ui=""
      aria-label={`${count} note${count === 1 ? "" : "s"}${thread.clientFeedback ? ", with client feedback" : ""}`}
      aria-expanded={active}
      onPointerDown={movable ? onMoveStart : (event) => event.stopPropagation()}
      onClick={onOpen}
      style={{ left: x, top: y }}
      className={`absolute z-20 flex h-7 -translate-y-full items-center gap-1 rounded-[14px_14px_14px_4px] px-2.5 text-xs font-semibold shadow-float before:absolute before:-inset-2 ${thread.clientFeedback ? "bg-warning text-ink-inverse" : "bg-action text-action-ink"} ${active ? "outline outline-2 outline-offset-2 outline-line-focus" : ""} ${movable ? "cursor-grab active:cursor-grabbing" : ""}`}
    >
      <MessageSquare aria-hidden="true" className="h-3 w-3" strokeWidth={2.4} />{count}
    </button>
  );
}

/** "All notes": every board thread's messages as one stream; a message can show its thread on the board. */
export function AllThreadNotes({ open, onOpenChange, chat, onLocate }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chat: ThreadChatProps;
  onLocate?: (note: ChatNote) => void;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} title="All board notes" description="Every note written on this board, newest at the bottom." size="md">
      <div className="flex h-[70vh] min-h-0 flex-col">
        {open ? <NotesChat {...chat} initial={EMPTY} scopeOf={() => ({ inThreads: true })} composer={false} header={<></>} emptyText="No notes on the board yet. Double-click the board to write one." onLocate={onLocate} /> : null}
      </div>
    </Drawer>
  );
}
