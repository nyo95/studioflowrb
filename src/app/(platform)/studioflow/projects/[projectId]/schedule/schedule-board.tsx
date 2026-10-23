"use client";

import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  ImageIcon,
  LayoutGrid,
  Package,
  Palette,
  Plus,
  Printer,
  Search,
  SquareCheck,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { STUDIOFLOW_ROUTES } from "@/apps/studioflow/public";
import {
  SCHEDULE_HIGHLIGHTS,
  brandLinkCandidates,
  SCHEDULE_SECTION_LABEL as SECTION_LABEL,
  shownOptionOf,
  templateSourceOf,
  type ScheduleEntryView,
  type ScheduleHighlight,
  type ScheduleOptionView,
} from "@/apps/studioflow/domain/schedule";
import {
  Badge,
  Button,
  ButtonMenu,
  Checkbox,
  Dialog,
  EmptyState,
  FilterChip,
  InlineError,
  ProgressBar,
  PillTabs,
  ContextActionMenu,
  RowActionMenu,
  type RowActionItem,
  Select,
  SortToggle,
  canWriteClipboardImage,
  toSpreadsheetText,
  writeClipboardImage,
  writeClipboardText,
  TableFilters,
  Text,
  type SortDirection,
  useConfirm,
} from "@/platform/ui_engine";
import {
  applyScheduleTemplatesAction,
  deleteScheduleEntriesAction,
  deleteScheduleEntryAction,
  moveScheduleEntryAction,
  reorderScheduleEntriesAction,
  saveScheduleEntryAsTemplateAction,
  setScheduleEntriesHiddenAction,
  setScheduleEntriesHighlightAction,
  updateScheduleOptionAction,
} from "../../../actions";
import { useCommand } from "../../../_components/use-command";
import { AddItemDrawer } from "./schedule-add-item";
import { BoardView } from "./schedule-board-view";
import { BulkPanel, ImportDialog, MoveDialog } from "./schedule-dialogs";
import { DockedEntryPanel } from "./schedule-entry-panel";
import { BLANK, type Brand, type CategoryChoice, entryBadges, entryMatchesFilter, entryMatchesQuery, HIGHLIGHT_LABEL, type HighlightFilter, initialsOf, InlineSampleRequest, LIST_FILTER_LABEL, listCellText, type ListFilterKey, type ListSortKey, NewCategoryInline, NO_LIST_FILTERS, productFromOption, rowHighlightClass, rowHighlightStyle, type ScheduleFilter, scheduleFilterCounts, type Section, sheetRowOf, SHOW_CONTACT_KEY, Swatch, Thumb, toSnapshot, TYPED_BRAND, useRowDrag, type Visibility } from "./schedule-shared";

type Mark = { hidden?: boolean; highlight?: ScheduleHighlight | null };
type MarkOverride = { mark: Mark; settled: boolean; retries: number };

export function ScheduleBoard({
  initialOpenId = null,
  projectId,
  entries: serverEntries,
  brands,
  categoryChoices,
  canEdit,
  canManageTemplates,
  templatesHref,
}: {
  initialOpenId?: string | null;
  projectId: string;
  entries: readonly ScheduleEntryView[];
  brands: readonly Brand[];
  categoryChoices: readonly CategoryChoice[];
  canEdit: boolean;
  /** Studio settings permission: template settings link and "Save as template". */
  canManageTemplates: boolean;
  templatesHref: string;
}) {
  const router = useRouter();
  const command = useCommand();
  const { run, error } = command;
  const confirm = useConfirm();
  const [section, setSection] = useState<Section>(() => serverEntries.find((entry) => entry.id === initialOpenId)?.section ?? (serverEntries.some((e) => e.section === "MATERIAL") || !serverEntries.length ? "MATERIAL" : "FIXTURE"));
  const [viewMode, setViewMode] = useState<"list" | "board">("list"); // List is the default view (owner, 2026-10-23)
  const [filter, setFilter] = useState<ScheduleFilter>("all");
  // Hide and highlight show at once and are held until the page itself carries the saved value (R9.234). A command
  // that has finished but whose value the page does not show yet asks for the page again (at most twice): that
  // request starts after the write, so it cannot bring an older value back. If the page still disagrees, it wins.
  const [markOverrides, setMarkOverrides] = useState<ReadonlyMap<string, MarkOverride>>(() => new Map());
  const entries = useMemo(
    () => (markOverrides.size === 0 ? serverEntries : serverEntries.map((entry) => {
      const override = markOverrides.get(entry.id);
      return override ? { ...entry, ...override.mark } : entry;
    })),
    [serverEntries, markOverrides],
  );
  const overrideMarks = (ids: readonly string[], change: { mark: Mark } | "settled" | "drop") =>
    setMarkOverrides((current) => {
      const next = new Map(current);
      for (const id of ids) {
        const present = next.get(id);
        if (change === "drop") next.delete(id);
        else if (change === "settled") { if (present) next.set(id, { ...present, settled: true }); }
        else next.set(id, { mark: { ...present?.mark, ...change.mark }, settled: false, retries: 0 });
      }
      return next;
    });
  useEffect(() => {
    if (markOverrides.size === 0) return;
    const timer = window.setTimeout(() => {
      const byId = new Map(serverEntries.map((entry) => [entry.id, entry]));
      let refetch = false;
      setMarkOverrides((current) => {
        const next = new Map(current);
        for (const [id, override] of current) {
          if (!override.settled) continue;
          const saved = byId.get(id);
          const agrees = !saved || (Object.keys(override.mark) as Array<keyof Mark>).every((key) => saved[key] === override.mark[key]);
          if (agrees || override.retries >= 2) next.delete(id);
          else { next.set(id, { ...override, retries: override.retries + 1 }); refetch = true; }
        }
        return next;
      });
      if (refetch) router.refresh();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [serverEntries, markOverrides, router]);
  const [openId, setOpenId] = useState<string | null>(initialOpenId);
  const scrolledInitial = useRef(false);
  useEffect(() => {
    if (scrolledInitial.current || !initialOpenId) return;
    scrolledInitial.current = true;
    document.getElementById(`schedule-entry-${initialOpenId}`)?.scrollIntoView({ block: "nearest" });
  }, [initialOpenId]);
  const [autoPhotoOptionId, setAutoPhotoOptionId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | "add" | "import" | { move: ScheduleEntryView }>(null);
  const [printAsk, setPrintAsk] = useState(false);
  /** Request sample from a row's menu, for the option the row shows (the final one, else the active one). */
  const [sampleTarget, setSampleTarget] = useState<{ code: string; option: ScheduleOptionView } | null>(null);
  const openPrint = (includeHidden: boolean) => {
    setPrintAsk(false);
    window.open(`${STUDIOFLOW_ROUTES.projectSchedulePrint(projectId)}${includeHidden ? "?hidden=include" : ""}`, "_blank", "noopener");
  };
  const [notice, setNotice] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const editorDirtyRef = useRef(false);
  const listDrag = useRowDrag();

  /** Every path that opens the entry panel goes through here, so a stale
   * auto-photo target from a previous image click never leaks into a plain
   * "open the item" click (owner, 2026-09-24: one modal, not two). */
  const openEntry = (id: string, photoOptionId: string | null = null) => {
    setOpenId(id);
    setAutoPhotoOptionId(photoOptionId);
  };

  // Hidden items leave every count and the progress (owner, 2026-10-23); they are still loaded, so they can be shown.
  const counts = useMemo(() => ({
    MATERIAL: entries.filter((e) => e.section === "MATERIAL" && !e.hidden).length,
    FIXTURE: entries.filter((e) => e.section === "FIXTURE" && !e.hidden).length,
  }), [entries]);

  const sectionEntries = useMemo(() => entries.filter((entry) => entry.section === section), [entries, section]);
  const progress = useMemo(() => scheduleFilterCounts(sectionEntries.filter((entry) => !entry.hidden)), [sectionEntries]);
  const hiddenCount = sectionEntries.filter((entry) => entry.hidden).length;
  const highlightedCount = sectionEntries.filter((entry) => entry.highlight).length;
  const [visibility, setVisibility] = useState<Visibility>("visible");
  const [highlightFilter, setHighlightFilter] = useState<HighlightFilter>("ALL");
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const visibleEntries = useMemo(() => sectionEntries.filter((entry) =>
    (visibility === "all" || entry.hidden === (visibility === "hidden"))
    && (highlightFilter === "ALL" || (highlightFilter === "any" ? entry.highlight !== null : entry.highlight === highlightFilter))
    && entryMatchesFilter(entry, filter) && (!needle || entryMatchesQuery(entry, needle))), [sectionEntries, visibility, highlightFilter, filter, needle]);

  const groups = useMemo(() => {
    const map = new Map<string, ScheduleEntryView[]>();
    for (const entry of visibleEntries) {
      map.set(entry.category, [...(map.get(entry.category) ?? []), entry]);
    }
    return [...map.entries()].map(([category, rows]) => ({ category, rows }));
  }, [visibleEntries]);

  // List-only sort and per-column filters (owner, 2026-10-23). The studio's manual order stays the default;
  // reordering is offered only while neither is in use, because a moved row would jump away from where it was dropped.
  const [listSort, setListSort] = useState<{ key: ListSortKey; direction: SortDirection } | null>(null);
  const [listFilters, setListFilters] = useState<Record<ListFilterKey, string>>(NO_LIST_FILTERS);
  // Collapsed category groups of the List; a group holding the open item always shows it.
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(() => new Set());
  const [showContact, setShowContact] = useState(false);
  useEffect(() => {
    // Read after hydration, so the server and the browser render the same page first.
    const timer = window.setTimeout(() => {
      try { setShowContact(window.localStorage.getItem(SHOW_CONTACT_KEY) === "1"); } catch { /* storage blocked: column stays off */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  const toggleContact = () => {
    const next = !showContact;
    setShowContact(next);
    if (!next) setListFilters((current) => ({ ...current, contact: "ALL" }));
    try { window.localStorage.setItem(SHOW_CONTACT_KEY, next ? "1" : "0"); } catch { /* storage blocked: choice lasts this visit */ }
  };
  const toggleGroup = (category: string) => setCollapsedGroups((current) => {
    const next = new Set(current);
    if (!next.delete(category)) next.add(category);
    return next;
  });
  // Copy for the studio's Google Sheet, which is still kept by hand alongside the app (owner, 2026-10-23).
  const copyRows = async (rows: readonly ScheduleEntryView[]) => {
    try {
      await writeClipboardText(toSpreadsheetText(rows.map((row) => sheetRowOf(row, showContact))));
      setNotice(rows.length === 1
        ? `${rows[0].code} copied. Paste it into the sheet; paste the photo into IMAGE with Copy image.`
        : `${rows.length} rows copied. Paste them into the sheet; photos are copied one at a time with Copy image.`);
    } catch {
      setNotice("Could not copy. Allow clipboard access for this site and try again.");
    }
  };
  const copyImage = async (entry: ScheduleEntryView) => {
    const url = shownOptionOf(entry)?.imageUrl;
    if (!url) return;
    try {
      await writeClipboardImage(url);
      setNotice(`Photo of ${entry.code} copied. Click its IMAGE cell in the sheet and paste.`);
    } catch (copyError) {
      setNotice(copyError instanceof Error ? copyError.message : "Could not copy the photo.");
    }
  };
  const setHidden = async (rows: readonly ScheduleEntryView[], hidden: boolean) => {
    const entryIds = rows.map((row) => row.id);
    overrideMarks(entryIds, { mark: { hidden } });
    const ok = await run("mark-hidden", () => setScheduleEntriesHiddenAction({ projectId, entryIds, hidden }), undefined, { refresh: false });
    overrideMarks(entryIds, ok ? "settled" : "drop");
    if (!ok) return;
    const what = rows.length === 1 ? rows[0].code : `${rows.length} items`;
    setNotice(hidden ? `${what} hidden. Choose "Show hidden" to see ${rows.length === 1 ? "it" : "them"} again.` : `${what} shown again.`);
  };
  const setHighlight = async (rows: readonly ScheduleEntryView[], highlight: ScheduleHighlight | null) => {
    const entryIds = rows.map((row) => row.id);
    overrideMarks(entryIds, { mark: { highlight } });
    const ok = await run("mark-highlight", () => setScheduleEntriesHighlightAction({ projectId, entryIds, highlight }), undefined, { refresh: false });
    overrideMarks(entryIds, ok ? "settled" : "drop");
  };
  /** Hide / Unhide and Highlight for one or several items; empty for a viewer who cannot edit. */
  const markItems = (rows: readonly ScheduleEntryView[]): RowActionItem[] => {
    if (!canEdit || rows.length === 0) return [];
    const allHidden = rows.every((row) => row.hidden);
    return [
      { label: allHidden ? "Unhide" : "Hide", icon: allHidden ? <Eye /> : <EyeOff />, separatorBefore: true, onSelect: () => void setHidden(rows, !allHidden) },
      {
        label: "Highlight",
        icon: <Palette />,
        items: [
          ...SCHEDULE_HIGHLIGHTS.map((highlight) => ({ label: HIGHLIGHT_LABEL[highlight], icon: <Swatch highlight={highlight} />, onSelect: () => setHighlight(rows, highlight) })),
          { label: "No colour", icon: <Swatch highlight={null} />, separatorBefore: true, onSelect: () => setHighlight(rows, null) },
        ],
      },
    ];
  };
  /** One typed Brand shared by every selected item, offered as a link to each Master Data candidate. */
  const brandLinksFor = (rows: readonly ScheduleEntryView[]): RowActionItem[] => {
    if (!canEdit || rows.length === 0) return [];
    const options = rows.map((row) => shownOptionOf(row));
    if (options.some((option) => !option || option.brandId || !option.brandName)) return [];
    const typed = new Set(options.map((option) => option!.brandName!.trim().toLocaleLowerCase("id-ID")));
    if (typed.size !== 1) return [];
    return brandLinkCandidates(options[0]!.brandName, brands).map((brand) => ({
      label: `Link ${rows.length === 1 ? rows[0].code : `${rows.length} items`} to "${brand.name}"`,
      onSelect: () => void linkBrand(rows, brand),
    }));
  };
  const linkBrand = async (rows: readonly ScheduleEntryView[], brand: Brand) => {
    const ok = await run("link-brand", async () => {
      for (const row of rows) {
        const option = shownOptionOf(row);
        if (!option) continue;
        const result = await updateScheduleOptionAction({ projectId, optionId: option.id, snapshot: toSnapshot({ ...productFromOption(option), brandId: brand.id, brandName: "" }) });
        if (!result.ok) return result;
      }
      return { ok: true as const, data: null };
    });
    if (ok) setNotice(`${rows.length === 1 ? rows[0].code : `${rows.length} items`} now use the Master Data Brand "${brand.name}".`);
  };
  const sampleItems = (entry: ScheduleEntryView): RowActionItem[] => {
    const option = shownOptionOf(entry);
    if (!canEdit || !option) return [];
    const asked = option.sampleRequest?.status === "REQUESTED";
    return [{ label: asked ? "Ask for the sample again" : "Request sample", icon: <Package className="h-3.5 w-3.5" />, separatorBefore: true, onSelect: () => setSampleTarget({ code: entry.code, option }) }];
  };
  const copyItems = (entry: ScheduleEntryView): RowActionItem[] => [
    { label: "Copy row", icon: <Copy className="h-3.5 w-3.5" />, separatorBefore: true, onSelect: () => void copyRows([entry]) },
    ...(shownOptionOf(entry)?.imageUrl && canWriteClipboardImage() ? [{ label: "Copy image", icon: <ImageIcon className="h-3.5 w-3.5" />, onSelect: () => void copyImage(entry) }] : []),
  ];
  const listFiltered = Object.values(listFilters).some((value) => value !== "ALL");
  const listManual = filter === "all" && listSort === null && !listFiltered && highlightFilter === "ALL" && visibility !== "hidden";
  const listGroups = useMemo(() => {
    const keep = (entry: ScheduleEntryView) => (Object.keys(listFilters) as ListFilterKey[]).every((key) => {
      const wanted = listFilters[key];
      if (wanted === TYPED_BRAND) { const shown = shownOptionOf(entry); return !!shown && !shown.brandId && !!shown.brandName; }
      return wanted === "ALL" || (listCellText(entry, key) || BLANK) === wanted;
    });
    const filtered = groups.map((group) => ({ ...group, rows: group.rows.filter(keep) })).filter((group) => group.rows.length > 0);
    if (!listSort) return filtered;
    const sign = listSort.direction === "asc" ? 1 : -1;
    const compare = (a: string, b: string) => {
      if (!a !== !b) return a ? -1 : 1; // blanks always last
      return sign * a.localeCompare(b, "id-ID", { numeric: true, sensitivity: "base" });
    };
    if (listSort.key === "category") return [...filtered].sort((a, b) => compare(a.category, b.category));
    return filtered.map((group) => ({ ...group, rows: [...group.rows].sort((a, b) => compare(listCellText(a, listSort.key), listCellText(b, listSort.key))) }));
  }, [groups, listFilters, listSort]);
  const listFilterOptions = (key: ListFilterKey) => {
    const values = [...new Set(sectionEntries.map((entry) => listCellText(entry, key) || BLANK))]
      .sort((a, b) => (a === BLANK ? 1 : b === BLANK ? -1 : a.localeCompare(b, "id-ID", { numeric: true })));
    return [{ id: "ALL", label: "All" }, ...(key === "brand" ? [{ id: TYPED_BRAND, label: "Not in Master Data (typed)" }] : []), ...values.map((value) => ({ id: value, label: value === BLANK ? "(blank)" : value }))];
  };
  const sortHead = (key: ListSortKey, label: string) => (
    <SortToggle
      direction={listSort?.key === key ? listSort.direction : null}
      onChange={(direction) => setListSort({ key, direction })}
      label={(direction) => `Sort by ${label}, ${direction === "asc" ? "A to Z" : "Z to A"}`}
    >
      {label}
    </SortToggle>
  );

  const categoriesBySection = useMemo(() => ({
    MATERIAL: [...new Set(entries.filter((e) => e.section === "MATERIAL").map((e) => e.category))],
    FIXTURE: [...new Set(entries.filter((e) => e.section === "FIXTURE").map((e) => e.category))],
  }), [entries]);
  const categories = categoriesBySection[section];
  const open = entries.find((entry) => entry.id === openId) ?? null;
  const visibleIds = useMemo(() => new Set(visibleEntries.map((entry) => entry.id)), [visibleEntries]);
  // Only rows still in view count: switching filter or section never deletes something the user cannot see.
  const pickedIds = useMemo(() => [...selectedIds].filter((id) => visibleIds.has(id)), [selectedIds, visibleIds]);
  const toggleSelected = (id: string) => setSelectedIds((current) => { const next = new Set(current); if (!next.delete(id)) next.add(id); return next; });
  const stopSelecting = () => { setSelecting(false); setSelectedIds(new Set()); };
  const allPicked = visibleEntries.length > 0 && pickedIds.length === visibleEntries.length;
  const toggleAllVisible = () => setSelectedIds(allPicked ? new Set() : new Set(visibleEntries.map((entry) => entry.id)));
  const visibleOpenIndex = open ? visibleEntries.findIndex((entry) => entry.id === open.id) : -1;

  const askDiscard = async () => {
    if (!editorDirtyRef.current) return true;
    return confirm.confirm({
      title: "Discard changes?",
      description: "You have unsaved changes in this item.",
      confirmLabel: "Discard changes",
      cancelLabel: "Keep editing",
      tone: "danger",
    });
  };
  const closeEditor = async () => {
    if (!(await askDiscard())) return;
    editorDirtyRef.current = false;
    setOpenId(null);
    setAutoPhotoOptionId(null);
  };
  const changeSection = async (next: Section) => {
    if (next === section || !(await askDiscard())) return;
    editorDirtyRef.current = false;
    setOpenId(null);
    setAutoPhotoOptionId(null);
    setFilter("all");
    setListFilters(NO_LIST_FILTERS);
    setSection(next);
  };
  const navigateEntry = async (id: string) => {
    if (id === openId || !(await askDiscard())) return;
    editorDirtyRef.current = false;
    openEntry(id);
  };

  const startSelecting = async () => {
    if (open && !(await askDiscard())) return;
    editorDirtyRef.current = false;
    setOpenId(null);
    setAutoPhotoOptionId(null);
    setSelecting(true);
  };

  const removeSelected = async () => {
    const count = pickedIds.length;
    if (!count) return;
    const ok = await confirm.confirm({
      title: `Delete ${count} item${count === 1 ? "" : "s"}?`,
      description: `The ${count === 1 ? "item" : "items"} and all ${count === 1 ? "its" : "their"} options are removed. This can't be undone. Other codes stay as they are.`,
      confirmLabel: `Delete ${count} item${count === 1 ? "" : "s"}`,
      cancelLabel: "Keep items",
      tone: "danger",
    });
    if (!ok) return;
    if (await run("bulk-delete", () => deleteScheduleEntriesAction({ projectId, entryIds: pickedIds }))) {
      setNotice(`${count} item${count === 1 ? "" : "s"} deleted.`);
      stopSelecting();
    }
  };

  const removeEntry = async (entry: ScheduleEntryView) => {
    const ok = await confirm.confirm({
      title: `Delete ${entry.code}?`,
      description: `The item and all its options are removed. Other codes stay as they are; ${entry.code} is left empty.`,
      confirmLabel: "Delete item",
      tone: "danger",
    });
    if (!ok) return;
    if (await run(`${entry.id}-delete`, () => deleteScheduleEntryAction({ projectId, entryId: entry.id }))) setOpenId(null);
  };

  const applyTemplates = async () => {
    setNotice(null);
    const ok = await confirm.confirm({
      title: "Apply studio templates?",
      description: "Every active studio template item this project does not have yet is added, as a proposal (not final). Items already here are not changed.",
      confirmLabel: "Apply templates",
    });
    if (!ok) return;
    await run("templates", () => applyScheduleTemplatesAction({ projectId }), (data) => {
      const created = data && typeof data === "object" && "created" in data && typeof data.created === "number" ? data.created : 0;
      setNotice(created === 0 ? "Nothing to add: this project already has every studio template item." : `${created} template item${created === 1 ? "" : "s"} added.`);
    });
  };

  /** Reorder within one category group (one code prefix); drag targets never span groups. */
  const reorderGroup = (rows: ScheduleEntryView[], draggedId: string, targetId: string) => {
    if (draggedId === targetId) return;
    // The server reorders a whole category, so rows out of view (hidden ones) keep their place in the list sent.
    const ids = sectionEntries.filter((entry) => entry.category === rows[0]?.category).map((entry) => entry.id);
    const from = ids.indexOf(draggedId);
    if (from === -1 || !ids.includes(targetId)) return;
    ids.splice(from, 1);
    // Recompute the target's index after removing the dragged item — its position
    // shifted left by one for a forward drag, so reusing the pre-removal index here
    // would insert one slot past the intended drop target.
    const to = ids.indexOf(targetId);
    if (to === -1) return;
    ids.splice(to, 0, draggedId);
    const prefix = rows[0]?.code.split("-")[0];
    if (!prefix) return;
    void run(`reorder-${prefix}`, () => reorderScheduleEntriesAction({ projectId, section, prefix, orderedIds: ids }));
  };

  const inspectorItem = open && !selecting ? open : null;
  const bulkOpen = selecting && pickedIds.length > 0;

  return (
    <div className="flex min-w-0 flex-col lg:min-h-0 lg:flex-1">
      {/* Toolbar: on wide screens it never scrolls; only the board and the inspector below it do (owner, 2026-10-22). */}
      <div className="sticky top-0 z-20 grid shrink-0 gap-2.5 border-b border-line-subtle bg-surface px-(--ui-section-px) py-2.5 lg:static">
        <div className="flex flex-wrap items-center gap-2">
          {/* changeSection reads the draft ref only when this browser event fires; passing it through the shared tab contract keeps the existing discard guard intact. */}
          {/* eslint-disable-next-line react-hooks/refs */}
          <PillTabs label="Schedule section" items={(["MATERIAL", "FIXTURE"] as const).map((key) => ({ key, label: SECTION_LABEL[key], active: section === key, count: counts[key], onSelect: changeSection.bind(null, key) }))} />
          <PillTabs label="Schedule view" items={[{ key: "board", label: "Board", active: viewMode === "board", onSelect: () => setViewMode("board") }, { key: "list", label: "List", active: viewMode === "list", onSelect: () => setViewMode("list") }]} />
          <label className="flex h-(--ui-control-height-sm) w-full items-center gap-2 rounded-control border border-line bg-surface px-2.5 text-ink-tertiary focus-within:border-line-focus sm:w-60">
            <Search aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
            <span className="sr-only">Search items</span>
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search code, type, brand…" className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-ink-tertiary focus:outline-none" />
          </label>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {canEdit && sectionEntries.length > 0 ? (
              selecting
                ? <Button size="sm" variant="secondary" leadingIcon={<SquareCheck className="h-3.5 w-3.5" />} onClick={stopSelecting}>Done selecting</Button>
                : <Button size="sm" variant="ghost" leadingIcon={<SquareCheck className="h-3.5 w-3.5" />} onClick={() => void startSelecting()}>Select</Button>
            ) : null}
            <Link
              prefetch={false}
              target="_blank"
              href={STUDIOFLOW_ROUTES.projectSchedulePrint(projectId)}
              onClick={(event) => {
                // With hidden items in the project, ask each time whether they are printed (owner, 2026-10-23).
                if (!entries.some((entry) => entry.hidden)) return;
                event.preventDefault();
                setPrintAsk(true);
              }}
              className="inline-flex min-h-(--ui-control-height-sm) items-center gap-1.5 rounded-control border border-line bg-surface px-2.5 text-xs font-medium text-ink hover:border-line-strong"
            >
              <Printer aria-hidden="true" className="h-3.5 w-3.5" /> Print / PDF
            </Link>
            {canEdit || canManageTemplates ? <ButtonMenu label="Set up" variant="secondary" items={[
              ...(canEdit ? [
                { label: "Apply studio templates", onSelect: () => void applyTemplates() },
                { label: "Import CSV", onSelect: () => setDialog("import") },
              ] : []),
              ...(canManageTemplates ? [{ label: "Schedule templates", onSelect: () => router.push(templatesHref) }] : []),
            ]} /> : null}
            {canEdit ? (
              <Button size="sm" variant="primary" leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setDialog("add")}>
                Add item
              </Button>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex items-center gap-2.5">
            <span className="whitespace-nowrap text-sm font-medium text-ink">{progress.final} of {progress.all} final</span>
            <ProgressBar value={progress.final} max={progress.all} label={`${progress.final} of ${progress.all} final`} className="!w-28 shrink-0" />
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Schedule progress filter">
            <FilterChip selected={filter === "all"} count={progress.all} onClick={() => setFilter("all")}>All</FilterChip>
            <FilterChip selected={filter === "decision"} count={progress.decision} onClick={() => setFilter("decision")}>Needs a decision</FilterChip>
            <FilterChip selected={filter === "sample"} count={progress.sample} onClick={() => setFilter("sample")}>Sample waiting</FilterChip>
            <FilterChip selected={filter === "empty"} count={progress.empty} onClick={() => setFilter("empty")}>No product yet</FilterChip>
          </div>
          {hiddenCount > 0 || visibility !== "visible" ? (
            <Select aria-label="Hidden items" className="!h-8 !w-auto text-xs" value={visibility} onChange={(event) => setVisibility(event.target.value as Visibility)}>
              <option value="visible">Hidden items: off ({hiddenCount})</option>
              <option value="all">Show hidden</option>
              <option value="hidden">Hidden only</option>
            </Select>
          ) : null}
          {highlightedCount > 0 || highlightFilter !== "ALL" ? (
            <Select aria-label="Highlight colour" className="!h-8 !w-auto text-xs" value={highlightFilter} onChange={(event) => setHighlightFilter(event.target.value as HighlightFilter)}>
              <option value="ALL">All colours</option>
              <option value="any">Any highlight</option>
              {SCHEDULE_HIGHLIGHTS.map((highlight) => <option key={highlight} value={highlight}>{HIGHLIGHT_LABEL[highlight]}</option>)}
            </Select>
          ) : null}
          {viewMode === "list" ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <TableFilters
                resultLabel={`${listGroups.reduce((total, group) => total + group.rows.length, 0)} of ${progress.all} items`}
                filters={(Object.keys(LIST_FILTER_LABEL) as ListFilterKey[]).filter((key) => key !== "contact" || showContact).map((key) => ({
                  id: key,
                  label: key === "category" && section === "FIXTURE" ? "Category" : LIST_FILTER_LABEL[key],
                  value: listFilters[key],
                  defaultValue: "ALL",
                  options: listFilterOptions(key),
                  onValueChange: (value: string) => setListFilters((current) => ({ ...current, [key]: value })),
                }))}
              />
              <Button size="sm" variant="ghost" aria-pressed={showContact} leadingIcon={showContact ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />} onClick={toggleContact}>
                {showContact ? "Hide Contact" : "Show Contact"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setCollapsedGroups(collapsedGroups.size > 0 ? new Set() : new Set(listGroups.map((group) => group.category)))}>
                {collapsedGroups.size > 0 ? "Expand all" : "Collapse all"}
              </Button>
              {listSort ? (
                <FilterChip selected aria-label="Back to the studio order" onClick={() => setListSort(null)}>
                  Sorted · studio order<X size={12} aria-hidden="true" />
                </FilterChip>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* Narrow screens have no inspector column: bulk actions sit in a bar instead. */}
      {selecting ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-subtle bg-surface-muted px-(--ui-section-px) py-2 lg:hidden" role="region" aria-label="Bulk actions">
          <div className="flex items-center gap-3 text-sm">
            <span className="font-medium text-ink" role="status">{pickedIds.length} selected</span>
            <Button size="sm" variant="ghost" onClick={toggleAllVisible}>{allPicked ? "Clear selection" : `Select all ${visibleEntries.length}`}</Button>
          </div>
          <Button size="sm" variant="ghost" leadingIcon={<Copy className="h-3.5 w-3.5" />} disabled={pickedIds.length === 0} onClick={() => void copyRows(visibleEntries.filter((entry) => selectedIds.has(entry.id)))}>Copy rows</Button>
          <Button size="sm" variant="danger" leadingIcon={<Trash2 className="h-3.5 w-3.5" />} disabled={pickedIds.length === 0} pending={command.pendingKeys.includes("bulk-delete")} onClick={() => void removeSelected()}>Delete{pickedIds.length ? ` ${pickedIds.length}` : ""}</Button>
        </div>
      ) : null}

      <div className="flex min-w-0 lg:min-h-0 lg:flex-1">
        <div className={`min-w-0 flex-1 lg:overscroll-contain ${viewMode === "list" ? "overflow-x-auto lg:overflow-auto" : "lg:overflow-y-auto"}`}>
          {error && !open && !dialog ? <InlineError className="px-(--ui-section-px) pt-2">{error}</InlineError> : null}
          {notice ? <Text size="sm" tone="secondary" role="status" className="px-(--ui-section-px) pt-2">{notice}</Text> : null}
          {groups.length === 0 ? (
            <div className="grid">
              <EmptyState
                title={progress.all === 0 ? `No ${SECTION_LABEL[section].toLowerCase()} items yet` : needle ? `Nothing matches "${query.trim()}"` : "No items match this filter"}
                description={progress.all === 0 && canEdit ? "Start a category below, add an item, apply the studio templates, or import the Google Sheets schedule." : progress.all === 0 ? "This project has no schedule items in this section." : needle ? "Try another word, or clear the search." : "Choose another progress filter to see more items."}
                className="py-10"
              />
              {progress.all === 0 && canEdit ? <NewCategoryInline command={command} projectId={projectId} section={section} categories={[]} categoryChoices={categoryChoices} className="mb-8 justify-self-center" /> : null}
            </div>
          ) : (
            <>
                {viewMode === "board" ? (
                  <BoardView
                    projectId={projectId}
                    groups={groups}
                    command={command}
                    onOpen={(id) => openEntry(id)}
                    canEdit={canEdit}
                    filter={filter}
                    section={section}
                    onReorder={reorderGroup}
                    onDelete={(entry) => void removeEntry(entry)}
                    menuItems={(entry) => [...copyItems(entry), ...sampleItems(entry), ...markItems([entry])]}
                    categoryChoices={categoryChoices}
                    openId={openId}
                    selecting={selecting}
                    selectedIds={selectedIds}
                    onToggle={toggleSelected}
                  />
                ) : (
                  // Columns follow the studio's Google Sheet (WO-SF-SCHEDULE-SHEET-01). The heading row stays
                  // put while the rows scroll; narrow screens scroll the whole list sideways.
                  <div className={`grid ${showContact ? "min-w-[1240px]" : "min-w-[1100px]"}`}>
                    <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-surface px-(--ui-section-px) py-1.5 text-micro uppercase tracking-[0.06em] text-ink-tertiary">
                      {selecting ? <span className="w-5 shrink-0" /> : null}
                      <span className="w-16 shrink-0">{sortHead("code", "Code")}</span>
                      <span className="w-28 shrink-0">{sortHead("category", section === "MATERIAL" ? "Material type" : "Category")}</span>
                      <span className="w-32 shrink-0">{sortHead("brand", "Ex")}</span>
                      {/* Type and Initials type are the same kind of fact (one replaces the other), so they share the width equally. */}
                      <span className="min-w-40 flex-1 basis-0">{sortHead("type", "Type")}</span>
                      <span className="min-w-40 flex-1 basis-0">{sortHead("initials", "Initials type")}</span>
                      <span className="w-11 shrink-0">Image</span>
                      <span className="w-44 shrink-0">{sortHead("location", "Location")}</span>
                      {showContact ? <span className="w-32 shrink-0">{sortHead("contact", "Contact")}</span> : null}
                      {section === "FIXTURE" ? <span className="w-20 shrink-0 text-right">{sortHead("qty", "Qty")}</span> : null}
                      <span className="w-28 shrink-0">{sortHead("status", "Status")}</span>
                      <span className="w-8 shrink-0" />
                    </div>
                    {listGroups.length === 0 ? <EmptyState title="No items match these filters" description="Clear a column filter to see more items." className="py-10" /> : null}
                    {listGroups.map((group) => {
                      const collapsed = collapsedGroups.has(group.category) && !group.rows.some((row) => row.id === openId);
                      return (
                      <section key={group.category} className="border-b border-line-subtle last:border-b-0">
                        <h3 className="m-0 bg-surface-muted">
                          <button
                            type="button"
                            aria-expanded={!collapsed}
                            onClick={() => toggleGroup(group.category)}
                            className="flex w-full items-center gap-2 px-(--ui-section-px) py-1.5 text-left [&:hover_span]:text-ink focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-line-focus"
                          >
                            {collapsed ? <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 text-ink-tertiary" /> : <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 text-ink-tertiary" />}
                            <span className="text-label text-ink-secondary">{group.category}</span>
                            <Text as="span" size="sm" tone="tertiary">{group.rows.length}</Text>
                          </button>
                        </h3>
                        <ul hidden={collapsed} className="m-0 list-none divide-y divide-line-subtle p-0">
                          {group.rows.map((entry, index) => {
                            const shown = shownOptionOf(entry);
                            const busy = command.pendingKeys.some((key) => key.startsWith(entry.id));
                            // One action list for the row's … menu and its right-click menu, as on the Board.
                            const rowItems = !selecting ? [
                              { label: "Open", onSelect: () => openEntry(entry.id) },
                              ...copyItems(entry),
                              ...sampleItems(entry),
                              ...markItems([entry]),
                              ...(canManageTemplates && templateSourceOf(entry)
                                ? [{ label: "Save as template item", separatorBefore: true, onSelect: () => void run(`${entry.id}-template`, () => saveScheduleEntryAsTemplateAction({ projectId, entryId: entry.id })) }]
                                : []),
                              ...(canEdit ? [
                                { label: "Move up", icon: <ArrowUp className="h-3.5 w-3.5" />, disabled: !listManual || index === 0, separatorBefore: true, onSelect: () => void run(`${entry.id}-move`, () => moveScheduleEntryAction({ projectId, entryId: entry.id, direction: "up" })) },
                                { label: "Move down", icon: <ArrowDown className="h-3.5 w-3.5" />, disabled: !listManual || index === group.rows.length - 1, onSelect: () => void run(`${entry.id}-move`, () => moveScheduleEntryAction({ projectId, entryId: entry.id, direction: "down" })) },
                                { label: "Move to category…", onSelect: () => setDialog({ move: entry }) },
                                { label: "Delete", danger: true, separatorBefore: true, onSelect: () => void removeEntry(entry) },
                              ] : []),
                            ] : [];
                            return (
                              <ContextActionMenu key={entry.id} items={rowItems}>
                              <li
                                id={`schedule-entry-${entry.id}`}
                                draggable={canEdit && listManual && !selecting}
                                onDragStart={listDrag.start(entry.id)}
                                onDragEnd={listDrag.end}
                                onDragOver={listDrag.over(entry.id, canEdit && listManual)}
                                onDragLeave={listDrag.leave(entry.id)}
                                onDrop={(event) => {
                                  event.preventDefault();
                                  if (listDrag.draggingId) reorderGroup(group.rows, listDrag.draggingId, entry.id);
                                  listDrag.end();
                                }}
                                style={rowHighlightStyle(entry.highlight)}
                                className={`flex items-center gap-3 px-(--ui-section-px) py-2.5 ${selecting && selectedIds.has(entry.id) ? "outline-2 outline-offset-[-2px] outline-line-focus" : ""} ${entry.hidden ? "opacity-55" : ""} ${canEdit && listManual ? "cursor-grab active:cursor-grabbing" : ""} ${rowHighlightClass(entry.highlight, open?.id === entry.id)} ${listDrag.draggingId === entry.id ? "opacity-40" : ""} ${listDrag.dragOverId === entry.id && listDrag.draggingId && listDrag.draggingId !== entry.id ? "outline-2 outline-dashed outline-offset-[-2px] outline-line-focus" : ""}`}
                              >
                                {selecting ? <Checkbox checked={selectedIds.has(entry.id)} onCheckedChange={() => toggleSelected(entry.id)} label={<span className="sr-only">Select {entry.code}</span>} /> : null}
                                <button type="button" onClick={() => (selecting ? toggleSelected(entry.id) : openEntry(entry.id))} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                                  <span className="w-16 shrink-0 font-ui-mono text-sm font-semibold tabular-nums text-ink">{entry.code}</span>
                                  <span className="w-28 shrink-0 line-clamp-2 text-sm text-ink-secondary">{entry.category}</span>
                                  <span className="w-32 shrink-0 line-clamp-2 text-sm text-ink-secondary">{shown?.brandName ?? ""}</span>
                                  <span className="min-w-40 flex-1 basis-0 line-clamp-2 text-sm font-medium text-ink">
                                    {shown ? shown.productName : <span className="font-normal italic text-ink-tertiary">Reserved — no product yet</span>}
                                  </span>
                                  <span className="min-w-40 flex-1 basis-0 line-clamp-2 text-sm text-ink-secondary">{shown ? initialsOf(shown) : ""}</span>
                                  <Thumb url={shown?.imageUrl ?? null} alt={shown ? shown.productName : `${entry.code} has no photo`} />
                                  <span className="w-44 shrink-0 line-clamp-2 text-sm text-ink-secondary" title={entry.location ?? undefined}>{entry.location ?? ""}</span>
                                  {showContact ? <span className="w-32 shrink-0 line-clamp-2 text-sm text-ink-secondary" title={shown?.contact ?? undefined}>{shown?.contact ?? ""}</span> : null}
                                  {section === "FIXTURE" ? <span className="w-20 shrink-0 text-right text-sm tabular-nums text-ink-secondary">{entry.qty ? `${entry.qty} ${entry.unit ?? ""}` : ""}</span> : null}
                                  <span className="flex w-28 shrink-0 flex-wrap gap-1">{entryBadges(entry).map((badge) => <Badge key={badge.label} tone={badge.tone}>{badge.label}</Badge>)}</span>
                                </button>
                                {rowItems.length > 0 ? <RowActionMenu label={`Actions for ${entry.code}`} pending={busy} items={rowItems} /> : null}
                              </li>
                              </ContextActionMenu>
                            );
                          })}
                        </ul>
                      </section>
                      );
                    })}
                  </div>
                )}
            </>
          )}
        </div>

        {/* The inspector: docked to the right edge on wide screens, always there, with its own scroll (owner, 2026-10-22).
            On narrow screens it only appears, full screen, while one item is open. */}
        <aside
          aria-label={inspectorItem ? `Edit ${inspectorItem.code}` : bulkOpen ? "Selected items" : "Inspector"}
          onKeyDown={(event) => { if (event.key === "Escape" && inspectorItem && !event.defaultPrevented) void closeEditor(); }}
          className={`${inspectorItem ? "fixed inset-0 z-40 flex" : "hidden"} min-h-0 flex-col bg-surface lg:static lg:z-auto lg:flex lg:w-[24rem] lg:shrink-0 lg:border-l lg:border-line-subtle xl:w-[26rem]`}
        >
          {inspectorItem ? (
            <DockedEntryPanel
              key={inspectorItem.id}
              projectId={projectId}
              entry={inspectorItem}
              brands={brands}
              canEdit={canEdit}
              command={command}
              confirm={confirm.confirm}
              canManageTemplates={canManageTemplates}
              categories={categories}
              previousId={visibleOpenIndex > 0 ? visibleEntries[visibleOpenIndex - 1]?.id ?? null : null}
              nextId={visibleOpenIndex >= 0 ? visibleEntries[visibleOpenIndex + 1]?.id ?? null : null}
              onNavigate={(id) => void navigateEntry(id)}
              onMove={() => setDialog({ move: inspectorItem })}
              onDelete={() => void removeEntry(inspectorItem)}
              onClose={() => void closeEditor()}
              onDirtyChange={(dirty) => { editorDirtyRef.current = dirty; }}
              initialPhotoOptionId={autoPhotoOptionId}
            />
          ) : bulkOpen ? (
            <BulkPanel
              picked={visibleEntries.filter((entry) => selectedIds.has(entry.id))}
              total={visibleEntries.length}
              allPicked={allPicked}
              onToggleAll={toggleAllVisible}
              onClear={() => setSelectedIds(new Set())}
              onDelete={() => void removeSelected()}
              onCopy={() => void copyRows(visibleEntries.filter((entry) => selectedIds.has(entry.id)))}
              marks={markItems(visibleEntries.filter((entry) => selectedIds.has(entry.id)))}
              brandLinks={brandLinksFor(visibleEntries.filter((entry) => selectedIds.has(entry.id)))}
              deleting={command.pendingKeys.includes("bulk-delete")}
            />
          ) : (
            <div className="grid flex-1 place-content-center justify-items-center gap-2 p-8 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-control bg-surface-muted text-ink-secondary"><LayoutGrid aria-hidden="true" className="h-5 w-5" /></span>
              <Text weight="semibold">{selecting ? "Tick the items to act on" : "Pick an item to edit it here"}</Text>
              <Text size="sm" tone="secondary" className="max-w-64">{selecting ? "What you can do with them shows here. Done selecting goes back to editing." : "The board stays in view while you edit. Select acts on several items at once."}</Text>
            </div>
          )}
        </aside>
      </div>

      {dialog === "add" ? (
        <AddItemDrawer projectId={projectId} section={section} categoriesBySection={categoriesBySection} categoryChoices={categoryChoices} brands={brands} command={command} confirm={confirm.confirm} onClose={() => setDialog(null)} />
      ) : null}
      {sampleTarget ? (
        <Dialog open onOpenChange={(open) => { if (!open) setSampleTarget(null); }} title={`Request sample · ${sampleTarget.code} option ${sampleTarget.option.label}`} size="sm">
          <InlineSampleRequest projectId={projectId} option={sampleTarget.option} command={command} onClose={() => setSampleTarget(null)} />
        </Dialog>
      ) : null}
      <Dialog
        open={printAsk}
        onOpenChange={setPrintAsk}
        title="Include hidden items?"
        description={`${entries.filter((entry) => entry.hidden).length} hidden item(s) in this schedule. Hidden items are left out of the print unless you include them.`}
        size="sm"
        footer={<><Button variant="ghost" onClick={() => openPrint(true)}>Include hidden</Button><Button variant="primary" onClick={() => openPrint(false)}>Leave them out</Button></>}
      >
        {null}
      </Dialog>
      {dialog === "import" ? <ImportDialog projectId={projectId} section={section} command={command} onClose={() => setDialog(null)} /> : null}
      {dialog && typeof dialog === "object" ? (
        <MoveDialog projectId={projectId} entry={dialog.move} categories={categories} command={command} onClose={() => setDialog(null)} />
      ) : null}
      {confirm.dialog}
    </div>
  );
}
