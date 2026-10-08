"use client";

import { Download, Expand, MessageCircle, Plus, Send, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import type { ChangeEvent, FormEvent, KeyboardEvent } from "react";
import { createPortal } from "react-dom";

import { EmptyState, IconButton, Text, Textarea, useFileIntake } from "@/platform/ui_engine";
import {
  getUnreadMessengerCountAction,
  listMessengerConversationsAction,
  listMessengerPeopleAction,
  readMessengerConversationAction,
  resolveMessengerAttachmentAction,
  sendMessengerMessageAction,
} from "@/app/(platform)/messenger/actions";

import { continueList, insertNewline, mergeFiles, QUICK_MESSENGER_MAX_FILES } from "./quick-messenger-composer";

type Person = { id: string; displayName: string };
type Conversation = {
  id: string;
  otherUser: { id: string; displayName: string; active: boolean };
  lastMessage: string;
  lastMessageAt: Date | null;
  unread: number;
};
type Message = {
  id: string;
  authorUserId: string;
  authorName: string;
  body: string | null;
  createdAt: Date;
  attachments: Array<{ id: string; filename: string; bytes: number; available: boolean; readUrl: string | null }>;
};
type Draft = { text: string; files: File[] };

const POLL_INTERVAL_MS = 60_000;
const NEW_DRAFT_KEY = "new";
const EMPTY_DRAFT: Draft = { text: "", files: [] };
const DRAFT_STORAGE_KEY = "quick-messenger:drafts:v1";
const MAX_COMPOSER_HEIGHT_PX = 120;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function QuickMessenger() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [people, setPeople] = useState<Person[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [recipientId, setRecipientId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [draftsLoaded, setDraftsLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const recipientRef = useRef<HTMLSelectElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sendingRef = useRef(false);
  const pendingCaretRef = useRef<number | null>(null);

  const draftKey = activeId ?? NEW_DRAFT_KEY;
  const draft = drafts[draftKey] ?? EMPTY_DRAFT;
  const canSend = (draft.text.trim() !== "" || draft.files.length > 0) && Boolean(activeId || recipientId);

  const updateDraft = useCallback((key: string, change: (current: Draft) => Draft) => {
    setDrafts((current) => ({ ...current, [key]: change(current[key] ?? EMPTY_DRAFT) }));
  }, []);

  const refreshUnread = useCallback(() => {
    void getUnreadMessengerCountAction().then((result) => {
      if (result.ok) setUnread(result.data.unread);
    });
  }, []);

  const loadConversations = useCallback(() => {
    void listMessengerConversationsAction().then((result) => {
      if (result.ok) setConversations(result.data);
    });
  }, []);

  const loadPeople = useCallback(() => {
    void listMessengerPeopleAction().then((result) => {
      if (result.ok) setPeople(result.data);
    });
  }, []);

  const openConversation = useCallback((conversationId: string) => {
    setActiveId(conversationId);
    setRecipientId("");
    setError(null);
    void readMessengerConversationAction(conversationId).then((result) => {
      if (result.ok) {
        setMessages(result.data);
        refreshUnread();
        loadConversations();
        requestAnimationFrame(() => {
          if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        });
      } else {
        setError(result.error.safeMessage);
      }
    });
  }, [loadConversations, refreshUnread]);

  useEffect(() => {
    // The route effect below makes the first load's request; this one only keeps the minute timer.
    // A background tab does not need fresh counts; catch up as soon as it is visible again.
    const tick = () => { if (document.visibilityState === "visible") refreshUnread(); };
    const interval = setInterval(tick, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(interval); document.removeEventListener("visibilitychange", tick); };
  }, [refreshUnread]);

  useEffect(() => {
    refreshUnread();
  }, [pathname, refreshUnread]);

  useEffect(() => {
    if (!open) return;
    loadPeople();
    loadConversations();
  }, [loadConversations, loadPeople, open]);

  useEffect(() => {
    if (!open || !activeId) return;
    const interval = setInterval(() => { if (document.visibilityState === "visible") openConversation(activeId); }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [activeId, open, openConversation]);

  // Text drafts also survive a page reload within the tab; picked files cannot
  // be serialised, so they live in memory for as long as the shell stays mounted.
  useEffect(() => {
    try {
      const stored = JSON.parse(window.sessionStorage.getItem(DRAFT_STORAGE_KEY) ?? "{}") as Record<string, unknown>;
      const restored: Record<string, Draft> = {};
      for (const [key, value] of Object.entries(stored)) {
        if (typeof value === "string" && value !== "") restored[key] = { text: value, files: [] };
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage exists only in the browser, so it cannot be read during render
      setDrafts((current) => ({ ...restored, ...current }));
    } catch {
      // Storage can be blocked; the in-memory draft still works.
    }
    setDraftsLoaded(true);
  }, []);

  useEffect(() => {
    if (!draftsLoaded) return;
    try {
      const texts: Record<string, string> = {};
      for (const [key, value] of Object.entries(drafts)) if (value.text !== "") texts[key] = value.text;
      window.sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(texts));
    } catch {
      // Ignore blocked storage.
    }
  }, [drafts, draftsLoaded]);

  // Collapse on a press or focus landing outside the popup, and on Escape.
  // The toggle button is exempt so its own click still toggles cleanly.
  useEffect(() => {
    if (!open) return;
    const isInside = (target: EventTarget | null) =>
      target instanceof Node && Boolean(panelRef.current?.contains(target) || toggleRef.current?.contains(target));
    const onPointerDown = (event: PointerEvent) => {
      if (!isInside(event.target)) setOpen(false);
    };
    const onFocusIn = (event: FocusEvent) => {
      if (!isInside(event.target)) setOpen(false);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) return;
      setOpen(false);
      toggleRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Land the caret where the user will type: the composer, or the recipient
  // picker when no conversation is chosen yet.
  useEffect(() => {
    if (!open) return;
    (activeId ? composerRef.current : recipientRef.current)?.focus();
  }, [open, activeId]);

  // Grow with the text up to a cap, and restore the caret after a scripted edit.
  useLayoutEffect(() => {
    const element = composerRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, MAX_COMPOSER_HEIGHT_PX)}px`;
    if (pendingCaretRef.current !== null) {
      element.setSelectionRange(pendingCaretRef.current, pendingCaretRef.current);
      pendingCaretRef.current = null;
    }
  }, [draft.text, open, activeId]);

  const send = () => {
    if (sendingRef.current || !canSend) return;
    sendingRef.current = true;
    setError(null);
    const key = draftKey;
    const formData = new FormData();
    formData.set("body", draft.text);
    for (const file of draft.files) formData.append("files", file);
    if (activeId) formData.set("conversationId", activeId);
    else formData.set("recipientUserId", recipientId);
    startTransition(async () => {
      try {
        const result = await sendMessengerMessageAction(formData);
        if (!result.ok) {
          setError(result.error.safeMessage);
          return;
        }
        updateDraft(key, () => EMPTY_DRAFT);
        setRecipientId("");
        openConversation(result.data.conversationId);
      } catch {
        setError("The message could not be sent. Check your connection and try again.");
      } finally {
        sendingRef.current = false;
      }
    });
  };

  const addFiles = (incoming: File[]) => {
    if (incoming.length === 0) return;
    const selection = mergeFiles(draft.files, incoming);
    updateDraft(draftKey, (current) => ({ ...current, files: selection.files }));
    setError(selection.error);
  };

  const removeFile = (index: number) => {
    setError(null);
    updateDraft(draftKey, (current) => ({ ...current, files: current.files.filter((_, at) => at !== index) }));
  };

  const applyEdit = (edit: { value: string; caret: number }) => {
    pendingCaretRef.current = edit.caret;
    updateDraft(draftKey, (current) => ({ ...current, text: edit.value }));
  };

  const onComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter") return;
    // Enter that confirms an IME candidate must never send.
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    const { value, selectionStart, selectionEnd } = event.currentTarget;
    if (event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      applyEdit(insertNewline(value, selectionStart, selectionEnd));
      return;
    }
    if (event.shiftKey) return; // the browser inserts the newline itself
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      send();
      return;
    }
    const edit = continueList(value, selectionStart, selectionEnd);
    if (edit) applyEdit(edit);
    else send();
  };

  const onFilesPicked = (event: ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  };

  // Any file type may be attached; the composer's own limits are applied by `addFiles`.
  const intake = useFileIntake({ multiple: true, onFiles: (files) => addFiles(files) });
  const dragging = intake.active;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    send();
  };

  const openAttachment = (attachmentId: string) => {
    void resolveMessengerAttachmentAction(attachmentId).then((result) => {
      if (!result.ok) {
        setError(result.error.safeMessage);
        return;
      }
      window.open(result.data.readUrl, "_blank", "noopener,noreferrer");
    });
  };

  const activeConversation = conversations.find((conversation) => conversation.id === activeId) ?? null;

  return (
    <>
      <button
        ref={toggleRef}
        type="button"
        aria-expanded={open}
        aria-label={unread > 0 ? `Messenger, ${unread} unread` : "Messenger"}
        onClick={() => setOpen((value) => !value)}
        className="relative grid h-6 w-6 shrink-0 place-items-center rounded-full border-0 bg-transparent text-ink-tertiary transition-colors hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-focus"
      >
        <MessageCircle size={14} aria-hidden="true" />
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-danger px-[3px] text-[9px] font-bold leading-none text-ink-inverse">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>
      {/* Portalled to the body on purpose. The top bar carries
          `backdrop-blur-[12px]`, and a backdrop-filter makes its element the
          containing block for every `position: fixed` descendant — so rendered
          in place, this panel anchored `bottom-4 right-4` of a 46px-tall header
          and landed off the top of the screen instead of above the bottom-right
          corner of the viewport. */}
      {open ? createPortal(
        <aside ref={panelRef} aria-label="Quick message" className="fixed bottom-4 right-4 z-[70] grid h-[min(680px,calc(100dvh-32px))] w-[min(420px,calc(100vw-24px))] grid-rows-[auto_auto_1fr_auto] overflow-hidden rounded-control border border-line bg-surface-raised shadow-elevated">
          <div className="flex items-center gap-2 border-b border-line-subtle px-3 py-2">
            <MessageCircle size={16} aria-hidden="true" />
            <Text weight="semibold" size="sm" className="min-w-0 flex-1 truncate">
              {activeConversation ? activeConversation.otherUser.displayName : "Quick message"}
              {activeConversation && !activeConversation.otherUser.active ? <span className="ml-1.5 text-[10px] font-normal text-ink-tertiary">(Deactivated)</span> : null}
            </Text>
            <Link href="/messenger" className="grid h-7 w-7 place-items-center rounded-action text-ink-tertiary hover:bg-surface-muted hover:text-ink" aria-label="Open full messenger">
              <Expand size={14} aria-hidden="true" />
            </Link>
            <button type="button" onClick={() => setOpen(false)} className="grid h-7 w-7 place-items-center rounded-action border-0 bg-transparent text-ink-tertiary hover:bg-surface-muted hover:text-ink" aria-label="Close messenger">
              <X size={14} aria-hidden="true" />
            </button>
          </div>

          <div className="flex gap-1 overflow-x-auto border-b border-line-subtle p-2">
            <button
              type="button"
              onClick={() => { setActiveId(null); setMessages([]); }}
              className={`shrink-0 rounded-action px-2 py-1 text-xs ${!activeId ? "bg-surface-muted text-ink" : "text-ink-secondary hover:bg-surface-muted"}`}
            >
              New
            </button>
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => openConversation(conversation.id)}
                className={`flex max-w-36 shrink-0 items-center gap-1 rounded-action px-2 py-1 text-xs ${conversation.id === activeId ? "bg-surface-muted text-ink" : "text-ink-secondary hover:bg-surface-muted"}`}
              >
                {!conversation.otherUser.active ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ink-tertiary" aria-hidden="true" /> : null}
                <span className="truncate" title={conversation.otherUser.active ? undefined : "This person's account is deactivated"}>{conversation.otherUser.displayName}</span>
                {conversation.unread > 0 ? <span className="rounded-full bg-danger px-1 text-[9px] font-bold text-ink-inverse">{conversation.unread}</span> : null}
              </button>
            ))}
          </div>

          <div ref={scrollRef} className="overflow-auto p-3">
            {!activeId ? (
              <div className="grid gap-3">
                <label className="grid gap-1 text-sm">
                  <span className="font-medium text-ink">To</span>
                  <select ref={recipientRef} value={recipientId} onChange={(event) => setRecipientId(event.target.value)} className="h-9 rounded-control border border-line bg-surface px-3 text-sm">
                    <option value="">Choose a person</option>
                    {people.map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}
                  </select>
                </label>
                <EmptyState title="Start a private message" description="Pick one person, write a short message, and send." />
              </div>
            ) : messages.length === 0 ? (
              <EmptyState title="No messages yet" description="Start the private conversation." />
            ) : (
              <div className="grid gap-2">
                {messages.map((message) => (
                  <div key={message.id} className="grid gap-1 rounded-control bg-surface-muted p-2.5">
                    <Text weight="semibold" size="sm">{message.authorName}</Text>
                    {message.body ? <Text as="p" size="sm" className="whitespace-pre-wrap break-words">{message.body}</Text> : null}
                    {message.attachments.map((attachment) => (
                      <button
                        key={attachment.id}
                        type="button"
                        disabled={!attachment.available}
                        onClick={() => openAttachment(attachment.id)}
                        className="inline-flex w-fit items-center gap-1.5 rounded-action border border-line bg-surface px-2 py-1 text-xs text-ink disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Download size={14} aria-hidden="true" />
                        {attachment.filename} · {formatBytes(attachment.bytes)}
                        {!attachment.available ? " · expired" : ""}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          <form
            onSubmit={onSubmit}
            onDragEnter={intake.target.onDragEnter}
            onDragOver={intake.target.onDragOver}
            onDragLeave={intake.target.onDragLeave}
            onDrop={intake.target.onDrop}
            className={`grid gap-1.5 border-t p-3 transition-colors ${dragging ? "border-line-focus bg-surface-muted" : "border-line-subtle"}`}
          >
            {error ? <Text size="sm" className="text-danger" role="alert">{error}</Text> : null}
            {draft.files.length > 0 ? (
              <ul className="m-0 flex list-none flex-wrap gap-1 p-0" aria-label="Attached files">
                {draft.files.map((file, index) => (
                  <li key={`${file.name}-${file.size}-${index}`} className="flex max-w-full items-center gap-1 rounded-action border border-line bg-surface py-0.5 pl-2 pr-0.5 text-xs text-ink">
                    <span className="min-w-0 truncate">{file.name} · {formatBytes(file.size)}</span>
                    <button type="button" onClick={() => removeFile(index)} aria-label={`Remove ${file.name}`} className="grid h-5 w-5 shrink-0 place-items-center rounded-action border-0 bg-transparent text-ink-tertiary hover:bg-surface-muted hover:text-ink">
                      <X size={12} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className={`flex items-end gap-1 rounded-control border bg-surface p-1 transition-[border-color,box-shadow] focus-within:border-line-focus focus-within:shadow-[0_0_0_3px_rgb(87_83_78/0.12)] ${dragging ? "border-dashed border-line-focus" : "border-line"}`}>
              <IconButton
                label="Attach files"
                icon={<Plus aria-hidden="true" />}
                variant="ghost"
                size="sm"
                disabled={draft.files.length >= QUICK_MESSENGER_MAX_FILES}
                onClick={() => fileInputRef.current?.click()}
              />
              <input ref={fileInputRef} type="file" multiple hidden tabIndex={-1} onChange={onFilesPicked} />
              <Textarea
                ref={composerRef}
                density="compact"
                rows={1}
                value={draft.text}
                onChange={(event) => updateDraft(draftKey, (current) => ({ ...current, text: event.target.value }))}
                onKeyDown={onComposerKeyDown}
                onPaste={intake.target.onPaste}
                placeholder={dragging ? "Drop files to attach" : "Write a message..."}
                aria-label="Message"
                aria-describedby="quick-messenger-hint"
                className="!min-h-7 !resize-none !border-0 !bg-transparent !py-1 focus:!shadow-none"
              />
              <IconButton
                label="Send message"
                icon={<Send aria-hidden="true" />}
                variant="primary"
                size="sm"
                type="submit"
                pending={pending}
                disabled={!canSend}
              />
            </div>
            <p id="quick-messenger-hint" className="m-0 text-[10px] text-ink-tertiary">
              Enter sends · Shift+Enter new line · Ctrl+Enter sends a list · 5 files, 10 MB
            </p>
          </form>
        </aside>,
        document.body,
      ) : null}
    </>
  );
}
