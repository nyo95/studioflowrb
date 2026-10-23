"use client";

import { Check, ListChecks } from "lucide-react";
import { useState } from "react";

import {
  SCHEDULE_CARD_FIELD_LABEL,
  SCHEDULE_INITIALS_FIELDS,
  cardFieldLabel,
  cardFieldValuesOf,
  effectiveCardFields,
  extraChoicesOf,
  scheduleCardTitle,
  shownOptionOf,
  type ScheduleEntryView,
} from "@/apps/studioflow/domain/schedule";
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  Text,
  GroupHeader,
  ContextActionMenu,
  type RowActionItem,
  } from "@/platform/ui_engine";
import { updateScheduleEntryCardFieldsAction } from "../../../actions";
import { cardHighlightStyle, type CategoryChoice, type Command, entryBadges, Footer, NewCategoryInline, QuickAddTile, type ScheduleFilter, type Section, useRowDrag } from "./schedule-shared";

// ── Board view ─────────────────────────────────────────────────────────────

/** Card fields whose value names itself, so the board joins them into one line without labels. */
export const SPEC_LINE_FIELDS: ReadonlySet<string> = new Set(["color", "pattern", "finishing", "dimension", "qty"]);
const INITIALS_FIELDS: ReadonlySet<string> = new Set(SCHEDULE_INITIALS_FIELDS);

/**
 * Which fields one card shows, chosen on the Board because the Board is the pre-print view (owner, 2026-10-23; legacy's
 * per-card "Card fields" popover). Saving writes the item's card fields; "Use default" goes back to the studio default.
 */
function CardFieldsDialog({ projectId, entry, command, onClose }: { projectId: string; entry: ScheduleEntryView; command: Command; onClose: () => void }) {
  const extras = extraChoicesOf(entry);
  const choices = [
    ...(Object.keys(SCHEDULE_CARD_FIELD_LABEL) as Array<keyof typeof SCHEDULE_CARD_FIELD_LABEL>)
      .filter((key) => key !== "qty" || entry.section === "FIXTURE")
      .map((key) => ({ key: key as string, label: SCHEDULE_CARD_FIELD_LABEL[key] })),
    ...extras,
  ];
  const [picked, setPicked] = useState<string[]>(() => effectiveCardFields(entry));
  const pendingKey = `${entry.id}-card-fields`;
  const save = async (fields: string[] | null) => {
    const ok = await command.run(pendingKey, () => updateScheduleEntryCardFieldsAction({ projectId, entryId: entry.id, fields }));
    if (ok) onClose();
  };
  const pending = command.isPending(pendingKey);
  return (
    <Dialog
      open
      onOpenChange={(open) => { if (!open && !pending) onClose(); }}
      title={`Card fields · ${entry.code}`}
      description="What this card shows on the Board and in print. Photo, code and Type always show."
      size="sm"
      dismissible={!pending}
      footer={<Footer>
        {entry.cardFields !== null ? <Button variant="ghost" disabled={pending} onClick={() => void save(null)}>Use default</Button> : null}
        <Button variant="ghost" disabled={pending} onClick={onClose}>Cancel</Button>
        <Button variant="primary" pending={pending} onClick={() => void save(choices.map((choice) => choice.key).filter((key) => picked.includes(key)))}>Save</Button>
      </Footer>}
    >
      <div className="grid gap-2">
        {choices.map((choice) => (
          <Checkbox
            key={choice.key}
            checked={picked.includes(choice.key)}
            onCheckedChange={() => setPicked((current) => (current.includes(choice.key) ? current.filter((key) => key !== choice.key) : [...current, choice.key]))}
            label={choice.label}
          />
        ))}
        {entry.cardFields === null ? <Text size="sm" tone="tertiary">This card uses the studio default.</Text> : null}
      </div>
    </Dialog>
  );
}

export function BoardView({
  projectId,
  groups,
  command,
  onOpen,
  canEdit,
  filter,
  section,
  onReorder,
  onDelete,
  menuItems,
  categoryChoices,
  openId,
  selecting,
  selectedIds,
  onToggle,
}: {
  projectId: string;
  groups: Array<{ category: string; rows: ScheduleEntryView[] }>;
  command: Command;
  onOpen: (id: string) => void;
  canEdit: boolean;
  filter: ScheduleFilter;
  section: Section;
  onReorder: (rows: ScheduleEntryView[], draggedId: string, targetId: string) => void;
  onDelete: (entry: ScheduleEntryView) => void;
  /** Copy, hide and highlight for one card; shared with the List row menu. */
  menuItems: (entry: ScheduleEntryView) => RowActionItem[];
  categoryChoices: readonly CategoryChoice[];
  openId: string | null;
  selecting: boolean;
  selectedIds: ReadonlySet<string>;
  onToggle: (id: string) => void;
}) {
  const { draggingId, dragOverId, start, end, over, leave } = useRowDrag();
  const reorderEnabled = canEdit && filter === "all" && !selecting;
  const pick = (id: string) => (selecting ? onToggle(id) : onOpen(id));
  const [fieldsFor, setFieldsFor] = useState<ScheduleEntryView | null>(null);
  return (
    <div className="@container grid gap-8 p-(--ui-section-px)">
      {fieldsFor ? <CardFieldsDialog projectId={projectId} entry={fieldsFor} command={command} onClose={() => setFieldsFor(null)} /> : null}
      {groups.map((group) => (
        <section key={group.category} className="grid gap-3" aria-label={group.category}>
          <GroupHeader title={<span className="inline-flex items-baseline gap-2"><span>{group.category}</span><span className="font-ui-mono font-normal text-ink-tertiary">{group.rows[0]?.code.split("-")[0]}</span></span>} count={group.rows.length} />
          <div className="grid min-w-0 grid-cols-2 items-start gap-x-3 gap-y-5 @xl:grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))]">
            {group.rows.map((entry) => {
              const shown = shownOptionOf(entry);
              const extras = extraChoicesOf(entry);
              const fieldValue = cardFieldValuesOf(entry);
              const fields = effectiveCardFields(entry);
              const brand = fields.includes("brand") ? fieldValue.brand : null;
              // Self-describing specs read as one line ("Pink · Texture Paint · Matte"); only fields that need a name keep one.
              // The Board is the pre-print view: the same title as the print (Type, or Initials type while there is no Type),
              // then the card's chosen fields; fields that already make up an Initials title are not repeated.
              const heading = shown ? scheduleCardTitle(shown) : null;
              const title = heading?.title ?? null;
              const spec = fields.filter((key) => SPEC_LINE_FIELDS.has(key) && !(heading?.fromInitials && INITIALS_FIELDS.has(key))).map((key) => fieldValue[key]).filter(Boolean).join(" · ");
              const details = fields.filter((key) => key !== "brand" && !SPEC_LINE_FIELDS.has(key))
                .map((key) => [cardFieldLabel(key, extras), fieldValue[key]] as [string, string | null | undefined])
                .filter(([, value]) => !!value);
              const allBadges = entryBadges(entry);
              const isFinal = allBadges.some((badge) => badge.label === "Final");
              const badges = allBadges.filter((badge) => !badge.quiet);
              return (
                <ContextActionMenu
                  key={entry.id}
                  items={!selecting ? [
                    { label: "Open", onSelect: () => onOpen(entry.id) },
                    ...(canEdit ? [{ label: "Card fields…", icon: <ListChecks className="h-3.5 w-3.5" />, onSelect: () => setFieldsFor(entry) }] : []),
                    ...menuItems(entry),
                    ...(canEdit ? [{ label: "Delete", danger: true, separatorBefore: true, onSelect: () => onDelete(entry) }] : []),
                  ] : []}
                >
                <article
                  id={`schedule-entry-${entry.id}`}
                  draggable={reorderEnabled}
                  onDragStart={start(entry.id)}
                  onDragEnd={end}
                  onDragOver={over(entry.id, reorderEnabled)}
                  onDragLeave={leave(entry.id)}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (draggingId) onReorder(group.rows, draggingId, entry.id);
                    end();
                  }}
                  style={cardHighlightStyle(entry.highlight)}
                  className={`group relative grid min-w-0 content-start text-left ${entry.hidden ? "opacity-55" : ""} ${reorderEnabled ? "cursor-grab active:cursor-grabbing" : ""} ${draggingId === entry.id ? "opacity-40" : ""} ${openId === entry.id || selectedIds.has(entry.id) ? "outline-2 outline-offset-2 outline-line-focus" : ""} ${dragOverId === entry.id && draggingId && draggingId !== entry.id ? "outline-2 outline-dashed outline-offset-2 outline-line-focus" : ""}`}
                >
                  <button type="button" aria-pressed={selecting ? selectedIds.has(entry.id) : undefined} onClick={() => pick(entry.id)} className="relative mb-2 block aspect-[4/5] w-full overflow-hidden bg-surface-muted text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-focus">
                    {shown?.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={shown.imageUrl} alt={shown.productName} className="h-full w-full object-cover transition-opacity group-hover:opacity-90" draggable={false} />
                    ) : (
                      <span className="absolute inset-0 grid place-items-center text-micro tracking-[0.18em] text-ink-tertiary">NO IMAGE</span>
                    )}
                    <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-action bg-surface/90 px-1.5 py-0.5 font-ui-mono text-micro font-bold tabular-nums text-ink">
                      {isFinal ? <><Check aria-hidden="true" className="h-3 w-3 text-success" strokeWidth={3} /><span className="sr-only">Final, </span></> : null}
                      {entry.code}
                    </span>
                  </button>
                  {canEdit && !selecting ? (
                    <button
                      type="button"
                      onClick={() => setFieldsFor(entry)}
                      className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-action bg-surface/95 px-1.5 py-0.5 text-micro font-medium text-ink opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-line-focus"
                    >
                      <ListChecks aria-hidden="true" className="h-3 w-3" />Card fields
                    </button>
                  ) : null}
                  {selecting ? (
                    <span className="absolute left-2 top-2 rounded-[4px] bg-surface p-0.5">
                      <Checkbox checked={selectedIds.has(entry.id)} onCheckedChange={() => onToggle(entry.id)} label={<span className="sr-only">Select {entry.code}</span>} />
                    </span>
                  ) : null}
                  <button type="button" onClick={() => pick(entry.id)} className="grid min-w-0 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-focus">
                  {badges.length ? <span className="mb-1 flex flex-wrap gap-1">{badges.map((badge) => <Badge key={badge.label} tone={badge.tone}>{badge.label}</Badge>)}</span> : null}
                  {brand ? <span className="truncate text-micro uppercase tracking-[0.08em] text-ink-tertiary">{brand}</span> : null}
                  {title ? (
                    <span className="line-clamp-2 font-ui-sans text-xs font-semibold uppercase leading-snug text-ink" title={title}>{title}</span>
                  ) : (
                    <span className="text-xs italic text-ink-tertiary">Reserved, no product yet</span>
                  )}
                  {spec ? <span className="mt-0.5 line-clamp-2 text-xs leading-snug text-ink-secondary" title={spec}>{spec}</span> : null}
                  {details.length ? (
                    <span className="mt-1.5 grid gap-1 border-t border-line pt-1.5">
                      {/* Run-in label: the value wraps under it at full card width instead of losing a label column. */}
                      {details.map(([label, value]) => (
                        <span key={label} className="line-clamp-2 text-xs leading-snug text-ink [overflow-wrap:anywhere]" title={`${label}: ${value}`}>
                          <span className="mr-1.5 text-micro uppercase tracking-[0.06em] text-ink-tertiary">{label}</span>{value}
                        </span>
                      ))}
                    </span>
                  ) : null}
                  </button>
                </article>
                </ContextActionMenu>
              );
            })}
            {canEdit && filter === "all" ? <QuickAddTile group={group} command={command} projectId={projectId} section={section} /> : null}
          </div>
        </section>
      ))}
      {canEdit && filter === "all" ? <NewCategoryInline command={command} projectId={projectId} section={section} categories={groups.map((group) => group.category)} categoryChoices={categoryChoices} /> : null}
    </div>
  );
}
