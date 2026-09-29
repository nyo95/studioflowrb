"use client";

import { Download, Expand, MessageCircle, Send, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";

import { Button, EmptyState, Input, Text, Textarea } from "@/platform/ui_engine";
import {
  getUnreadMessengerCountAction,
  listMessengerConversationsAction,
  listMessengerPeopleAction,
  readMessengerConversationAction,
  resolveMessengerAttachmentAction,
  sendMessengerMessageAction,
} from "@/app/(platform)/messenger/actions";

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

const POLL_INTERVAL_MS = 60_000;

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
  const formRef = useRef<HTMLFormElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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
    refreshUnread();
    const interval = setInterval(refreshUnread, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
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
    const interval = setInterval(() => openConversation(activeId), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [activeId, open, openConversation]);

  const send = (formData: FormData) => {
    setError(null);
    if (activeId) formData.set("conversationId", activeId);
    else if (recipientId) formData.set("recipientUserId", recipientId);
    startTransition(async () => {
      const result = await sendMessengerMessageAction(formData);
      if (!result.ok) {
        setError(result.error.safeMessage);
        return;
      }
      formRef.current?.reset();
      setRecipientId("");
      openConversation(result.data.conversationId);
    });
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
        type="button"
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
        <aside className="fixed bottom-4 right-4 z-[70] grid h-[min(680px,calc(100dvh-32px))] w-[min(420px,calc(100vw-24px))] grid-rows-[auto_auto_1fr_auto] overflow-hidden rounded-control border border-line bg-surface-raised shadow-elevated">
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
                  <select value={recipientId} onChange={(event) => setRecipientId(event.target.value)} className="h-9 rounded-control border border-line bg-surface px-3 text-sm">
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
                    {message.body ? <Text as="p" size="sm">{message.body}</Text> : null}
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

          <form ref={formRef} action={send} className="grid gap-2 border-t border-line-subtle p-3">
            {error ? <Text size="sm" className="text-danger">{error}</Text> : null}
            <Textarea name="body" placeholder="Write a message..." rows={2} />
            <Input name="files" type="file" multiple />
            <Button type="submit" size="sm" variant="primary" pending={pending} disabled={!activeId && !recipientId}>
              <Send size={14} aria-hidden="true" />
              Send
            </Button>
          </form>
        </aside>,
        document.body,
      ) : null}
    </>
  );
}
