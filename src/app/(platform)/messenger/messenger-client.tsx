"use client";

import { Download, Send } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { Button, EmptyState, Field, Input, SectionCard, Text, Textarea } from "@/platform/ui_engine";
import {
  listMessengerConversationsAction,
  listMessengerPeopleAction,
  readMessengerConversationAction,
  resolveMessengerAttachmentAction,
  sendMessengerMessageAction,
} from "./actions";

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

export function MessengerClient() {
  const [people, setPeople] = useState<Person[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [recipientId, setRecipientId] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

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
    void readMessengerConversationAction(conversationId).then((result) => {
      if (result.ok) {
        setMessages(result.data);
        loadConversations();
      } else {
        setError(result.error.safeMessage);
      }
    });
  }, [loadConversations]);

  useEffect(() => {
    loadPeople();
    loadConversations();
    const interval = setInterval(loadConversations, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [loadConversations, loadPeople]);

  useEffect(() => {
    if (!activeId) return;
    const interval = setInterval(() => openConversation(activeId), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [activeId, openConversation]);

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
    <div className="grid min-h-[560px] gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
      <SectionCard title="Conversations" padded={false}>
        <div className="grid gap-1 p-2">
          {conversations.length === 0 ? (
            <Text tone="tertiary" size="sm" className="px-2 py-4">No conversations yet.</Text>
          ) : conversations.map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              onClick={() => openConversation(conversation.id)}
              className={`grid gap-1 rounded-action border-0 px-2.5 py-2 text-left ${conversation.id === activeId ? "bg-surface-muted text-ink" : "bg-transparent text-ink hover:bg-surface-muted"}`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{conversation.otherUser.displayName}</span>
                {conversation.unread > 0 ? <span className="rounded-full bg-danger px-1.5 py-0.5 text-[10px] font-bold text-ink-inverse">{conversation.unread}</span> : null}
              </span>
              <span className="truncate text-xs text-ink-tertiary">{conversation.lastMessage || "Attachment"}</span>
            </button>
          ))}
        </div>
      </SectionCard>

      <SectionCard title={activeConversation ? activeConversation.otherUser.displayName : "New message"}>
        <div className="grid gap-4">
          {!activeId ? (
            <Field label="To">
              <select value={recipientId} onChange={(event) => setRecipientId(event.target.value)} className="h-9 rounded-control border border-line bg-surface px-3 text-sm">
                <option value="">Choose a person</option>
                {people.map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}
              </select>
            </Field>
          ) : null}

          <div className="min-h-[300px] max-h-[480px] overflow-auto rounded-control border border-line-subtle bg-surface p-3">
            {activeId && messages.length === 0 ? (
              <EmptyState title="No messages yet" description="Start the private conversation." />
            ) : !activeId ? (
              <EmptyState title="Choose a conversation" description="Open an existing conversation or choose a person to start one." />
            ) : (
              <div className="grid gap-3">
                {messages.map((message) => (
                  <div key={message.id} className="grid gap-1 rounded-control bg-surface-muted p-2.5">
                    <Text weight="semibold" size="sm">{message.authorName}</Text>
                    {message.body ? <Text as="p" size="sm">{message.body}</Text> : null}
                    {message.attachments.length ? (
                      <div className="grid gap-1">
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
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>

          {error ? <Text size="sm" className="text-danger">{error}</Text> : null}
          <form ref={formRef} action={send} className="grid gap-2">
            <Textarea name="body" placeholder="Write a message..." rows={3} />
            <Input name="files" type="file" multiple />
            <Button type="submit" variant="primary" pending={pending} disabled={!activeId && !recipientId}>
              <Send size={14} aria-hidden="true" />
              Send
            </Button>
          </form>
        </div>
      </SectionCard>
    </div>
  );
}
