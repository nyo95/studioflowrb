"use client";

import { X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { Button } from "../primitives";

/** A step already resolved to one language. `anchor` is a CSS selector, or `center` for a card with no highlight. */
export type GuidedTourStep = { id: string; anchor: string; title: string; body: string };
export type GuidedTourLanguage = "id" | "en";
export type GuidedTourLabels = {
  next: string;
  back: string;
  skip: string;
  done: string;
  close: string;
  progress: (step: number, total: number) => string;
  pickTitle: string;
  pickBody: string;
};

export const TOUR_CENTER_ANCHOR = "center";

/** The visible element a selector points at, or null when it is missing or hidden (another role, a phone layout). */
export function findTourAnchor(anchor: string): HTMLElement | null {
  if (anchor === TOUR_CENTER_ANCHOR || typeof document === "undefined") return null;
  let candidates: NodeListOf<HTMLElement>;
  try { candidates = document.querySelectorAll<HTMLElement>(anchor); } catch { return null; }
  for (const element of candidates) {
    const box = element.getBoundingClientRect();
    if (box.width > 0 && box.height > 0) return element;
  }
  return null;
}

/** Steps whose anchor is on screen right now; a `center` step is always kept. */
export function visibleTourSteps<T extends { anchor: string }>(steps: readonly T[]): T[] {
  return steps.filter((step) => step.anchor === TOUR_CENTER_ANCHOR || findTourAnchor(step.anchor) !== null);
}

const CARD_WIDTH = 352;
const GAP = 14;

type Place = { left: number; top: number } | null;

function cardPlace(target: DOMRect | null, cardHeight: number): Place {
  if (!target || window.innerWidth < 640) return null;
  const room = window.innerWidth - 16;
  let left = target.right + GAP;
  let top = target.top;
  /* At 840px and below the rail is a horizontal strip, so beside the control would cover its neighbours. */
  if (window.innerWidth <= 840 || left + CARD_WIDTH > room) { left = Math.min(Math.max(8, target.left), room - CARD_WIDTH); top = target.bottom + GAP; }
  top = Math.max(8, Math.min(top, window.innerHeight - cardHeight - 8));
  return { left, top };
}

/**
 * A light, non-blocking first-use tour: a card, and a ring round the real control it talks about. It never
 * forces an action (the page underneath stays usable) and can be left at any moment with Skip, the close
 * button or Escape. With `languagePick`, the first card asks Indonesian or English before step 1.
 */
export function GuidedTour({ steps, labels, language, languagePick = false, onPickLanguage, onSwitchLanguage, onFinish }: {
  steps: readonly GuidedTourStep[];
  labels: GuidedTourLabels;
  language: GuidedTourLanguage;
  languagePick?: boolean;
  onPickLanguage: (language: GuidedTourLanguage) => void;
  onSwitchLanguage: (language: GuidedTourLanguage) => void;
  onFinish: (state: "completed" | "dismissed") => void;
}) {
  const [index, setIndex] = useState(0);
  const [target, setTarget] = useState<DOMRect | null>(null);
  const [place, setPlace] = useState<Place>(null);
  const card = useRef<HTMLDivElement>(null);
  const step = steps[Math.min(index, steps.length - 1)];
  const last = index >= steps.length - 1;

  useLayoutEffect(() => {
    if (languagePick || !step) return;
    const measure = () => {
      const element = findTourAnchor(step.anchor);
      const box = element ? element.getBoundingClientRect() : null;
      setTarget(box);
      setPlace(cardPlace(box, card.current?.offsetHeight ?? 200));
    };
    findTourAnchor(step.anchor)?.scrollIntoView({ block: "nearest", inline: "nearest" });
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => { window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true); };
  }, [step, languagePick]);

  useEffect(() => { card.current?.focus({ preventScroll: true }); }, [index, languagePick]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onFinish("dismissed"); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onFinish]);

  if (!languagePick && !step) return null;
  const title = languagePick ? labels.pickTitle : step.title;
  /* A phone, or a step with no anchor, docks the card (bottom edge / middle) instead of floating beside a control. */
  const style = languagePick || !target || !place ? undefined : { left: place.left, top: place.top, width: CARD_WIDTH };
  const dock = style ? "" : (languagePick || !target ? "left-1/2 top-1/2 w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2" : "bottom-4 left-1/2 w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2");

  return (
    <>
      {!languagePick && target ? (
        <div aria-hidden="true" className="pointer-events-none fixed z-[80] rounded-control ring-2 ring-action transition-all duration-150" style={{ left: target.left - 4, top: target.top - 4, width: target.width + 8, height: target.height + 8, boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.35)" }} />
      ) : null}
      {languagePick || !target ? <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[80] bg-black/35" /> : null}
      <div
        ref={card}
        role="dialog"
        aria-modal="false"
        aria-label={title}
        tabIndex={-1}
        style={style}
        className={`fixed z-[81] rounded-card border border-line bg-surface-raised p-4 shadow-elevated outline-none ${dock}`}
      >
        <div className="flex items-start gap-2">
          <h2 className="m-0 min-w-0 flex-1 text-base font-semibold text-ink">{title}</h2>
          <button type="button" aria-label={labels.close} onClick={() => onFinish("dismissed")} className="grid h-7 w-7 shrink-0 place-items-center rounded-action text-ink-secondary hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-line-focus"><X size={16} aria-hidden="true" /></button>
        </div>
        {languagePick ? (
          <>
            <p className="mb-3 mt-1.5 text-sm text-ink-secondary">{labels.pickBody}</p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="primary" onClick={() => onPickLanguage("id")}>Bahasa Indonesia</Button>
              <Button variant="secondary" onClick={() => onPickLanguage("en")}>English</Button>
            </div>
          </>
        ) : (
          <>
            <p className="mb-3 mt-1.5 text-sm leading-relaxed text-ink-secondary">{step.body}</p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-ink-tertiary">{labels.progress(index + 1, steps.length)}</span>
              <div className="ml-auto flex items-center gap-1.5">
                <button type="button" onClick={() => onSwitchLanguage(language === "id" ? "en" : "id")} className="rounded-action px-1.5 py-1 text-xs font-medium text-ink-tertiary hover:text-ink focus-visible:outline-2 focus-visible:outline-line-focus" aria-label={language === "id" ? "Switch to English" : "Ganti ke Bahasa Indonesia"}>{language === "id" ? "EN" : "ID"}</button>
                {index > 0 ? <Button size="sm" variant="ghost" onClick={() => setIndex(index - 1)}>{labels.back}</Button> : <Button size="sm" variant="ghost" onClick={() => onFinish("dismissed")}>{labels.skip}</Button>}
                {last ? <Button size="sm" variant="primary" onClick={() => onFinish("completed")}>{labels.done}</Button> : <Button size="sm" variant="primary" onClick={() => setIndex(index + 1)}>{labels.next}</Button>}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
