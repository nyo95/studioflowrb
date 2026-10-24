"use client";

import { Lock, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { ActionResult } from "@platform/core/actions";
import { Button, Combobox, IconButton, InlineError, Text, useConfirm } from "@/platform/ui_engine";

import { addBookMemberAction, removeBookMemberAction } from "../../../actions";

type Member = { userId: string; displayName: string; active: boolean };

/**
 * Who reads this project's book (WO-SF-BOOK-01, DESIGN.md §6.3: the book names its readers). A PIC invites and removes
 * people; a member sees the list; someone outside the book (a manager) is told what they still see.
 */
export function BookAccessBar({ projectId, designer, drafter, members, candidates, canRead, canManage }: {
  projectId: string;
  designer: string;
  drafter: string;
  members: readonly Member[];
  /** People who may write notes and are not yet in the book (PICs excluded). */
  candidates: ReadonlyArray<{ id: string; displayName: string }>;
  canRead: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [picked, setPicked] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!canRead) {
    return (
      <div className="flex shrink-0 items-center gap-2 rounded-card border border-line-subtle bg-surface px-4 py-2.5">
        <Lock className="size-(--ui-icon-sm) shrink-0 text-ink-tertiary" aria-hidden="true" />
        <Text size="sm" tone="secondary">This book is private to {designer}, {drafter} and the people they invite. You see the client&apos;s answers and site visits.</Text>
      </div>
    );
  }

  const run = async (key: string, action: () => Promise<ActionResult<unknown>>) => {
    setBusy(key);
    setError(null);
    const result = await action();
    setBusy(null);
    if (!result.ok) { setError(result.error.safeMessage); return false; }
    router.refresh();
    return true;
  };

  const invite = async () => {
    if (!picked) return;
    if (await run("add", () => addBookMemberAction({ projectId, userId: picked }))) setPicked("");
  };

  const remove = async (member: Member) => {
    const ok = await confirm.confirm({ title: `Remove ${member.displayName} from this book?`, description: "They lose the book and this project's page at once. Their notes stay.", confirmLabel: "Remove", tone: "danger" });
    if (ok) await run(member.userId, () => removeBookMemberAction({ projectId, userId: member.userId }));
  };

  return (
    <div className="flex shrink-0 flex-col gap-2 rounded-card border border-line-subtle bg-surface px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Lock className="size-(--ui-icon-sm) shrink-0 text-ink-tertiary" aria-hidden="true" />
        <Text size="sm" tone="secondary">Private book</Text>
        <ul className="m-0 flex list-none flex-wrap items-center gap-1.5 p-0" aria-label="Who can read this book">
          <li><span className="inline-flex h-7 items-center rounded-pill bg-surface-muted px-2.5 text-sm">{designer} <span className="ml-1 text-ink-tertiary">designer</span></span></li>
          <li><span className="inline-flex h-7 items-center rounded-pill bg-surface-muted px-2.5 text-sm">{drafter} <span className="ml-1 text-ink-tertiary">drafter</span></span></li>
          {members.map((member) => (
            <li key={member.userId}>
              <span className={`inline-flex h-7 items-center gap-1 rounded-pill border border-line-subtle pl-2.5 text-sm ${canManage ? "pr-0.5" : "pr-2.5"} ${member.active ? "" : "text-ink-tertiary"}`}>
                {member.displayName}
                {canManage ? <IconButton size="sm" variant="ghost" className="!h-6 !w-6 rounded-pill" label={`Remove ${member.displayName}`} icon={<X aria-hidden="true" />} pending={busy === member.userId} onClick={() => void remove(member)} /> : null}
              </span>
            </li>
          ))}
        </ul>
        {canManage && candidates.length > 0 ? (
          <div className="ml-auto flex items-center gap-2">
            <Combobox
              label="Invite to this book"
              placeholder="Invite someone…"
              searchPlaceholder="Search people"
              emptyLabel="Nobody else can be invited"
              options={candidates.map((person) => ({ id: person.id, label: person.displayName }))}
              value={picked}
              onValueChange={setPicked}
              className="w-56"
            />
            <Button size="sm" variant="primary" disabled={!picked} pending={busy === "add"} onClick={() => void invite()}>Invite</Button>
          </div>
        ) : null}
      </div>
      {error ? <InlineError>{error}</InlineError> : null}
      {confirm.dialog}
    </div>
  );
}
