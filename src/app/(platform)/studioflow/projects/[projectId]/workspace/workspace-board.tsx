"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ArrowDown, ArrowUp, Pin, Plus, Trash2 } from "lucide-react";
import { Button, EmptyState, Field, InlineError, Input, SectionCard, Select, Textarea } from "@/platform/ui_engine";
import { STUDIOFLOW_ROUTES } from "@/apps/studioflow/public/nav";

import { workspaceAction, type WorkspaceCommandInput } from "../../../actions";

type Card = { id: string; version: number; body: string; pinned: boolean; origin: string; phaseId: string | null; phaseName: string | null; iterationLabel: string | null; authorName: string | null; imageCount: number };
type Section = { id: string; title: string; version: number; cards: Card[] };
type Phase = { id: string; name: string };

const ORIGIN_LABEL: Record<string, string | null> = { NOTE: null, CLIENT_ANSWER: "Client answer", SITE_VISIT: "Site visit" };

/**
 * Minimal functional wiring for the Workspace backend (WO-SF-WORKSPACE-01): plain controls to exercise every command.
 * The Lead replaces this screen with the final Workspace UI in the next revision.
 */
export function WorkspaceBoard({ projectId, sections, phases, phaseFilter, canEdit }: { projectId: string; sections: Section[]; phases: Phase[]; phaseFilter: string | null; canEdit: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [newSection, setNewSection] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const run = (input: WorkspaceCommandInput, after?: () => void) => startTransition(async () => {
    setError(null);
    const result = await workspaceAction(input);
    if (!result.ok) { setError(result.error.safeMessage); return; }
    after?.();
    router.refresh();
  });

  const sectionIds = sections.map((section) => section.id);
  const moveSection = (index: number, direction: -1 | 1) => {
    const ids = [...sectionIds]; const next = index + direction; if (next < 0 || next >= ids.length) return;
    [ids[index], ids[next]] = [ids[next]!, ids[index]!];
    run({ command: "reorderSections", projectId, orderedIds: ids });
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Show cards of">
          <Select value={phaseFilter ?? ""} onChange={(event) => router.push(event.target.value ? `${STUDIOFLOW_ROUTES.projectWorkspace(projectId)}?phase=${event.target.value}` : STUDIOFLOW_ROUTES.projectWorkspace(projectId))}>
            <option value="">Every phase</option>
            {phases.map((phase) => <option key={phase.id} value={phase.id}>{phase.name}</option>)}
          </Select>
        </Field>
        {canEdit ? <><Field label="New section"><Input value={newSection} onChange={(event) => setNewSection(event.target.value)} /></Field>
          <Button disabled={!newSection.trim()} pending={pending} onClick={() => run({ command: "createSection", projectId, title: newSection }, () => setNewSection(""))}><Plus size={16} /> Add section</Button></> : null}
      </div>
      {error ? <div role="alert"><InlineError>{error}</InlineError></div> : null}
      {sections.length === 0 ? <EmptyState title="No notes yet" description="Write the first card; a Notes section is created for it." /> : null}
      {canEdit && sections.length === 0 ? <NewCard onSave={(body) => run({ command: "createCard", projectId, phaseId: phaseFilter, body })} pending={pending} /> : null}
      {sections.map((section, sectionIndex) => (
        <SectionCard key={section.id} title={section.title} count={section.cards.length}>
          {canEdit ? <div className="mb-3 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" disabled={sectionIndex === 0} onClick={() => moveSection(sectionIndex, -1)}><ArrowUp size={14} /> Move up</Button>
            <Button size="sm" variant="secondary" disabled={sectionIndex === sections.length - 1} onClick={() => moveSection(sectionIndex, 1)}><ArrowDown size={14} /> Move down</Button>
            <Button size="sm" variant="secondary" onClick={() => { const title = window.prompt("Section title", section.title); if (title) run({ command: "renameSection", projectId, sectionId: section.id, title, version: section.version }); }}>Rename</Button>
            <Button size="sm" variant="danger" disabled={section.cards.length > 0} onClick={() => run({ command: "deleteSection", projectId, sectionId: section.id, version: section.version })}><Trash2 size={14} /> Delete section</Button>
          </div> : null}
          <ul className="grid gap-2">
            {section.cards.map((card, cardIndex) => (
              <li key={card.id} className="rounded-card border border-line p-3">
                <div className="mb-1 flex flex-wrap gap-2 text-xs text-ink-secondary">
                  {card.pinned ? <span>Pinned</span> : null}
                  {ORIGIN_LABEL[card.origin] ? <span>{ORIGIN_LABEL[card.origin]}</span> : null}
                  <span>{card.phaseName ?? "No phase"}{card.iterationLabel ? ` · ${card.iterationLabel}` : ""}</span>
                  {card.authorName ? <span>{card.authorName}</span> : null}
                  {card.imageCount ? <span>{card.imageCount} image{card.imageCount === 1 ? "" : "s"}</span> : null}
                </div>
                {canEdit ? <>
                  <Textarea value={drafts[card.id] ?? card.body} onChange={(event) => setDrafts((current) => ({ ...current, [card.id]: event.target.value }))} rows={2} />
                  <div className="mt-2 flex flex-wrap items-end gap-2">
                    <Button size="sm" disabled={(drafts[card.id] ?? card.body) === card.body} onClick={() => run({ command: "updateCard", projectId, cardId: card.id, body: drafts[card.id] ?? card.body, version: card.version }, () => setDrafts((current) => { const next = { ...current }; delete next[card.id]; return next; }))}>Save</Button>
                    <Button size="sm" variant="secondary" onClick={() => run({ command: "pinCard", projectId, cardId: card.id, pinned: !card.pinned, version: card.version })}><Pin size={14} /> {card.pinned ? "Unpin" : "Pin"}</Button>
                    <Button size="sm" variant="secondary" disabled={cardIndex === 0} onClick={() => run({ command: "moveCard", projectId, cardId: card.id, sectionId: section.id, position: cardIndex - 1, version: card.version })}><ArrowUp size={14} /></Button>
                    <Button size="sm" variant="secondary" disabled={cardIndex === section.cards.length - 1} onClick={() => run({ command: "moveCard", projectId, cardId: card.id, sectionId: section.id, position: cardIndex + 1, version: card.version })}><ArrowDown size={14} /></Button>
                    <Field label="Section"><Select value={section.id} onChange={(event) => run({ command: "moveCard", projectId, cardId: card.id, sectionId: event.target.value, position: 0, version: card.version })}>
                      {sections.map((option) => <option key={option.id} value={option.id}>{option.title}</option>)}
                    </Select></Field>
                    <Field label="Phase"><Select value={card.phaseId ?? ""} onChange={(event) => run({ command: "setCardPhase", projectId, cardId: card.id, phaseId: event.target.value || null, version: card.version })}>
                      <option value="">No phase</option>
                      {phases.map((phase) => <option key={phase.id} value={phase.id}>{phase.name}</option>)}
                    </Select></Field>
                    <Button size="sm" variant="danger" onClick={() => run({ command: "deleteCard", projectId, cardId: card.id, version: card.version })}><Trash2 size={14} /> Delete</Button>
                  </div>
                </> : <p className="whitespace-pre-wrap text-sm text-ink">{card.body}</p>}
              </li>
            ))}
          </ul>
          {canEdit ? <NewCard onSave={(body) => run({ command: "createCard", projectId, sectionId: section.id, phaseId: phaseFilter, body })} pending={pending} /> : null}
        </SectionCard>
      ))}
      <p className="text-xs text-ink-secondary">Images are added from the phase notes for now. <Link className="underline" href={STUDIOFLOW_ROUTES.project(projectId)}>Open the phases</Link></p>
    </div>
  );
}

function NewCard({ onSave, pending }: { onSave: (body: string) => void; pending: boolean }) {
  const [body, setBody] = useState("");
  return (
    <div className="mt-3 flex flex-wrap items-end gap-2">
      <Field label="New card"><Textarea value={body} onChange={(event) => setBody(event.target.value)} rows={2} /></Field>
      <Button size="sm" disabled={!body.trim()} pending={pending} onClick={() => { onSave(body); setBody(""); }}><Plus size={14} /> Add card</Button>
    </div>
  );
}
