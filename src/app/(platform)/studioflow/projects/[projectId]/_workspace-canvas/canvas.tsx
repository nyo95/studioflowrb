"use client";

import { Maximize, Minus, Plus, SquarePlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

import { Button, EmptyState, IconButton, InlineEdit, InlineError, Notice, RowActionMenu, Text, useConfirm, useFileIntake, type RowActionItem } from "@/platform/ui_engine";

import type { WorkspaceCommandInput } from "../../../actions";
import { CardComposer, WorkspaceCard, runWorkspaceCommand, uploadCardImages, type LabelChoices, type PhaseOption, type RunCommand, type WorkspaceCardView } from "./card";
import { CARD_TOP, DEFAULT_CARD_W, DEFAULT_FRAME, FRAME_HEAD, FRAME_PAD, ESTIMATED_CARD_H, MIN_CARD_W, MIN_FRAME, fitZoom, frameAt, layoutBoard, nextFramePlace, snapMove, snapToGrid, type CardSlot, type Rect } from "./geometry";

export type WorkspaceSectionView = {
  id: string;
  title: string;
  version: number;
  isDefault: boolean;
  canvas: Rect | null;
  cards: WorkspaceCardView[];
};

type Filter = "all" | "general" | "phase" | "starred" | "feedback";
type View = { x: number; y: number; zoom: number };
type Overrides = { frames: Record<string, Rect>; cards: Record<string, CardSlot & { sectionId: string }> };
type Drag =
  | { kind: "card"; id: string; from: string; to: string; x: number; y: number; w: number; h: number; guideX: number | null; guideY: number | null }
  | { kind: "frame"; id: string; x: number; y: number; guideX: number | null; guideY: number | null }
  | { kind: "card-width"; id: string; w: number }
  | { kind: "frame-size"; id: string; w: number; h: number }
  | { kind: "pan" };

const EMPTY: Overrides = { frames: {}, cards: {} };
const DEFAULT_VIEW: View = { x: 24, y: 16, zoom: 1 };
const isFeedback = (card: WorkspaceCardView) => card.origin === "CLIENT_ANSWER";

/**
 * The project Workspace as a free canvas (owner-accepted R8.529 prototype; WO-SF-WORKSPACE-03 geometry).
 * Frames are the Workspace sections; cards sit anywhere inside them and size their height to their content.
 * Middle-click (or Space + left) drags the canvas, the wheel zooms, a card's grip drags it (also into another frame),
 * a frame's header drags the frame, the corners resize. Everything snaps to the grid and to neighbouring edges.
 * Layout is last-write-wins and never makes someone's text edit stale. Below 768 px the frames read top to bottom.
 */
export function WorkspaceCanvas({ projectId, sections, phases, selectedPhase, readOnlyReason, canEditGeneral, writablePhaseIds, canUseIdeas, drawingList }: {
  projectId: string;
  sections: WorkspaceSectionView[];
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

  // Optimistic geometry and removals, dropped whenever the server sends the board again.
  const [received, setReceived] = useState(sections);
  const [overrides, setOverrides] = useState<Overrides>(EMPTY);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  if (received !== sections) { setReceived(sections); setOverrides(EMPTY); setHidden(new Set()); }

  const [heights, setHeights] = useState<ReadonlyMap<string, number>>(new Map());
  const [view, setView] = useState<View>(DEFAULT_VIEW);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [round, setRound] = useState<string | null>(null);
  const [composer, setComposer] = useState<{ sectionId?: string; place?: CardSlot } | null>(null);
  const [lens, setLens] = useState<"workspace" | "drawings">("workspace");
  const [error, setError] = useState<string | null>(null);
  const [narrow, setNarrow] = useState(false);
  const spaceDown = useRef(false);
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

  // ── View (pan and zoom are personal: this browser only) ─────────────
  const viewKey = `studioflow.workspace.view.${projectId}`;
  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const sync = () => setNarrow(media.matches);
    // Read after hydration, so the server and the browser render the same page first.
    const timer = window.setTimeout(() => {
      try { const saved = JSON.parse(window.localStorage.getItem(viewKey) ?? "null"); if (saved && typeof saved.zoom === "number") setView(saved); } catch { /* default view */ }
      sync();
    }, 0);
    media.addEventListener("change", sync);
    return () => { window.clearTimeout(timer); media.removeEventListener("change", sync); };
  }, [viewKey]);
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
    try { window.localStorage.setItem(viewKey, JSON.stringify(view)); } catch { /* kept for this visit only */ }
  }, [view, viewKey]);

  // ── Board model: server data + optimistic overrides, laid out ───────
  const board = useMemo(() => {
    const live = sections.map((section) => ({ ...section, cards: [] as WorkspaceCardView[] }));
    const byId = new Map(live.map((section) => [section.id, section]));
    for (const section of sections) {
      for (const card of section.cards) {
        if (hidden.has(card.id)) continue;
        const moved = overrides.cards[card.id];
        const target = byId.get(moved?.sectionId ?? section.id) ?? byId.get(section.id)!;
        target.cards.push(moved ? { ...card, canvas: { x: moved.x, y: moved.y, w: moved.w } } : card);
      }
    }
    for (const section of live) if (overrides.frames[section.id]) section.canvas = overrides.frames[section.id]!;
    return live;
  }, [sections, overrides, hidden]);
  const layout = useMemo(() => layoutBoard(board, heights), [board, heights]);
  const cardIndex = useMemo(() => {
    const index = new Map<string, { card: WorkspaceCardView; sectionId: string }>();
    for (const section of board) for (const card of section.cards) index.set(card.id, { card, sectionId: section.id });
    return index;
  }, [board]);

  // ── Measuring card heights (they follow their content) ──────────────
  const observer = useRef<ResizeObserver | null>(null);
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
    return () => observer.current?.disconnect();
  }, []);
  const measure = useCallback((id: string) => (element: HTMLElement | null) => {
    if (!element) return;
    element.dataset.cardId = id;
    observer.current?.observe(element);
  }, []);

  // ── Commands ─────────────────────────────────────────────────────────
  const run: RunCommand = useCallback(async (input) => {
    setError(null);
    const result = await runWorkspaceCommand(input);
    if (result.ok || result.stale) router.refresh();
    return result;
  }, [router]);
  const act = async (input: WorkspaceCommandInput) => {
    const result = await run(input);
    if (!result.ok) { setError(result.message); setOverrides(EMPTY); setHidden(new Set()); }
    return result.ok;
  };

  /** Saves geometry. Unplaced neighbours are saved where they are drawn, so placing one item never moves another. */
  const place = (payload: { sections?: (Rect & { id: string })[]; cards?: (CardSlot & { id: string; sectionId?: string })[] }) => {
    const sectionsOut = new Map((payload.sections ?? []).map((item) => [item.id, item]));
    const cardsOut = new Map((payload.cards ?? []).map((item) => [item.id, item]));
    if (sectionsOut.size > 0) {
      for (const section of board) {
        if (section.canvas || sectionsOut.has(section.id)) continue;
        const frame = layout.frames.get(section.id)!;
        sectionsOut.set(section.id, { id: section.id, x: frame.x, y: frame.y, w: DEFAULT_FRAME.w, h: DEFAULT_FRAME.h });
      }
    }
    const touched = new Set([...cardsOut.values()].flatMap((item) => [item.sectionId ?? cardIndex.get(item.id)?.sectionId].filter(Boolean) as string[]));
    for (const id of cardsOut.keys()) { const from = cardIndex.get(id)?.sectionId; if (from) touched.add(from); }
    for (const section of board) {
      if (!touched.has(section.id)) continue;
      for (const card of section.cards) {
        if (card.canvas || cardsOut.has(card.id)) continue;
        cardsOut.set(card.id, { id: card.id, ...layout.cards.get(card.id)! });
      }
    }
    setOverrides((current) => {
      const next: Overrides = { frames: { ...current.frames }, cards: { ...current.cards } };
      for (const item of sectionsOut.values()) next.frames[item.id] = { x: item.x, y: item.y, w: item.w, h: item.h };
      for (const item of cardsOut.values()) next.cards[item.id] = { x: item.x, y: item.y, w: item.w, sectionId: item.sectionId ?? cardIndex.get(item.id)?.sectionId ?? "" };
      return next;
    });
    void act({
      command: "placeItems",
      projectId,
      sections: sectionsOut.size ? [...sectionsOut.values()] : undefined,
      cards: cardsOut.size ? [...cardsOut.values()].map((item) => ({ id: item.id, x: Math.max(0, item.x), y: Math.max(0, item.y), w: Math.max(MIN_CARD_W, item.w), ...(item.sectionId && item.sectionId !== cardIndex.get(item.id)?.sectionId ? { sectionId: item.sectionId } : {}) })) : undefined,
    });
  };

  // ── Pointer gestures ────────────────────────────────────────────────
  const toWorld = (clientX: number, clientY: number) => {
    const rect = viewportRef.current!.getBoundingClientRect();
    const current = viewRef.current;
    return { x: (clientX - rect.left - current.x) / current.zoom, y: (clientY - rect.top - current.y) / current.zoom };
  };

  /** Follows the pointer until it is released; `move` returns the live state, `end` commits it. */
  const follow = (event: ReactPointerEvent, move: (e: PointerEvent) => void, end: () => void) => {
    event.preventDefault();
    event.stopPropagation();
    const onMove = (e: PointerEvent) => move(e);
    const onUp = () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); window.removeEventListener("pointercancel", onUp); end(); };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const startPan = (event: ReactPointerEvent) => {
    const start = { x: event.clientX, y: event.clientY, view: viewRef.current };
    setDrag({ kind: "pan" });
    follow(event, (e) => setView({ ...start.view, x: start.view.x + e.clientX - start.x, y: start.view.y + e.clientY - start.y }), () => setDrag(null));
  };

  const onViewportPointerDown = (event: ReactPointerEvent) => {
    if (event.button === 1 || (event.button === 0 && spaceDown.current)) startPan(event);
  };

  const startCardDrag = (card: WorkspaceCardView, sectionId: string) => (event: ReactPointerEvent) => {
    if (event.button === 1) { startPan(event); return; }
    if (event.button !== 0) return;
    const frame = layout.frames.get(sectionId)!;
    const slot = layout.cards.get(card.id)!;
    const h = heights.get(card.id) ?? ESTIMATED_CARD_H;
    const point = toWorld(event.clientX, event.clientY);
    const offset = { x: point.x - (frame.x + slot.x), y: point.y - (frame.y + slot.y) };
    let live: Extract<Drag, { kind: "card" }> = { kind: "card", id: card.id, from: sectionId, to: sectionId, x: frame.x + slot.x, y: frame.y + slot.y, w: slot.w, h, guideX: null, guideY: null };
    setDrag(live);
    follow(event, (e) => {
      const p = toWorld(e.clientX, e.clientY);
      const to = frameAt(layout.frames, p.x, p.y) ?? sectionId;
      const target = layout.frames.get(to)!;
      const others = board.find((section) => section.id === to)!.cards.filter((other) => other.id !== card.id).map((other) => {
        const s = layout.cards.get(other.id)!;
        return { x: target.x + s.x, y: target.y + s.y, w: s.w, h: heights.get(other.id) ?? ESTIMATED_CARD_H };
      });
      const snapped = snapMove({ w: slot.w, h }, p.x - offset.x, p.y - offset.y, others, { x: target.x + FRAME_PAD, y: target.y + CARD_TOP });
      live = { ...live, to, x: snapped.x, y: snapped.y, guideX: snapped.guideX, guideY: snapped.guideY };
      setDrag(live);
    }, () => {
      setDrag(null);
      const target = layout.frames.get(live.to)!;
      const x = Math.max(0, snapToGrid(live.x - target.x));
      const y = Math.max(CARD_TOP, snapToGrid(live.y - target.y));
      if (live.to === sectionId && x === slot.x && y === slot.y) return;
      place({ cards: [{ id: card.id, x, y, w: slot.w, sectionId: live.to }] });
    });
  };

  const startCardWidth = (card: WorkspaceCardView) => (event: ReactPointerEvent) => {
    if (event.button !== 0) return;
    const slot = layout.cards.get(card.id)!;
    const startX = event.clientX;
    let w = slot.w;
    setDrag({ kind: "card-width", id: card.id, w });
    follow(event, (e) => { w = Math.max(MIN_CARD_W, snapToGrid(slot.w + (e.clientX - startX) / viewRef.current.zoom)); setDrag({ kind: "card-width", id: card.id, w }); }, () => {
      setDrag(null);
      if (w !== slot.w) place({ cards: [{ id: card.id, x: slot.x, y: slot.y, w }] });
    });
  };

  const startFrameDrag = (section: WorkspaceSectionView) => (event: ReactPointerEvent) => {
    if (event.button === 1) { startPan(event); return; }
    if (event.button !== 0 || !canEditGeneral) return;
    if ((event.target as HTMLElement).closest("button, input, [contenteditable], [role=textbox]")) return;
    const frame = layout.frames.get(section.id)!;
    const point = toWorld(event.clientX, event.clientY);
    const offset = { x: point.x - frame.x, y: point.y - frame.y };
    const others = [...layout.frames].filter(([id]) => id !== section.id).map(([, rect]) => rect);
    let live: Extract<Drag, { kind: "frame" }> = { kind: "frame", id: section.id, x: frame.x, y: frame.y, guideX: null, guideY: null };
    setDrag(live);
    follow(event, (e) => {
      const p = toWorld(e.clientX, e.clientY);
      const snapped = snapMove(frame, p.x - offset.x, p.y - offset.y, others);
      live = { ...live, x: snapped.x, y: snapped.y, guideX: snapped.guideX, guideY: snapped.guideY };
      setDrag(live);
    }, () => {
      setDrag(null);
      if (live.x === frame.x && live.y === frame.y) return;
      const stored = section.canvas ?? { ...DEFAULT_FRAME, x: frame.x, y: frame.y };
      place({ sections: [{ id: section.id, x: live.x, y: live.y, w: stored.w, h: stored.h }] });
    });
  };

  const startFrameSize = (section: WorkspaceSectionView) => (event: ReactPointerEvent) => {
    if (event.button !== 0 || !canEditGeneral) return;
    const frame = layout.frames.get(section.id)!;
    const start = { x: event.clientX, y: event.clientY };
    let size = { w: frame.w, h: frame.h };
    setDrag({ kind: "frame-size", id: section.id, ...size });
    follow(event, (e) => {
      const zoom = viewRef.current.zoom;
      size = { w: Math.max(MIN_FRAME.w, snapToGrid(frame.w + (e.clientX - start.x) / zoom)), h: Math.max(MIN_FRAME.h, snapToGrid(frame.h + (e.clientY - start.y) / zoom)) };
      setDrag({ kind: "frame-size", id: section.id, ...size });
    }, () => {
      setDrag(null);
      if (size.w !== frame.w || size.h !== frame.h) place({ sections: [{ id: section.id, x: frame.x, y: frame.y, ...size }] });
    });
  };

  // Wheel zooms around the pointer; the browser's middle-click autoscroll is switched off on the canvas.
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      setView((current) => {
        const zoom = Math.max(0.4, Math.min(1.6, current.zoom * (event.deltaY > 0 ? 0.9 : 1.1)));
        const ox = event.clientX - rect.left, oy = event.clientY - rect.top;
        return { zoom, x: ox - ((ox - current.x) / current.zoom) * zoom, y: oy - ((oy - current.y) / current.zoom) * zoom };
      });
    };
    const noAutoscroll = (event: MouseEvent) => { if (event.button === 1) event.preventDefault(); };
    element.addEventListener("wheel", onWheel, { passive: false });
    element.addEventListener("mousedown", noAutoscroll);
    element.addEventListener("auxclick", noAutoscroll);
    const keyDown = (event: KeyboardEvent) => { if (event.code === "Space" && !(event.target as HTMLElement).closest("input, textarea, [contenteditable]")) spaceDown.current = true; };
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

  // The page does not scroll on a desktop (owner, 2026-10-13): the canvas fills the room left under the cards above
  // it, down to the page's bottom padding, and follows when that room changes (window size, an Undo bar appearing).
  const [fitHeight, setFitHeight] = useState<number | null>(null);
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    // Looked up on every measure: while the page streams in, the canvas can sit outside its final scrolling area.
    const scrollArea = () => {
      let scroller: HTMLElement | null = element.parentElement;
      while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
      return scroller ?? document.documentElement;
    };
    const measure = () => {
      const area = scrollArea();
      const top = element.getBoundingClientRect().top - area.getBoundingClientRect().top + area.scrollTop;
      const next = Math.max(280, Math.floor(area.clientHeight - top - 24));
      setFitHeight((current) => (current === next ? current : next));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(document.documentElement);
    const above = element.closest("section")?.previousElementSibling;
    if (above) observer.observe(above);
    window.addEventListener("resize", measure);
    // A page opened in a background tab is only put in place when the tab is shown: measure when the canvas
    // actually appears, and once more after the streamed page has settled.
    const appear = new IntersectionObserver(measure);
    appear.observe(element);
    const settle = [window.setTimeout(measure, 0), window.setTimeout(measure, 400)];
    return () => { observer.disconnect(); appear.disconnect(); settle.forEach((id) => window.clearTimeout(id)); window.removeEventListener("resize", measure); };
  }, [lens, narrow]);

  const zoomBy = (factor: number) => setView((current) => {
    const element = viewportRef.current;
    const ox = (element?.clientWidth ?? 800) / 2, oy = (element?.clientHeight ?? 500) / 2;
    const zoom = Math.max(0.4, Math.min(1.6, current.zoom * factor));
    return { zoom, x: ox - ((ox - current.x) / current.zoom) * zoom, y: oy - ((oy - current.y) / current.zoom) * zoom };
  });

  // ── Writing at a spot: images pasted or dropped on the canvas, double-click to write ─────
  const lastPointer = useRef<{ x: number; y: number } | null>(null);
  /** The frame under a canvas point (or the default frame) and the block's place inside it. */
  const spotAt = (clientX: number, clientY: number) => {
    const point = toWorld(clientX, clientY);
    const sectionId = frameAt(layout.frames, point.x, point.y) ?? board.find((section) => section.isDefault)?.id ?? board[0]?.id;
    const frame = sectionId ? layout.frames.get(sectionId) : undefined;
    if (!sectionId || !frame) return { sectionId: undefined, place: undefined };
    return { sectionId, place: { x: Math.max(0, snapToGrid(point.x - frame.x)), y: Math.max(CARD_TOP, snapToGrid(point.y - frame.y)), w: DEFAULT_CARD_W } };
  };
  const newBlockPhase = selectedPhase && labelChoices.phases.some((phase) => phase.id === selectedPhase.id) ? selectedPhase.id : labelChoices.allowNone ? null : labelChoices.phases[0]?.id ?? null;
  const dropImages = async (files: File[]) => {
    if (files.length === 0) return;
    const rect = viewportRef.current?.getBoundingClientRect();
    const at = lastPointer.current ?? (rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : { x: 0, y: 0 });
    const spot = spotAt(at.x, at.y);
    const created = await run({ command: "createCard", projectId, sectionId: spot.sectionId, phaseId: newBlockPhase, body: null, withImages: true, ...(spot.place ?? {}) });
    if (!created.ok) { setError(created.message); return; }
    const { problems } = await uploadCardImages(projectId, (created.data as { cardId: string }).cardId, files);
    if (problems.length > 0) setError(problems.join(" "));
    router.refresh();
  };
  const intake = useFileIntake({ accept: "image/png,image/jpeg,image/webp", multiple: true, pasteFromPage: true, disabled: !canCreate || narrow || lens !== "workspace", onFiles: (files) => void dropImages(files) });
  const writeAt = (event: ReactMouseEvent) => {
    if (!canCreate || (event.target as HTMLElement).closest("article, button, header, input, [contenteditable]")) return;
    const spot = spotAt(event.clientX, event.clientY);
    setComposer({ sectionId: spot.sectionId, place: spot.place });
  };

  // ── Filters ─────────────────────────────────────────────────────────
  const phaseRounds = useMemo(() => {
    if (!selectedPhase) return [];
    const labels = new Set<string>();
    for (const section of board) for (const card of section.cards) if (card.phaseId === selectedPhase.id && card.iterationLabel) labels.add(card.iterationLabel);
    return [...labels];
  }, [board, selectedPhase]);
  // A round only filters while the phase filter is on and the round still exists.
  const activeRound = filter === "phase" && round && phaseRounds.includes(round) ? round : null;
  const matches = (card: WorkspaceCardView) => {
    if (filter === "general") return !card.phaseId;
    if (filter === "phase") return card.phaseId === selectedPhase?.id && (!activeRound || card.iterationLabel === activeRound);
    if (filter === "starred") return card.pinned;
    if (filter === "feedback") return isFeedback(card);
    return true;
  };

  // ── Frame and card menus ────────────────────────────────────────────
  const addFrame = async () => {
    const slot = nextFramePlace(layout.frames);
    if (await act({ command: "createSection", projectId, title: "New topic", ...slot })) setError(null);
  };
  const removeFrame = async (section: WorkspaceSectionView) => {
    const ok = await confirm.confirm({ title: `Delete “${section.title}”?`, description: "Only an empty frame can be deleted.", confirmLabel: "Delete frame", tone: "danger" });
    if (ok) await act({ command: "deleteSection", projectId, sectionId: section.id, version: section.version });
  };
  const removeCard = async (card: WorkspaceCardView) => {
    const ok = await confirm.confirm({ title: "Delete this card?", description: card.images.length ? "The card and its images are removed. This cannot be undone." : "The card is removed. This cannot be undone.", confirmLabel: "Delete card", tone: "danger" });
    if (!ok) return;
    setHidden((current) => new Set(current).add(card.id));
    await act({ command: "deleteCard", projectId, cardId: card.id, version: card.version });
  };
  const cardMoves = (card: WorkspaceCardView, sectionId: string): RowActionItem[] => board
    .filter((section) => section.id !== sectionId)
    .map((section, index) => ({ label: `Move to “${section.title}”`, separatorBefore: index === 0, onSelect: () => void act({ command: "moveCard", projectId, cardId: card.id, sectionId: section.id, position: section.cards.length, version: card.version }) }));
  const frameMenu = (section: WorkspaceSectionView): RowActionItem[] => [
    { label: "Add card here", onSelect: () => setComposer({ sectionId: section.id }) },
    ...(section.isDefault ? [] : [{ label: "Delete frame", danger: true, separatorBefore: true, disabled: section.cards.length > 0, onSelect: () => void removeFrame(section) }]),
  ];

  const frameTitle = (section: WorkspaceSectionView) => canEditGeneral ? (
    <InlineEdit
      label="Frame title"
      value={section.title}
      onCommit={async (title) => { const result = await run({ command: "renameSection", projectId, sectionId: section.id, title, version: section.version }); if (!result.ok) throw new Error(result.message); }}
      errorLabel={(failure) => (failure instanceof Error ? failure.message : "The title could not be saved.")}
      display={(value) => <span className="truncate text-base font-semibold text-ink">{value}</span>}
    />
  ) : <span className="truncate text-base font-semibold text-ink">{section.title}</span>;

  const card = (item: WorkspaceCardView, sectionId: string, style: CSSProperties | undefined, canvas: boolean) => {
    const canWrite = canWriteCard(item);
    return (
      <WorkspaceCard
        key={item.id}
        card={item}
        projectId={projectId}
        canWrite={canWrite}
        labelChoices={canWrite ? labelChoices : { allowNone: false, phases: [] }}
        canUseIdeas={canUseIdeas}
        dimmed={!matches(item)}
        style={style}
        measureRef={canvas ? measure(item.id) : undefined}
        menuExtra={canWrite ? cardMoves(item, sectionId) : []}
        run={run}
        onDelete={(target) => void removeCard(target)}
        onGripDown={canvas && canWrite ? startCardDrag(item, sectionId) : undefined}
        onWidthDown={canvas && canWrite ? startCardWidth(item) : undefined}
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
  const defaultSectionId = board.find((section) => section.isDefault)?.id;

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
          <div className={segmented} role="group" aria-label="Show cards">
            {filters.map((item) => <button key={item.key} type="button" aria-pressed={filter === item.key} className={segment(filter === item.key)} onClick={() => setFilter(item.key)}>{item.label}</button>)}
          </div>
          {filter === "phase" && phaseRounds.length > 1 ? (
            <div className={segmented} role="group" aria-label="Round">
              <button type="button" aria-pressed={activeRound === null} className={segment(activeRound === null)} onClick={() => setRound(null)}>Every round</button>
              {phaseRounds.map((label) => <button key={label} type="button" aria-pressed={activeRound === label} className={segment(activeRound === label)} onClick={() => setRound(label)}>{label}</button>)}
            </div>
          ) : null}
          <span className="flex-1" />
          {!narrow ? (
            <div className="flex items-center gap-0.5">
              <IconButton size="sm" variant="ghost" label="Zoom out" icon={<Minus aria-hidden="true" />} onClick={() => zoomBy(0.9)} />
              <button type="button" className="h-8 min-w-12 rounded-action px-1 text-xs tabular-nums text-ink-secondary hover:bg-surface-muted" title="Back to 100%" onClick={() => setView(DEFAULT_VIEW)}>{Math.round(view.zoom * 100)}%</button>
              <IconButton size="sm" variant="ghost" label="Zoom in" icon={<Plus aria-hidden="true" />} onClick={() => zoomBy(1.1)} />
              <IconButton size="sm" variant="ghost" label="Fit everything" icon={<Maximize aria-hidden="true" />} onClick={() => setView({ x: 24, y: 16, zoom: fitZoom(layout.frames, viewportRef.current?.clientWidth ?? 1200) })} />
            </div>
          ) : null}
          {canEditGeneral ? <Button size="sm" leadingIcon={<SquarePlus className="h-3.5 w-3.5" />} onClick={() => void addFrame()}>New frame</Button> : null}
          {canCreate ? <Button size="sm" variant="primary" leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setComposer({ sectionId: defaultSectionId })}>Add card</Button> : null}
        </>
      ) : null}
    </div>
  );

  const composerSection = composer ? board.find((section) => section.id === composer.sectionId) ?? null : null;
  const composerPanel = composer && canCreate ? (
    <div ref={composerRef} className={narrow ? "border-b border-line-subtle p-3" : "absolute right-3 top-3 z-30 w-[min(380px,calc(100%-24px))] rounded-card bg-surface p-3 shadow-over"} onPointerDown={(event) => event.stopPropagation()}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <Text size="sm" weight="semibold">Add to {composerSection?.title ?? "Workspace"}</Text>
        <IconButton size="sm" variant="ghost" label="Close" icon={<X aria-hidden="true" />} onClick={() => setComposer(null)} />
      </div>
      <CardComposer key={`${composer.sectionId ?? "default"}:${selectedPhase?.id ?? ""}:${composer.place ? `${composer.place.x},${composer.place.y}` : ""}`} projectId={projectId} sectionId={composer.sectionId} place={composer.place} labelChoices={labelChoices} defaultPhaseId={selectedPhase?.id ?? null} run={run} autoFocus />
    </div>
  ) : null;

  const notice = readOnlyReason || limited ? (
    <div className="px-3 pt-3"><Notice tone="neutral">{{
      archived: "This project is archived, so its Workspace is read-only.",
      inactive: "The Workspace can be changed once the project is active.",
      permission: "You can read this Workspace. Only the project's designer or drafter can change it.",
      limited: "You can write cards for your own phases only; the other cards are read-only for you.",
    }[readOnlyReason ?? "limited"]}</Notice></div>
  ) : null;

  // ── Phone: the frames read top to bottom ───────────────────────────
  if (narrow || lens === "drawings") {
    return (
      <section className="overflow-hidden rounded-card bg-surface shadow-plane" aria-label="Project workspace">
        {toolbar}
        {lens === "drawings" ? <div className="p-3">{drawingList}</div> : (
          <>
            {notice}
            {composerPanel}
            {error ? <div role="alert" className="px-3 pt-3"><InlineError>{error}</InlineError></div> : null}
            <div className="grid gap-3 p-3">
              {board.length === 0 ? <EmptyState title="Start the project's Workspace" description="Write the first card; it goes into the Workspace frame." /> : null}
              {board.map((section) => (
                <section key={section.id} aria-label={section.title} className="grid gap-2 rounded-card bg-surface-muted/50 p-2 shadow-[0_0_0_1px_var(--ui-border-default)]">
                  <header className="flex min-h-9 items-center gap-2 px-1">
                    <div className="min-w-0 flex-1">{frameTitle(section)}</div>
                    {section.isDefault ? <span className="rounded-pill bg-surface px-2 text-[10px] font-semibold text-ink-secondary">Default</span> : null}
                    {canCreate ? <RowActionMenu label={`${section.title} actions`} items={frameMenu(section)} /> : null}
                  </header>
                  {section.cards.length === 0 ? <Text size="sm" tone="tertiary" className="px-1 pb-2">No cards yet.</Text> : section.cards.map((item) => card(item, section.id, undefined, false))}
                </section>
              ))}
            </div>
          </>
        )}
        {confirm.dialog}
      </section>
    );
  }

  // ── Desktop: the free canvas ────────────────────────────────────────
  const dragFrame = drag?.kind === "frame" ? drag : null;
  const dragCard = drag?.kind === "card" ? drag : null;
  const guides = dragFrame ?? dragCard;

  return (
    <section className="overflow-hidden rounded-card bg-surface shadow-plane" aria-label="Project workspace">
      {toolbar}
      {notice}
      {error ? <div role="alert" className="px-3 pt-3"><InlineError>{error}</InlineError></div> : null}
      <div
        ref={viewportRef}
        {...intake.target}
        onPointerDown={onViewportPointerDown}
        onPointerMove={(event) => { lastPointer.current = { x: event.clientX, y: event.clientY }; }}
        onDragOverCapture={(event) => { lastPointer.current = { x: event.clientX, y: event.clientY }; }}
        onDoubleClick={writeAt}
        style={{ height: fitHeight ?? 560 }}
        className={`relative touch-none overflow-hidden bg-canvas ${drag?.kind === "pan" ? "cursor-grabbing" : ""} ${intake.active ? "outline-2 -outline-offset-4 outline-dashed outline-line-focus" : ""}`}
        aria-label="Workspace canvas"
      >
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 [background-image:radial-gradient(var(--ui-border-default)_1px,transparent_1px)]" style={{ backgroundSize: `${24 * view.zoom}px ${24 * view.zoom}px`, backgroundPosition: `${view.x}px ${view.y}px` }} />
        <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
          {board.map((section) => {
            const laid = layout.frames.get(section.id)!;
            const frame = dragFrame?.id === section.id ? { ...laid, x: dragFrame.x, y: dragFrame.y } : drag?.kind === "frame-size" && drag.id === section.id ? { ...laid, w: drag.w, h: drag.h } : laid;
            const target = dragCard && dragCard.to === section.id && dragCard.to !== dragCard.from;
            return (
              <section
                key={section.id}
                aria-label={section.title}
                className={`group/frame absolute rounded-card bg-[color-mix(in_srgb,var(--ui-surface-muted)_55%,transparent)] transition-shadow ${section.isDefault ? "shadow-[0_0_0_1.5px_var(--ui-border-strong)]" : "shadow-[0_0_0_1px_var(--ui-border-default)]"} ${target ? "shadow-[0_0_0_2px_var(--ui-border-focus)]" : ""}`}
                style={{ left: frame.x, top: frame.y, width: frame.w, height: frame.h }}
              >
                <header onPointerDown={startFrameDrag(section)} className={`flex items-center gap-2 pl-3.5 pr-1.5 ${canEditGeneral ? "cursor-grab active:cursor-grabbing" : ""}`} style={{ height: FRAME_HEAD }}>
                  <div className="min-w-0 max-w-[70%]">{frameTitle(section)}</div>
                  {section.isDefault ? <span className="rounded-pill bg-surface px-2 py-0.5 text-[10px] font-semibold text-ink-secondary">Default</span> : null}
                  <span className="flex-1" />
                  {canCreate ? <IconButton size="sm" variant="ghost" label={`Add card to ${section.title}`} icon={<Plus aria-hidden="true" />} onClick={() => setComposer({ sectionId: section.id })} /> : null}
                  {canCreate ? <RowActionMenu label={`${section.title} actions`} items={frameMenu(section)} /> : null}
                </header>
                {section.cards.map((item) => {
                  if (dragCard?.id === item.id) return null;
                  const slot = layout.cards.get(item.id)!;
                  const w = drag?.kind === "card-width" && drag.id === item.id ? drag.w : slot.w;
                  return card(item, section.id, { position: "absolute", left: slot.x, top: slot.y, width: w }, true);
                })}
                {canEditGeneral ? <span aria-hidden="true" onPointerDown={startFrameSize(section)} className="absolute bottom-1 right-1 h-3 w-3 cursor-nwse-resize opacity-0 transition-opacity group-hover/frame:opacity-100 [background:linear-gradient(135deg,transparent_50%,var(--ui-border-strong)_50%_60%,transparent_60%_72%,var(--ui-border-strong)_72%_82%,transparent_82%)]" /> : null}
              </section>
            );
          })}
          {dragCard ? (() => {
            const entry = cardIndex.get(dragCard.id);
            return entry ? <div className="pointer-events-none absolute" style={{ left: dragCard.x, top: dragCard.y, width: dragCard.w }}>{card(entry.card, entry.sectionId, { width: dragCard.w }, false)}</div> : null;
          })() : null}
          {guides?.guideX != null ? <div aria-hidden="true" className="pointer-events-none absolute -top-[5000px] h-[10000px] w-px bg-line-focus opacity-40" style={{ left: guides.guideX }} /> : null}
          {guides?.guideY != null ? <div aria-hidden="true" className="pointer-events-none absolute -left-[5000px] h-px w-[10000px] bg-line-focus opacity-40" style={{ top: guides.guideY }} /> : null}
        </div>
        {board.length === 0 ? (
          <div className="absolute inset-0 grid place-items-center p-6">
            <EmptyState title="Start the project's Workspace" description="Write the first card; it goes into the Workspace frame. Arrange frames and cards freely afterwards." />
          </div>
        ) : null}
        {composerPanel}
        <div className="pointer-events-none absolute bottom-3 left-3 rounded-action bg-surface px-2.5 py-1.5 text-xs text-ink-tertiary shadow-float">Middle-click and drag to move around · Wheel to zoom · Double-click to write · Paste or drop an image</div>
      </div>
      {confirm.dialog}
    </section>
  );
}
