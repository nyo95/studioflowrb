"use client";

import { GripVertical, Pin, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type DragEvent } from "react";

import { useDisplaySettings } from "@/platform/authenticated-shell/display-settings";
import { Badge, Button, EmptyState, InlineEdit, InlineError, Input, PillTabs, RowActionMenu, Text, useConfirm, type RowActionItem } from "@/platform/ui_engine";
import { STUDIOFLOW_ROUTES } from "@/apps/studioflow/public/nav";

import { CardComposer, ReadOnlyBoardNotice, WorkspaceCard, runWorkspaceCommand, type PhaseOption, type RunCommand, type WorkspaceCardView } from "./workspace-card";
import type { WorkspaceCommandInput } from "../../../actions";

type Section = { id: string; title: string; version: number; isDefault: boolean; cards: WorkspaceCardView[] };
type CardDragState = { id: string; from: string };
type CardDrop = { sectionId: string; index: number };

/** The board after moving one card to `index` of `sectionId` (an index among that section's other cards). */
function withCardMoved(board: readonly Section[], cardId: string, sectionId: string, index: number): Section[] {
  const card = board.flatMap((section) => section.cards).find((item) => item.id === cardId);
  if (!card) return [...board];
  return board.map((section) => {
    const rest = section.cards.filter((item) => item.id !== cardId);
    if (section.id !== sectionId) return rest.length === section.cards.length ? section : { ...section, cards: rest };
    rest.splice(Math.min(index, rest.length), 0, card);
    return { ...section, cards: rest };
  });
}

/**
 * The project Workspace (WO-SF-WORKSPACE-01, Lead UI): free-topic sections side by side as columns (stacked on a
 * phone), cards in the order the team puts them. Drag a card within or across sections and drag a section's grip to
 * reorder sections; every drag has a menu equivalent ("Move up", "Move to …", "Move left") for keyboard and touch.
 * A phase filter shows one phase's cards; while a filter hides cards, reordering is off so a position always means
 * the same thing to everyone.
 */
export function WorkspaceBoard({ projectId, sections, phases, phaseFilter, readOnlyReason, canEditGeneral, writablePhaseIds, canUseIdeas }: {
  projectId: string;
  sections: Section[];
  phases: readonly PhaseOption[];
  phaseFilter: string | null;
  readOnlyReason: "archived" | "inactive" | "permission" | null;
  canEditGeneral: boolean;
  writablePhaseIds: readonly string[];
  canUseIdeas: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const { locale, timezone } = useDisplaySettings();

  // A local copy so a drop shows at once; it is replaced whenever the server sends the board again.
  const [received, setReceived] = useState(sections);
  const [board, setBoard] = useState(sections);
  if (received !== sections) { setReceived(sections); setBoard(sections); }

  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cardDrag, setCardDrag] = useState<CardDragState | null>(null);
  const [cardDrop, setCardDrop] = useState<CardDrop | null>(null);
  const [sectionDrag, setSectionDrag] = useState<string | null>(null);
  const [sectionDrop, setSectionDrop] = useState<string | null>(null);
  const [composing, setComposing] = useState<string | null>(null);
  const [newSection, setNewSection] = useState<string | null>(null);
  const [sectionPending, setSectionPending] = useState(false);

  const writable = new Set(writablePhaseIds);
  const writablePhases = phases.filter((phase) => writable.has(phase.id));
  const canWriteCard = (card: WorkspaceCardView) => (card.phaseId ? writable.has(card.phaseId) : canEditGeneral);
  const composerChoices = { allowNone: canEditGeneral, phases: writablePhases };
  const canCreate = canEditGeneral || writablePhases.length > 0;
  const filtered = phaseFilter !== null || pinnedOnly;
  const reorderable = !filtered;
  const totalCards = board.reduce((sum, section) => sum + section.cards.length, 0);
  const pinnedCount = board.reduce((sum, section) => sum + section.cards.filter((card) => card.pinned).length, 0);

  const run: RunCommand = async (input) => {
    setError(null);
    const result = await runWorkspaceCommand(input);
    if (result.ok || result.stale) router.refresh();
    return result;
  };
  const act = async (input: WorkspaceCommandInput) => {
    const result = await run(input);
    if (!result.ok) { setError(result.message); setBoard(sections); }
    return result.ok;
  };

  // ── Cards ───────────────────────────────────────────────────────────

  const moveCard = (card: WorkspaceCardView, sectionId: string, index: number) => {
    setBoard((current) => withCardMoved(current, card.id, sectionId, index));
    void act({ command: "moveCard", projectId, cardId: card.id, sectionId, position: index, version: card.version });
  };

  const endCardDrag = () => { setCardDrag(null); setCardDrop(null); };
  const dropCard = () => {
    const drag = cardDrag;
    const drop = cardDrop;
    endCardDrag();
    if (!drag || !drop) return;
    const from = board.find((section) => section.id === drag.from);
    const fromIndex = from?.cards.findIndex((card) => card.id === drag.id) ?? -1;
    const card = from?.cards[fromIndex];
    if (!card) return;
    // The drop index counts the dragged card where it still stands; the server counts the section without it.
    let index = drop.index;
    if (drop.sectionId === drag.from) {
      if (fromIndex < index) index -= 1;
      if (index === fromIndex) return;
    }
    moveCard(card, drop.sectionId, index);
  };

  const removeCard = async (card: WorkspaceCardView) => {
    const ok = await confirm.confirm({ title: "Delete this card?", description: card.images.length ? "The card and its images are removed. This cannot be undone." : "The card is removed. This cannot be undone.", confirmLabel: "Delete card", tone: "danger" });
    if (ok) await act({ command: "deleteCard", projectId, cardId: card.id, version: card.version });
  };

  // ── Sections ────────────────────────────────────────────────────────

  const reorderSections = (ids: string[]) => {
    setBoard((current) => ids.map((id) => current.find((section) => section.id === id)!).filter(Boolean));
    void act({ command: "reorderSections", projectId, orderedIds: ids });
  };
  const shiftSection = (index: number, by: -1 | 1) => {
    const ids = board.map((section) => section.id);
    const to = index + by;
    if (to < 0 || to >= ids.length) return;
    [ids[index], ids[to]] = [ids[to]!, ids[index]!];
    reorderSections(ids);
  };
  const endSectionDrag = () => { setSectionDrag(null); setSectionDrop(null); };
  const dropSection = (targetId: string) => {
    const dragged = sectionDrag;
    endSectionDrag();
    if (!dragged || dragged === targetId) return;
    const ids = board.map((section) => section.id).filter((id) => id !== dragged);
    const draggedFrom = board.findIndex((section) => section.id === dragged);
    const targetAt = board.findIndex((section) => section.id === targetId);
    // Dropping on a later section puts the dragged one after it; on an earlier one, before it.
    ids.splice(ids.indexOf(targetId) + (draggedFrom < targetAt ? 1 : 0), 0, dragged);
    reorderSections(ids);
  };

  const addSection = async () => {
    const title = newSection?.trim();
    if (!title) return;
    setSectionPending(true);
    const ok = await act({ command: "createSection", projectId, title });
    setSectionPending(false);
    if (ok) setNewSection(null);
  };
  const removeSection = async (section: Section) => {
    const ok = await confirm.confirm({ title: `Delete “${section.title}”?`, description: "Only an empty section can be deleted.", confirmLabel: "Delete section", tone: "danger" });
    if (ok) await act({ command: "deleteSection", projectId, sectionId: section.id, version: section.version });
  };

  const sectionMenu = (section: Section, index: number): RowActionItem[] => [
    { label: "Move left", disabled: index === 0, onSelect: () => shiftSection(index, -1) },
    { label: "Move right", disabled: index === board.length - 1, onSelect: () => shiftSection(index, 1) },
    { label: "Delete section", danger: true, separatorBefore: true, disabled: !filtered && section.cards.length > 0, onSelect: () => void removeSection(section) },
  ];

  const cardMenu = (card: WorkspaceCardView, section: Section, index: number): RowActionItem[] => {
    if (!reorderable) return [];
    const others = board.filter((item) => item.id !== section.id);
    return [
      { label: "Move up", separatorBefore: true, disabled: index === 0, onSelect: () => moveCard(card, section.id, index - 1) },
      { label: "Move down", disabled: index === section.cards.length - 1, onSelect: () => moveCard(card, section.id, index + 1) },
      ...others.map((target) => ({ label: `Move to “${target.title}”`, onSelect: () => moveCard(card, target.id, target.cards.length) })),
    ];
  };

  const workspaceHref = (phaseId: string | null) => (phaseId ? `${STUDIOFLOW_ROUTES.projectWorkspace(projectId)}?phase=${phaseId}` : STUDIOFLOW_ROUTES.projectWorkspace(projectId));
  const limited = !readOnlyReason && !canEditGeneral && writablePhases.length > 0;

  return (
    <div className="grid min-w-0 gap-3">
      {readOnlyReason ? <ReadOnlyBoardNotice reason={readOnlyReason} /> : limited ? <ReadOnlyBoardNotice reason="limited" /> : null}

      <PillTabs
        label="Show cards of"
        items={[
          { key: "all", label: "All phases", href: workspaceHref(null), active: phaseFilter === null },
          ...phases.map((phase) => ({ key: phase.id, label: phase.name, href: workspaceHref(phase.id), active: phaseFilter === phase.id })),
        ]}
        actions={<Button size="sm" variant={pinnedOnly ? "secondary" : "ghost"} aria-pressed={pinnedOnly} leadingIcon={<Pin className={`h-3.5 w-3.5 ${pinnedOnly ? "fill-current" : ""}`} />} onClick={() => setPinnedOnly((value) => !value)}>Pinned{pinnedCount ? ` · ${pinnedCount}` : ""}</Button>}
      />
      {filtered && totalCards > 0 && (canEditGeneral || writablePhases.length > 0) ? <Text size="sm" tone="tertiary">Showing some cards only. Clear the filter to reorder or move cards.</Text> : null}
      {error ? <div role="alert"><InlineError>{error}</InlineError></div> : null}

      {board.length === 0 ? (
        <EmptyState
          title={phaseFilter ? "No cards for this phase" : "Nothing in this Workspace yet"}
          description="Cards hold what the team learns about the project: client feedback, materials, site notes, screenshots. The first card starts a Notes section."
          action={canCreate ? <div className="w-full max-w-xl text-left"><CardComposer projectId={projectId} labelChoices={composerChoices} defaultPhaseId={phaseFilter} run={run} /></div> : undefined}
        />
      ) : (
        <div className="grid min-w-0 gap-3 md:flex md:items-start md:overflow-x-auto md:pb-3">
          {board.map((section, sectionIndex) => {
            const cards = pinnedOnly ? section.cards.filter((card) => card.pinned) : section.cards;
            const dropHere = cardDrag && cardDrop?.sectionId === section.id;
            return (
              <section
                key={section.id}
                aria-label={section.title}
                onDragOver={(event: DragEvent) => {
                  if (sectionDrag) { event.preventDefault(); setSectionDrop(section.id); return; }
                  if (!cardDrag) return;
                  event.preventDefault();
                  // Over the column but not over a card: the end of the column.
                  if (cardDrop?.sectionId !== section.id || event.target === event.currentTarget) setCardDrop({ sectionId: section.id, index: cards.length });
                }}
                onDrop={(event) => { event.preventDefault(); if (sectionDrag) dropSection(section.id); else dropCard(); }}
                className={[
                  "flex min-w-0 flex-col gap-2 rounded-card border bg-surface-muted/40 p-2 md:w-[20rem] md:shrink-0",
                  sectionDrag && sectionDrop === section.id && sectionDrag !== section.id ? "border-line-focus" : dropHere ? "border-line-focus" : "border-line-subtle",
                  sectionDrag === section.id ? "opacity-40" : "",
                ].join(" ")}
              >
                <header className="flex min-h-9 items-center gap-1 px-1">
                  {canEditGeneral && reorderable ? (
                    <span
                      draggable
                      onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", section.id); setSectionDrag(section.id); }}
                      onDragEnd={endSectionDrag}
                      title="Drag to move this section"
                      className="hidden cursor-grab text-ink-tertiary hover:text-ink active:cursor-grabbing md:inline-flex"
                    >
                      <GripVertical aria-hidden="true" className="h-4 w-4" />
                    </span>
                  ) : null}
                  <div className="min-w-0 flex-1">
                    {canEditGeneral ? (
                      <InlineEdit
                        label="Section title"
                        value={section.title}
                        onCommit={async (title) => {
                          const result = await run({ command: "renameSection", projectId, sectionId: section.id, title, version: section.version });
                          if (!result.ok) throw new Error(result.message);
                        }}
                        errorLabel={(failure) => (failure instanceof Error ? failure.message : "The title could not be saved.")}
                        display={(value) => <span className="truncate text-sm font-semibold text-ink">{value}</span>}
                      />
                    ) : <Text size="sm" weight="semibold">{section.title}</Text>}
                  </div>
                  <Badge tone="neutral">{cards.length}</Badge>
                  {canEditGeneral ? <RowActionMenu label={`${section.title} actions`} items={sectionMenu(section, sectionIndex)} /> : null}
                </header>

                <div className="grid gap-2">
                  {cards.length === 0 && !dropHere ? <Text size="sm" tone="tertiary" className="px-1 py-2">{filtered ? "No matching cards." : "No cards yet."}</Text> : null}
                  {cards.map((card, cardIndex) => {
                    const draggable = reorderable && canWriteCard(card);
                    const edge = dropHere && cardDrag?.id !== card.id ? (cardDrop!.index === cardIndex ? "before" : cardDrop!.index === cardIndex + 1 && cardIndex === cards.length - 1 ? "after" : null) : null;
                    return (
                      <WorkspaceCard
                        key={card.id}
                        card={card}
                        projectId={projectId}
                        canWrite={canWriteCard(card)}
                        labelChoices={canWriteCard(card) ? composerChoices : { allowNone: false, phases: [] }}
                        canUseIdeas={canUseIdeas}
                        locale={locale}
                        timezone={timezone}
                        menuExtra={canWriteCard(card) ? cardMenu(card, section, cardIndex) : []}
                        run={run}
                        onDelete={(item) => void removeCard(item)}
                        drag={{
                          draggable,
                          dragging: cardDrag?.id === card.id,
                          dropEdge: edge,
                          onDragStart: (event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", card.id); setCardDrag({ id: card.id, from: section.id }); },
                          onDragEnd: endCardDrag,
                          onDragOver: (event) => {
                            if (!cardDrag) return;
                            event.preventDefault();
                            event.stopPropagation();
                            const box = event.currentTarget.getBoundingClientRect();
                            const index = event.clientY < box.top + box.height / 2 ? cardIndex : cardIndex + 1;
                            if (cardDrop?.sectionId !== section.id || cardDrop.index !== index) setCardDrop({ sectionId: section.id, index });
                          },
                        }}
                      />
                    );
                  })}
                  {dropHere && cards.length === 0 ? <div aria-hidden="true" className="h-12 rounded-control border-2 border-dashed border-line-focus" /> : null}
                </div>

                {canCreate && !pinnedOnly ? (
                  composing === section.id ? (
                    <div className="rounded-control border border-line-subtle bg-surface p-2">
                      <CardComposer projectId={projectId} sectionId={section.id} labelChoices={composerChoices} defaultPhaseId={phaseFilter} run={run} onDone={() => setComposing(null)} autoFocus />
                    </div>
                  ) : (
                    <Button size="sm" variant="ghost" leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setComposing(section.id)} className="justify-start">Add card</Button>
                  )
                ) : null}
              </section>
            );
          })}

          {canEditGeneral && !filtered ? (
            <div className="md:w-[16rem] md:shrink-0">
              {newSection === null ? (
                <Button variant="secondary" leadingIcon={<Plus className="h-4 w-4" />} onClick={() => setNewSection("")} className="w-full justify-start">Add section</Button>
              ) : (
                <form className="grid gap-2 rounded-card border border-line-subtle bg-surface-muted/40 p-2" onSubmit={(event) => { event.preventDefault(); void addSection(); }}>
                  <Input aria-label="New section title" placeholder="e.g. Client feedback, Materials, Site" maxLength={80} autoFocus value={newSection} onChange={(event) => setNewSection(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setNewSection(null); }} />
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" variant="primary" pending={sectionPending} disabled={!newSection.trim()}>Add section</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setNewSection(null)}>Cancel</Button>
                  </div>
                </form>
              )}
            </div>
          ) : null}
        </div>
      )}
      {confirm.dialog}
    </div>
  );
}
