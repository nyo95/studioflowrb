"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { Plus } from "lucide-react";
import { Button, EmptyState, Field, InlineError, Input } from "@/platform/ui_engine";
import { PRESENTATION_ROUTES } from "../public";

import { createPresentationBoardAction } from "../actions";

type Board = { id: string; title: string; slideCount: number };

export function PresentationBoardList({ projectId, boards, canEdit }: { projectId: string; boards: Board[]; canEdit: boolean }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  const create = () => {
    if (submitting.current || !canEdit || !title.trim()) return;
    submitting.current = true;
    startTransition(async () => {
      setError(null);
      try {
        const result = await createPresentationBoardAction({ projectId, title: title.trim() });
        if (!result.ok) { setError(result.error.safeMessage); return; }
        router.push(PRESENTATION_ROUTES.board(projectId, result.data.boardId));
      } catch { setError("The board could not be created. Please try again."); }
      finally { submitting.current = false; }
    });
  };
  return (
    <div className="grid gap-4">
      {canEdit ? <div className="flex flex-wrap items-end gap-2"><Field label="New board"><Input value={title} disabled={pending} onChange={(event) => setTitle(event.target.value)} /></Field><Button disabled={!title.trim()} pending={pending} onClick={create}><Plus size={16} /> Create board</Button></div> : null}
      {error ? <InlineError>{error}</InlineError> : null}
      {boards.length === 0 ? <EmptyState title="No presentation boards" description="Create a board to gather render images and notes for this project." /> : (
        <div className="grid gap-2 sm:grid-cols-2">{boards.map((board) => <Link key={board.id} prefetch={false} href={PRESENTATION_ROUTES.board(projectId, board.id)} className="rounded-card border border-line p-3 hover:bg-surface-muted"><div className="font-semibold text-ink">{board.title}</div><div className="mt-1 text-sm text-ink-secondary">{board.slideCount} slide{board.slideCount === 1 ? "" : "s"}</div></Link>)}</div>
      )}
    </div>
  );
}
