"use client";

import { Minus, MousePointer2, Plus, StickyNote, Type, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

import { Button, EmptyState, IconButton, InlineError, Notice, RichTextEditor, Text, useConfirm, useFileIntake } from "@/platform/ui_engine";

import type { WorkspaceCommandInput } from "../../../actions";
import { NOTE_MAX } from "../../../_components/phase-note-composer";
import { CardComposer, WORKSPACE_FILE_ACCEPT, WorkspaceCard, runWorkspaceCommand, uploadBoardFiles, type LabelChoices, type PhaseOption, type RunCommand, type WorkspaceCardView } from "./card";
import { DEFAULT_CARD_W, ESTIMATED_CARD_H, MIN_CARD_W, boardExtent, layoutElements, snapMove, snapToGrid, type CardSlot, type Rect } from "./geometry";

type Filter = "all" | "general" | "phase" | "starred" | "feedback";
type View = { x: number; y: number; zoom: number };
type Tool = "select" | "text" | "sticky";
type Draft = CardSlot & { textStyle: "PLAIN" | "STICKY" };
type Drag =
  | { kind: "move"; ids: string[]; dx: number; dy: number; guideX: number | null; guideY: number | null }
  | { kind: "width"; id: string; w: number }
  | { kind: "pan" };

const DEFAULT_VIEW: View = { x: 24, y: 16, zoom: 1 };
/** Elements never shrink below the size their text is written at (owner, 2026-10-13); they can only be enlarged. */
const MIN_ZOOM = 1;
const MAX_ZOOM = 2;
const MINIMAP_W = 168;
const clampZoom = (zoom: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
const isFeedback = (card: WorkspaceCardView) => card.origin === "CLIENT_ANSWER";
const isEditable = (target: EventTarget | null) => target instanceof HTMLElement && !!target.closest("input, textarea, select, [contenteditable=true]");

/**
 * The project Workspace as one board of standalone elements (WO-SF-WORKSPACE-04, owner-accepted concept 2026-10-13):
 * text (plain, heading, sticky note), images and files sit anywhere on it. Click an element to select it (Shift adds
 * more), press and drag to move everything selected, click a text again to write in it. Click empty board with the
 * Text or Sticky tool, or double-click it, to write there; paste or drop images and files anywhere. Drag empty board
 * (or middle-click, or Space + drag) to move around; zoom only enlarges, and the overview map jumps anywhere.
 * Layout is last-write-wins and never makes someone's text edit stale. Below 768 px the elements read top to bottom.
 */
export function WorkspaceCanvas({ projectId, projectName, elements: board, phases, selectedPhase, readOnlyReason, canEditGeneral, writablePhaseIds, canUseIdeas, drawingList }: {
  projectId: string;
  projectName: string;
  elements: WorkspaceCardView[];
  phases: readonly PhaseOption[];
  selectedPhase: { id: string; name: string } | null;
  readOnlyReason: "archived" | "inactive" | "permission" | null;
  canEditGeneral: boolean;
  writablePhaseIds: readonly string[];
  canUseIdeas: boolean;
  /** The selected phase's Drawing list, offered as a second lens when the phase has one. */
  drawingList?: ReactNode;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const viewportRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Optimistic places and removals, dropped whenever the server sends the board again.
  const [received, setReceived] = useState(board);
  const [overrides, setOverrides] = useState<Record<string, CardSlot>>({});
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  if (received !== board) { setReceived(board); setOverrides({}); setHidden(new Set()); }

  const [heights, setHeights] = useState<ReadonlyMap<string, number>>(new Map());
  const [view, setView] = useState<View>(DEFAULT_VIEW);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set());
  const [tool, setTool] = useState<Tool>("select");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [round, setRound] = useState<string | null>(null);
  const [composer, setComposer] = useState(false);
  const [lens, setLens] = useState<"workspace" | "drawings">("workspace");
  const [error, setError] = useState<string | null>(null);
  const [narrow, setNarrow] = useState(false);
  const spaceDown = useRef(false);
  const ignoreClick = useRef(false);
  const composerRef = useRef<HTMLDivElement>(null);

  // Quick capture opens ready to type: the editor loads on demand, so focus it once it is there.
  useEffect(() => {
    if (!composer) return;
    let tries = 0;
    const timer = window.setInterval(() => {
      const editor = composerRef.current?.querySelector<HTMLElement>("[contenteditable=true]");
      if (editor) { editor.focus(); window.clearInterval(timer); } else if (++tries > 40) window.clearInterval(timer);
    }, 50);
    return () => window.clearInterval(timer);
  }, [composer]);

  // ── Rights ───────────────────────────────────────────────────────────
  const writable = useMemo(() => new Set(writablePhaseIds), [writablePhaseIds]);
  const canWriteCard = useCallback((card: WorkspaceCardView) => (card.phaseId ? writable.has(card.phaseId) : canEditGeneral), [writable, canEditGeneral]);
  const labelChoices: LabelChoices = useMemo(() => ({ allowNone: canEditGeneral, phases: phases.filter((phase) => writable.has(phase.id)) }), [canEditGeneral, phases, writable]);
  const canCreate = canEditGeneral || labelChoices.phases.length > 0;
  const limited = !readOnlyReason && !canEditGeneral && labelChoices.phases.length > 0;
  const newBlockPhase = selectedPhase && labelChoices.phases.some((phase) => phase.id === selectedPhase.id) ? selectedPhase.id : labelChoices.allowNone ? null : labelChoices.phases[0]?.id ?? null;

  // ── View (pan and zoom are personal: this browser only) ─────────────
  const viewKey = `studioflow.workspace.view.${projectId}`;
  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const sync = () => setNarrow(media.matches);
    // Read after hydration, so the server and the browser render the same page first.
    const timer = window.setTimeout(() => {
      try { const saved = JSON.parse(window.localStorage.getItem(viewKey) ?? "null"); if (saved && typeof saved.zoom === "number") setView({ ...saved, zoom: clampZoom(saved.zoom) }); } catch { /* default view */ }
      sync();
    }, 0);
    media.addEventListener("change", sync);
    return () => { window.clearTimeout(timer); media.removeEventListener("change", sync); };
  }, [viewKey]);
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
    const timer = window.setTimeout(() => {
      try { window.localStorage.setItem(viewKey, JSON.stringify(view)); } catch { /* kept for this visit only */ }
    }, 150);
    return () => window.clearTimeout(timer);
  }, [view, viewKey]);

  // ── Board model: server data + optimistic places, laid out ──────────
  const elements = useMemo(() => board
    .filter((card) => !hidden.has(card.id))
    .map((card) => (overrides[card.id] ? { ...card, canvas: overrides[card.id]! } : card)), [board, overrides, hidden]);
  const byId = useMemo(() => new Map(elements.map((card) => [card.id, card])), [elements]);
  const layout = useMemo(() => layoutElements(elements, heights), [elements, heights]);
  const heightOf = useCallback((id: string) => heights.get(id) ?? ESTIMATED_CARD_H, [heights]);

  // ── Measuring element heights (they follow their content) ───────────
  const observer = useRef<ResizeObserver | null>(null);
  const measuredNodes = useRef(new Map<string, HTMLElement>());
  useEffect(() => {
    observer.current = new ResizeObserver((entries) => {
      setHeights((current) => {
        let next: Map<string, number> | null = null;
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.cardId;
          const height = Math.round((entry.target as HTMLElement).offsetHeight);
          if (id && Math.abs((current.get(id) ?? 0) - height) > 1) { next ??= new Map(current); next.set(id, height); }
        }
        return next ?? current;
      });
    });
    for (const element of measuredNodes.current.values()) observer.current.observe(element);
    return () => observer.current?.disconnect();
  }, []);
  // Stable refs prevent pan/zoom renders from detaching and observing every element again.
  const measurements = useMemo(() => new Map(elements.map(({ id }) => [id, (element: HTMLElement | null) => {
    const previous = measuredNodes.current.get(id);
    if (previous) observer.current?.unobserve(previous);
    if (!element) { measuredNodes.current.delete(id); return; }
    element.dataset.cardId = id;
    measuredNodes.current.set(id, element);
    observer.current?.observe(element);
  }])), [elements]);

  // ── Commands ─────────────────────────────────────────────────────────
  const run: RunCommand = useCallback(async (input) => {
    setError(null);
    const result = await runWorkspaceCommand(input);
    // Successful actions already return the revalidated page in the same response.
    if (!result.ok && result.stale) router.refresh();
    return result;
  }, [router]);
  const act = async (input: WorkspaceCommandInput) => {
    const result = await run(input);
    if (!result.ok) { setError(result.message); setOverrides({}); setHidden(new Set()); }
    return result.ok;
  };

  /** Saves places. Unplaced elements are saved where they are drawn, so placing one element never moves another. */
  const place = (items: (CardSlot & { id: string })[]) => {
    const out = new Map(items.map((item) => [item.id, item]));
    for (const card of elements) {
      if (card.canvas || out.has(card.id)) continue;
      out.set(card.id, { id: card.id, ...layout.get(card.id)! });
    }
    const cards = [...out.values()].map((item) => ({ id: item.id, x: Math.max(0, Math.round(item.x)), y: Math.max(0, Math.round(item.y)), w: Math.max(MIN_CARD_W, Math.round(item.w)) }));
    setOverrides((current) => ({ ...current, ...Object.fromEntries(cards.map((item) => [item.id, { x: item.x, y: item.y, w: item.w }])) }));
    void act({ command: "placeItems", projectId, cards });
  };

  // ── Pointer gestures ────────────────────────────────────────────────
  const toWorld = (clientX: number, clientY: number) => {
    const rect = viewportRef.current!.getBoundingClientRect();
    const current = viewRef.current;
    return { x: (clientX - rect.left - current.x) / current.zoom, y: (clientY - rect.top - current.y) / current.zoom };
  };

  /** Follows the pointer until it is released. */
  const follow = (event: ReactPointerEvent, move: (e: PointerEvent) => void, end: () => void) => {
    event.preventDefault();
    event.stopPropagation();
    let frame: number | null = null;
    let latestMove: PointerEvent | null = null;
    const flush = () => { frame = null; if (latestMove) { move(latestMove); latestMove = null; } };
    const onMove = (e: PointerEvent) => { latestMove = e; frame ??= window.requestAnimationFrame(flush); };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); window.removeEventListener("pointercancel", onUp);
      if (frame !== null) window.cancelAnimationFrame(frame);
      flush();
      end();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const startPan = (event: ReactPointerEvent) => {
    const start = { x: event.clientX, y: event.clientY, view: viewRef.current };
    setDrag({ kind: "pan" });
    follow(event, (e) => setView({ ...start.view, x: start.view.x + e.clientX - start.x, y: start.view.y + e.clientY - start.y }), () => setDrag(null));
  };

  /** Selects an element and, when the pointer moves, moves it with everything else selected. */
  const pressElement = (card: WorkspaceCardView) => (event: ReactPointerEvent) => {
    // Dialog portals bubble through React's tree, but are outside the board's DOM.
    if (!event.currentTarget.contains(event.target as Node)) return;
    if (event.button === 1) { startPan(event); return; }
    if (event.button !== 0) return;
    viewportRef.current?.focus({ preventScroll: true });
    if (event.shiftKey) {
      setSelection((current) => { const next = new Set(current); if (next.has(card.id)) next.delete(card.id); else next.add(card.id); return next; });
      return;
    }
    const group = selection.has(card.id) ? [...selection] : [card.id];
    if (!selection.has(card.id)) setSelection(new Set([card.id]));
    // Controls inside an element only select it; an image itself can be pressed and dragged.
    if ((event.target as HTMLElement).closest("a, input, [role=menuitem], [role=checkbox], button:not([aria-label^='Open image'])")) return;
    const ids = group.filter((id) => { const item = byId.get(id); return item && canWriteCard(item); });
    if (!ids.includes(card.id)) return;
    const origin = new Map(ids.map((id) => [id, layout.get(id)!]));
    const lead = origin.get(card.id)!;
    const others: Rect[] = elements.filter((other) => !origin.has(other.id)).map((other) => ({ ...layout.get(other.id)!, h: heightOf(other.id) }));
    const start = { x: event.clientX, y: event.clientY };
    let live: Extract<Drag, { kind: "move" }> | null = null;
    let frame: number | null = null;
    // Not `follow`: a press without movement must still reach the element as a click (to start writing).
    const onMove = (e: PointerEvent) => {
      if (!live && Math.abs(e.clientX - start.x) + Math.abs(e.clientY - start.y) < 4) return;
      const zoom = viewRef.current.zoom;
      const rawX = lead.x + (e.clientX - start.x) / zoom;
      const rawY = lead.y + (e.clientY - start.y) / zoom;
      const snapped = ids.length === 1 ? snapMove({ w: lead.w, h: heightOf(card.id) }, rawX, rawY, others) : { x: Math.max(0, snapToGrid(rawX)), y: Math.max(0, snapToGrid(rawY)), guideX: null, guideY: null };
      live = { kind: "move", ids, dx: snapped.x - lead.x, dy: snapped.y - lead.y, guideX: snapped.guideX, guideY: snapped.guideY };
      frame ??= window.requestAnimationFrame(() => { frame = null; setDrag(live); });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); window.removeEventListener("pointercancel", onUp);
      if (frame !== null) window.cancelAnimationFrame(frame);
      if (!live) return;
      const moved = live;
      setDrag(null);
      ignoreClick.current = true;
      window.setTimeout(() => { ignoreClick.current = false; }, 0);
      if (moved.dx === 0 && moved.dy === 0) return;
      place(moved.ids.map((id) => { const slot = origin.get(id)!; return { id, x: Math.max(0, slot.x + moved.dx), y: Math.max(0, slot.y + moved.dy), w: slot.w }; }));
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const startWidth = (card: WorkspaceCardView) => (event: ReactPointerEvent) => {
    if (event.button !== 0) return;
    const slot = layout.get(card.id)!;
    const startX = event.clientX;
    let w = slot.w;
    setDrag({ kind: "width", id: card.id, w });
    follow(event, (e) => { w = Math.max(MIN_CARD_W, snapToGrid(slot.w + (e.clientX - startX) / viewRef.current.zoom)); setDrag({ kind: "width", id: card.id, w }); }, () => {
      setDrag(null);
      if (w !== slot.w) place([{ id: card.id, x: slot.x, y: slot.y, w }]);
    });
  };

  const spotAt = (clientX: number, clientY: number, w = DEFAULT_CARD_W): CardSlot => {
    const point = toWorld(clientX, clientY);
    return { x: Math.max(0, snapToGrid(point.x)), y: Math.max(0, snapToGrid(point.y)), w };
  };

  const onBoardPointerDown = (event: ReactPointerEvent) => {
    if (!event.currentTarget.contains(event.target as Node)) return;
    if ((event.target as HTMLElement).closest("article, [data-board-ui]")) return;
    if (event.button === 1 || (event.button === 0 && spaceDown.current)) { startPan(event); return; }
    if (event.button !== 0) return;
    viewportRef.current?.focus({ preventScroll: true });
    if (tool !== "select" && canCreate) {
      event.preventDefault();
      setDraft({ ...spotAt(event.clientX, event.clientY), textStyle: tool === "sticky" ? "STICKY" : "PLAIN" });
      setTool("select");
      return;
    }
    setSelection(new Set());
    startPan(event);
  };

  const onBoardDoubleClick = (event: ReactMouseEvent) => {
    if (!event.currentTarget.contains(event.target as Node)) return;
    if (!canCreate || (event.target as HTMLElement).closest("article, [data-board-ui]")) return;
    setDraft({ ...spotAt(event.clientX, event.clientY), textStyle: "PLAIN" });
  };

  // Wheel moves around (Shift + wheel sideways); Ctrl/Cmd + wheel, or a trackpad pinch, enlarges.
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      if ((event.target as HTMLElement).closest("[data-board-ui]")) return;
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      if (!event.ctrlKey && !event.metaKey) {
        const dx = event.shiftKey && !event.deltaX ? event.deltaY : event.deltaX;
        const dy = event.shiftKey && !event.deltaX ? 0 : event.deltaY;
        setView((current) => ({ ...current, x: current.x - dx, y: current.y - dy }));
        return;
      }
      setView((current) => {
        const zoom = clampZoom(current.zoom * (event.deltaY > 0 ? 0.9 : 1.1));
        const ox = event.clientX - rect.left, oy = event.clientY - rect.top;
        return { zoom, x: ox - ((ox - current.x) / current.zoom) * zoom, y: oy - ((oy - current.y) / current.zoom) * zoom };
      });
    };
    const noAutoscroll = (event: MouseEvent) => { if (event.button === 1) event.preventDefault(); };
    element.addEventListener("wheel", onWheel, { passive: false });
    element.addEventListener("mousedown", noAutoscroll);
    element.addEventListener("auxclick", noAutoscroll);
    const keyDown = (event: KeyboardEvent) => { if (event.code === "Space" && !isEditable(event.target)) spaceDown.current = true; };
    const keyUp = (event: KeyboardEvent) => { if (event.code === "Space") spaceDown.current = false; };
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    return () => {
      element.removeEventListener("wheel", onWheel);
      element.removeEventListener("mousedown", noAutoscroll);
      element.removeEventListener("auxclick", noAutoscroll);
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
    };
  }, [lens, narrow]);

  // The page does not scroll on a desktop (owner, 2026-10-13): the board fills the room left under the cards above
  // it, down to the page's bottom padding, and follows when that room changes (window size, an Undo bar appearing).
  const [fitHeight, setFitHeight] = useState<number | null>(null);
  const [boardWidth, setBoardWidth] = useState(1000);
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    // Looked up on every measure: while the page streams in, the board can sit outside its final scrolling area.
    const scrollArea = () => {
      let scroller: HTMLElement | null = element.parentElement;
      while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
      return scroller ?? document.documentElement;
    };
    let watched: Element | null = null;
    const measureRoom = () => {
      const area = scrollArea();
      const content = area.firstElementChild ?? area;
      if (content !== watched) { if (watched) resize.unobserve(watched); resize.observe(content); watched = content; }
      const top = element.getBoundingClientRect().top - area.getBoundingClientRect().top + area.scrollTop;
      const below = Math.max(0, area.scrollHeight - (top + element.offsetHeight));
      const next = Math.max(280, Math.floor(area.clientHeight - top - below));
      setFitHeight((current) => (current === next ? current : next));
      setBoardWidth((current) => (current === element.clientWidth ? current : element.clientWidth));
    };
    const resize = new ResizeObserver(() => measureRoom());
    resize.observe(document.documentElement);
    window.addEventListener("resize", measureRoom);
    const appear = new IntersectionObserver(measureRoom);
    appear.observe(element);
    const settle = [window.setTimeout(measureRoom, 0), window.setTimeout(measureRoom, 400)];
    return () => { resize.disconnect(); appear.disconnect(); settle.forEach((id) => window.clearTimeout(id)); window.removeEventListener("resize", measureRoom); };
  }, [lens, narrow]);

  const zoomBy = (factor: number) => setView((current) => {
    const element = viewportRef.current;
    const ox = (element?.clientWidth ?? 800) / 2, oy = (element?.clientHeight ?? 500) / 2;
    const zoom = clampZoom(current.zoom * factor);
    return { zoom, x: ox - ((ox - current.x) / current.zoom) * zoom, y: oy - ((oy - current.y) / current.zoom) * zoom };
  });

  // ── Paste, drop and upload: each file is its own element ────────────
  const lastPointer = useRef<{ x: number; y: number } | null>(null);
  const pointerSpot = (w = DEFAULT_CARD_W) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    const at = lastPointer.current ?? (rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 3 } : { x: 0, y: 0 });
    return spotAt(at.x, at.y, w);
  };
  const addFiles = async (files: File[], spot: CardSlot) => {
    if (files.length === 0) return;
    const { problems } = await uploadBoardFiles({ projectId, phaseId: newBlockPhase, place: spot, files });
    if (problems.length > 0) setError(problems.join(" "));
  };
  const intake = useFileIntake({ accept: `image/png,image/jpeg,image/webp,${WORKSPACE_FILE_ACCEPT}`, multiple: true, pasteFromPage: true, disabled: !canCreate || narrow || lens !== "workspace", onFiles: (files) => void addFiles(files, pointerSpot(240)) });
  const pickFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    event.target.value = "";
    const rect = viewportRef.current?.getBoundingClientRect();
    void addFiles(files, rect ? spotAt(rect.left + rect.width / 2 - 120, rect.top + rect.height / 3, 240) : { x: 32, y: 32, w: 240 });
  };

  /** Creates a text element; the board refreshes with it in place. */
  const createText = async (body: string, slot: CardSlot, textStyle: "PLAIN" | "STICKY" | "HEADING") => {
    const text = body.trim();
    if (!text) return;
    await act({ command: "createCard", projectId, phaseId: newBlockPhase, body: text.slice(0, NOTE_MAX), textStyle, x: slot.x, y: slot.y, w: slot.w });
  };

  // Plain text pasted on the board (not into a text) becomes a text element where the pointer is.
  const pasteRef = useRef<(event: ClipboardEvent) => void>(() => undefined);
  useEffect(() => {
    pasteRef.current = (event: ClipboardEvent) => {
      if (!canCreate || narrow || lens !== "workspace" || isEditable(event.target)) return;
      const data = event.clipboardData;
      if (!data || data.files.length > 0) return;
      const rect = viewportRef.current?.getBoundingClientRect();
      const at = lastPointer.current;
      if (!rect || !at || at.x < rect.left || at.x > rect.right || at.y < rect.top || at.y > rect.bottom) return;
      const text = data.getData("text/plain");
      if (!text.trim()) return;
      event.preventDefault();
      void createText(text, spotAt(at.x, at.y), "PLAIN");
    };
  });
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => pasteRef.current(event);
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);

  // ── Removing ────────────────────────────────────────────────────────
  const removeCards = async (cards: WorkspaceCardView[]) => {
    const targets = cards.filter(canWriteCard);
    if (targets.length === 0) return;
    const one = targets.length === 1;
    const ok = await confirm.confirm({
      title: one ? "Delete this element?" : `Delete ${targets.length} elements?`,
      description: "This cannot be undone.",
      confirmLabel: one ? "Delete" : `Delete ${targets.length}`,
      tone: "danger",
    });
    if (!ok) return;
    setHidden((current) => new Set([...current, ...targets.map((card) => card.id)]));
    setSelection(new Set());
    for (const card of targets) await act({ command: "deleteCard", projectId, cardId: card.id, version: card.version });
  };
  const markFeedback = async (cards: WorkspaceCardView[]) => {
    for (const card of cards.filter((item) => canWriteCard(item) && !isFeedback(item) && !item.workflowRecord)) await act({ command: "setClientAnswer", projectId, cardId: card.id, clientAnswer: true, version: card.version });
  };

  // ── Keyboard: tools, Escape, Delete (never while writing) ───────────
  const keyRef = useRef<(event: KeyboardEvent) => void>(() => undefined);
  useEffect(() => {
    keyRef.current = (event: KeyboardEvent) => {
      if (narrow || lens !== "workspace" || isEditable(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
      if (typeof event.key !== "string" || document.querySelector("[role=alertdialog], [role=dialog]")) return;
      const key = event.key.toLowerCase();
      if (key === "escape") { setSelection(new Set()); setTool("select"); setDraft(null); return; }
      if ((key === "delete" || key === "backspace") && selection.size > 0) { event.preventDefault(); void removeCards([...selection].map((id) => byId.get(id)!).filter(Boolean)); return; }
      if (!canCreate) return;
      if (key === "v") setTool("select");
      else if (key === "t") setTool("text");
      else if (key === "s") setTool("sticky");
    };
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => keyRef.current(event);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── Filters ─────────────────────────────────────────────────────────
  // Rounds are told apart by id: two rounds may show the same label, and a renamed round is still the same round.
  const phaseRounds = useMemo(() => {
    if (!selectedPhase) return [];
    const rounds = new Map<string, string>();
    for (const card of elements) if (card.phaseId === selectedPhase.id && card.iterationId && card.iterationLabel) rounds.set(card.iterationId, card.iterationLabel);
    return [...rounds].map(([id, label]) => ({ id, label }));
  }, [elements, selectedPhase]);
  // A round only filters while the phase filter is on and the round still exists.
  const activeRound = filter === "phase" && round && phaseRounds.some((item) => item.id === round) ? round : null;
  const matches = (card: WorkspaceCardView) => {
    if (filter === "general") return !card.phaseId;
    if (filter === "phase") return card.phaseId === selectedPhase?.id && (!activeRound || card.iterationId === activeRound);
    if (filter === "starred") return card.pinned;
    if (filter === "feedback") return isFeedback(card);
    return true;
  };

  const element = (item: WorkspaceCardView, style: CSSProperties | undefined, board: boolean) => {
    const canWrite = canWriteCard(item);
    return (
      <WorkspaceCard
        key={item.id}
        card={item}
        projectId={projectId}
        projectName={projectName}
        canWrite={canWrite}
        labelChoices={canWrite ? labelChoices : { allowNone: false, phases: [] }}
        canUseIdeas={canUseIdeas}
        dimmed={!matches(item)}
        selected={board && selection.has(item.id)}
        style={style}
        measureRef={board ? measurements.get(item.id) : undefined}
        menuExtra={[]}
        run={run}
        onDelete={(target) => void removeCards([target])}
        onPress={board ? pressElement(item) : undefined}
        ignoreClick={() => ignoreClick.current}
        onWidthDown={board && canWrite ? startWidth(item) : undefined}
      />
    );
  };

  // ── Toolbar ─────────────────────────────────────────────────────────
  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "general", label: "General" },
    ...(selectedPhase ? [{ key: "phase" as const, label: selectedPhase.name }] : []),
    { key: "starred", label: "Starred" },
    { key: "feedback", label: "Client feedback" },
  ];
  const segmented = "flex gap-0.5 overflow-x-auto rounded-pill bg-surface-muted p-[3px]";
  const segment = (active: boolean) => `h-7 shrink-0 whitespace-nowrap rounded-pill px-3 text-xs font-medium transition-colors ${active ? "bg-surface text-ink shadow-raise" : "text-ink-secondary hover:text-ink"}`;

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2 border-b border-line-subtle px-3 py-2.5">
      {drawingList ? (
        <div className={segmented} role="tablist" aria-label="Lens">
          <button type="button" role="tab" aria-selected={lens === "workspace"} className={segment(lens === "workspace")} onClick={() => setLens("workspace")}>Workspace</button>
          <button type="button" role="tab" aria-selected={lens === "drawings"} className={segment(lens === "drawings")} onClick={() => setLens("drawings")}>Drawing list</button>
        </div>
      ) : <h2 className="m-0 mr-1 text-base font-semibold text-ink">Workspace</h2>}
      {lens === "workspace" ? (
        <>
          <div className={segmented} role="group" aria-label="Show elements">
            {filters.map((item) => <button key={item.key} type="button" aria-pressed={filter === item.key} className={segment(filter === item.key)} onClick={() => setFilter(item.key)}>{item.label}</button>)}
          </div>
          {filter === "phase" && phaseRounds.length > 1 ? (
            <div className={segmented} role="group" aria-label="Round">
              <button type="button" aria-pressed={activeRound === null} className={segment(activeRound === null)} onClick={() => setRound(null)}>Every round</button>
              {phaseRounds.map((item) => <button key={item.id} type="button" aria-pressed={activeRound === item.id} className={segment(activeRound === item.id)} onClick={() => setRound(item.id)}>{item.label}</button>)}
            </div>
          ) : null}
          <span className="flex-1" />
          {canCreate ? <Button size="sm" variant="primary" leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setComposer(true)}>Quick note</Button> : null}
        </>
      ) : null}
    </div>
  );

  const composerPanel = composer && canCreate ? (
    <div ref={composerRef} data-board-ui="" className={narrow ? "border-b border-line-subtle p-3" : "absolute right-3 top-3 z-30 w-[min(380px,calc(100%-24px))] rounded-card bg-surface p-3 shadow-over"}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <Text size="sm" weight="semibold">Quick note</Text>
        <IconButton size="sm" variant="ghost" label="Close" icon={<X aria-hidden="true" />} onClick={() => setComposer(false)} />
      </div>
      <CardComposer key={selectedPhase?.id ?? ""} projectId={projectId} labelChoices={labelChoices} defaultPhaseId={selectedPhase?.id ?? null} run={run} autoFocus />
    </div>
  ) : null;

  const notice = readOnlyReason || limited ? (
    <div className="px-3 pt-3"><Notice tone="neutral">{{
      archived: "This project is archived, so its Workspace is read-only.",
      inactive: "The Workspace can be changed once the project is active.",
      permission: "You can read this Workspace. Only the project's designer or drafter can change it.",
      limited: "You can write for your own phases only; the other elements are read-only for you.",
    }[readOnlyReason ?? "limited"]}</Notice></div>
  ) : null;

  // ── Phone: the elements read top to bottom ─────────────────────────
  if (narrow || lens === "drawings") {
    const ordered = [...elements].sort((a, b) => {
      const sa = layout.get(a.id)!, sb = layout.get(b.id)!;
      return sa.y - sb.y || sa.x - sb.x;
    });
    return (
      <section className="overflow-hidden rounded-card bg-surface shadow-plane" aria-label="Project workspace">
        {toolbar}
        {lens === "drawings" ? <div className="p-3">{drawingList}</div> : (
          <>
            {notice}
            {composerPanel}
            {error ? <div role="alert" className="px-3 pt-3"><InlineError>{error}</InlineError></div> : null}
            <div className="grid gap-3 p-3">
              {ordered.length === 0 ? <EmptyState title="Start the project's Workspace" description="Write the first note, or add photos and files." /> : ordered.map((item) => element(item, undefined, false))}
            </div>
          </>
        )}
        {confirm.dialog}
      </section>
    );
  }

  // ── Desktop: the board ──────────────────────────────────────────────
  const moving = drag?.kind === "move" ? drag : null;
  const movingIds = new Set(moving?.ids ?? []);
  const extent = boardExtent(layout, heights);
  const scale = MINIMAP_W / extent.w;
  const boardHeight = fitHeight ?? 560;
  const visible = { x: -view.x / view.zoom, y: -view.y / view.zoom, w: boardWidth / view.zoom, h: boardHeight / view.zoom };
  const jumpTo = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const wx = (event.clientX - rect.left) / scale, wy = (event.clientY - rect.top) / scale;
    setView((current) => ({ ...current, x: boardWidth / 2 - wx * current.zoom, y: boardHeight / 2 - wy * current.zoom }));
  };
  const selected = [...selection].map((id) => byId.get(id)).filter((card): card is WorkspaceCardView => !!card);
  const hints: Record<Tool, string> = {
    select: "Drag empty board to move around · Shift + click to select several · Paste or drop images and files anywhere",
    text: "Click the board to write there",
    sticky: "Click the board to place a sticky note",
  };
  const tools: { key: Tool; label: string; shortcut: string; icon: ReactNode }[] = [
    { key: "select", label: "Select", shortcut: "V", icon: <MousePointer2 aria-hidden="true" className="h-4 w-4" /> },
    { key: "text", label: "Text", shortcut: "T", icon: <Type aria-hidden="true" className="h-4 w-4" /> },
    { key: "sticky", label: "Sticky", shortcut: "S", icon: <StickyNote aria-hidden="true" className="h-4 w-4" /> },
  ];

  return (
    <section className="overflow-hidden rounded-card bg-surface shadow-plane" aria-label="Project workspace">
      {toolbar}
      {notice}
      {error ? <div role="alert" className="px-3 pt-3"><InlineError>{error}</InlineError></div> : null}
      <div
        ref={viewportRef}
        tabIndex={-1}
        {...intake.target}
        onPointerDown={onBoardPointerDown}
        onPointerMove={(event) => { lastPointer.current = { x: event.clientX, y: event.clientY }; }}
        onDragOverCapture={(event) => { lastPointer.current = { x: event.clientX, y: event.clientY }; }}
        onDoubleClick={onBoardDoubleClick}
        style={{ height: fitHeight ?? 560 }}
        className={`relative touch-none overflow-hidden bg-canvas outline-none ${drag?.kind === "pan" ? "cursor-grabbing" : tool !== "select" ? "cursor-crosshair" : ""} ${intake.active ? "outline-2 -outline-offset-4 outline-dashed outline-line-focus" : ""}`}
        aria-label="Workspace board"
      >
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 [background-image:radial-gradient(var(--ui-border-default)_1px,transparent_1px)]" style={{ backgroundSize: `${24 * view.zoom}px ${24 * view.zoom}px`, backgroundPosition: `${view.x}px ${view.y}px` }} />
        <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
          {elements.map((item) => {
            const slot = layout.get(item.id)!;
            const w = drag?.kind === "width" && drag.id === item.id ? drag.w : slot.w;
            const offset = moving && movingIds.has(item.id) ? { x: moving.dx, y: moving.dy } : { x: 0, y: 0 };
            return element(item, { position: "absolute", left: slot.x + offset.x, top: slot.y + offset.y, width: w, zIndex: selection.has(item.id) ? 5 : undefined }, true);
          })}
          {draft ? <DraftText draft={draft} onDone={(text) => { setDraft(null); void createText(text, draft, draft.textStyle); }} onCancel={() => setDraft(null)} /> : null}
          {moving?.guideX != null ? <div aria-hidden="true" className="pointer-events-none absolute -top-[5000px] h-[10000px] w-px bg-line-focus opacity-40" style={{ left: moving.guideX }} /> : null}
          {moving?.guideY != null ? <div aria-hidden="true" className="pointer-events-none absolute -left-[5000px] h-px w-[10000px] bg-line-focus opacity-40" style={{ top: moving.guideY }} /> : null}
        </div>

        {elements.length === 0 && !draft ? (
          <div className="pointer-events-none absolute inset-0 grid place-items-center p-6">
            <EmptyState title="Start the project's Workspace" description="Double-click to write, or paste and drop photos and files anywhere on the board." />
          </div>
        ) : null}

        {selected.length > 1 ? (
          <div data-board-ui="" className="absolute left-1/2 top-3 z-30 flex -translate-x-1/2 items-center gap-2 rounded-control bg-action py-1.5 pl-3.5 pr-1.5 text-sm text-action-ink shadow-over">
            <span>{selected.length} selected · drag one to move them all</span>
            <button type="button" className="h-8 rounded-action px-2.5 text-xs font-medium hover:bg-action-hover" onClick={() => void markFeedback(selected)}>Mark as client feedback</button>
            <button type="button" className="h-8 rounded-action px-2.5 text-xs font-medium hover:bg-action-hover" onClick={() => void removeCards(selected)}>Delete</button>
            <IconButton size="sm" variant="ghost" label="Clear selection" icon={<X aria-hidden="true" className="text-action-ink" />} onClick={() => setSelection(new Set())} />
          </div>
        ) : null}

        {composerPanel}

        <div data-board-ui="" className="absolute bottom-3 left-3 z-20 flex items-center gap-0.5 rounded-control bg-surface p-0.5 shadow-float">
          <IconButton size="sm" variant="ghost" label="Zoom out" icon={<Minus aria-hidden="true" />} disabled={view.zoom <= MIN_ZOOM} onClick={() => zoomBy(0.9)} />
          <button type="button" className="h-8 min-w-12 rounded-action px-1 text-xs tabular-nums text-ink-secondary hover:bg-surface-muted" title="Back to 100%" onClick={() => setView(DEFAULT_VIEW)}>{Math.round(view.zoom * 100)}%</button>
          <IconButton size="sm" variant="ghost" label="Zoom in" icon={<Plus aria-hidden="true" />} disabled={view.zoom >= MAX_ZOOM} onClick={() => zoomBy(1.1)} />
        </div>

        <div data-board-ui="" className="absolute bottom-3 left-1/2 z-20 flex max-w-[calc(100%-24px-2*190px)] -translate-x-1/2 flex-col items-center gap-1.5">
          <span className="rounded-action bg-surface px-2.5 py-1 text-center text-xs text-ink-tertiary shadow-float">{hints[tool]}</span>
          {canCreate ? (
            <div role="toolbar" aria-label="Board tools" className="flex flex-wrap justify-center gap-0.5 rounded-control bg-surface p-1 shadow-float">
              {tools.map((item) => (
                <button key={item.key} type="button" aria-pressed={tool === item.key} title={`${item.label} (${item.shortcut})`} onClick={() => setTool(item.key)} className={`inline-flex h-9 items-center gap-1.5 rounded-action px-3 text-sm ${tool === item.key ? "bg-action text-action-ink" : "text-ink hover:bg-surface-muted"}`}>
                  {item.icon}<span>{item.label}</span><kbd className={`text-[10px] ${tool === item.key ? "text-action-ink/70" : "text-ink-tertiary"}`}>{item.shortcut}</kbd>
                </button>
              ))}
              <span aria-hidden="true" className="mx-1 my-1.5 w-px bg-line-subtle" />
              <button type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex h-9 items-center gap-1.5 rounded-action px-3 text-sm text-ink hover:bg-surface-muted">
                <Upload aria-hidden="true" className="h-4 w-4" /><span>Photo or file</span>
              </button>
              <input ref={fileInputRef} type="file" multiple accept={`image/png,image/jpeg,image/webp,${WORKSPACE_FILE_ACCEPT}`} onChange={pickFiles} className="sr-only" tabIndex={-1} aria-hidden="true" />
            </div>
          ) : null}
        </div>

        <div data-board-ui="" className="absolute bottom-3 right-3 z-20 grid gap-1">
          <span className="text-right text-[11px] text-ink-tertiary">Overview · click to jump</span>
          <div role="presentation" onPointerDown={jumpTo} className="relative cursor-pointer overflow-hidden rounded-control bg-surface shadow-float" style={{ width: MINIMAP_W, height: Math.max(60, Math.round(extent.h * scale)) }}>
            {elements.map((item) => {
              const slot = layout.get(item.id)!;
              const tone = item.kind === "IMAGE" ? "bg-ink-tertiary/50" : isFeedback(item) ? "bg-warning-line" : item.textStyle === "STICKY" ? "bg-warning-surface" : "bg-line-strong";
              return <span key={item.id} aria-hidden="true" className={`absolute rounded-[1px] ${tone} ${matches(item) ? "" : "opacity-30"}`} style={{ left: slot.x * scale, top: slot.y * scale, width: Math.max(2, slot.w * scale), height: Math.max(2, heightOf(item.id) * scale) }} />;
            })}
            <span aria-hidden="true" className="pointer-events-none absolute rounded-[2px] shadow-[inset_0_0_0_1.5px_var(--ui-border-focus)]" style={{ left: visible.x * scale, top: visible.y * scale, width: visible.w * scale, height: visible.h * scale }} />
          </div>
        </div>
      </div>
      {confirm.dialog}
    </section>
  );
}

/** A new text being written where the board was clicked; it becomes an element when left with any text in it. */
function DraftText({ draft, onDone, onCancel }: { draft: Draft; onDone: (text: string) => void; onCancel: () => void }) {
  const [text, setText] = useState("");
  const sticky = draft.textStyle === "STICKY";
  return (
    <div
      data-board-ui=""
      className={`absolute z-10 rounded-[10px] px-3 py-2.5 ${sticky ? "rounded-[4px] bg-warning-surface shadow-float" : "bg-surface shadow-raise"}`}
      style={{ left: draft.x, top: draft.y, width: draft.w }}
      onKeyDownCapture={(event) => { if (event.key === "Escape") { event.preventDefault(); onCancel(); } }}
    >
      <RichTextEditor bare slashMenu aria-label={sticky ? "New sticky note" : "New text"} placeholder="Write, or type / for headings, lists and checklists" maxLength={NOTE_MAX} value={text} autoFocus onChange={setText} onBlur={() => onDone(text)} />
    </div>
  );
}
