"use client";

import { Check } from "lucide-react";
import {
  cardFieldLabel,
  cardFieldValuesOf,
  effectiveCardFields,
  extraChoicesOf,
  shownOptionOf,
  type ScheduleEntryView,
} from "@/apps/studioflow/domain/schedule";
import {
  Badge,
  Checkbox,
  GroupHeader,
  ContextActionMenu,
  type RowActionItem,
  } from "@/platform/ui_engine";
import { cardHighlightStyle, type CategoryChoice, type Command, entryBadges, hasTypeOf, INITIALS_FIELDS, initialsOf, NewCategoryInline, QuickAddTile, type ScheduleFilter, type Section, useRowDrag } from "./schedule-shared";

// ── Board view ─────────────────────────────────────────────────────────────

/** Card fields whose value names itself, so the board joins them into one line without labels. */
export const SPEC_LINE_FIELDS: ReadonlySet<string> = new Set(["color", "pattern", "finishing", "dimension", "qty"]);

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
  return (
    <div className="@container grid gap-8 p-(--ui-section-px)">
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
              // The Board is a viewer, not the print (owner, 2026-10-23): the title is the Type, or the Initials type
              // while there is no Type yet, never both; below it only the active card fields, minus the initials.
              const title = shown ? (hasTypeOf(shown) ? shown.productName : initialsOf(shown) || shown.productName) : null;
              const spec = fields.filter((key) => SPEC_LINE_FIELDS.has(key) && !INITIALS_FIELDS.has(key)).map((key) => fieldValue[key]).filter(Boolean).join(" · ");
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
