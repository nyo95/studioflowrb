"use client";

import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { TutorialProgress } from "@platform/core/tutorials";
import { GuidedTour, visibleTourSteps, type GuidedTourLanguage, type GuidedTourStep } from "@/platform/ui_engine";

import { REPLAY_LABEL, shouldAutoShow, stepsFor, TOUR_LABELS, tourForPath, type ShellTour } from "./tour-rules";

/** Server actions the layout hands in, so the shell never imports from the app layer. Both act on the signed-in person only. */
export type TourActions = {
  record: (input: { tourKey: string; version: number; state: "completed" | "dismissed" }) => Promise<unknown>;
  setLanguage: (input: { language: GuidedTourLanguage }) => Promise<unknown>;
};

type TourContextValue = { available: boolean; replayLabel: string; replay: () => void };
const TourContext = createContext<TourContextValue>({ available: false, replayLabel: REPLAY_LABEL.en, replay: () => undefined });

/** `available` is true only inside an app that registered a tour; the account menu shows its Help item from it. */
export function useTour(): TourContextValue { return useContext(TourContext); }

const AUTO_START_DELAY_MS = 700;

export function TourProvider({ tours, grants, language, progress, actions, children }: {
  tours: readonly ShellTour[];
  grants: readonly string[];
  language: GuidedTourLanguage | null;
  progress: readonly Pick<TutorialProgress, "tourKey">[];
  actions: TourActions;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const current = tourForPath(pathname, tours);
  const [lang, setLang] = useState<GuidedTourLanguage | null>(language);
  const [run, setRun] = useState(0);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [visible, setVisible] = useState<readonly string[]>([]);
  const [seen, setSeen] = useState<ReadonlySet<string>>(() => new Set());
  const startedFor = useRef<string | null>(null);
  const tour = current?.tour ?? null;

  const start = useCallback(() => {
    if (!tour) return;
    const steps = visibleTourSteps(stepsFor(tour, grants, "en"));
    if (steps.length === 0) return;
    setVisible(steps.map((step) => step.id));
    setRun((value) => value + 1);
    setOpenKey(tour.key);
  }, [tour, grants]);

  useEffect(() => {
    if (!tour || startedFor.current === tour.key) return;
    if (seen.has(tour.key) || !shouldAutoShow(tour, progress)) return;
    // Remember the start only when it really happens. A refresh of the layout while the tour is open (choosing the
    // language saves it, which revalidates the page) changes `progress`; it must not start the tour over at step 1.
    const timer = setTimeout(() => { startedFor.current = tour.key; start(); }, AUTO_START_DELAY_MS);
    return () => clearTimeout(timer);
  }, [tour, progress, seen, start]);

  const finish = useCallback((state: "completed" | "dismissed") => {
    if (!tour) return;
    setOpenKey(null);
    setSeen((previous) => new Set(previous).add(tour.key));
    void actions.record({ tourKey: tour.key, version: tour.version, state });
  }, [tour, actions]);

  const choose = useCallback((next: GuidedTourLanguage) => {
    setLang(next);
    void actions.setLanguage({ language: next });
  }, [actions]);

  const shownLanguage: GuidedTourLanguage = lang ?? "id";
  const steps: GuidedTourStep[] = tour && openKey === tour.key ? stepsFor(tour, grants, shownLanguage).filter((step) => visible.includes(step.id)) : [];
  const value = useMemo<TourContextValue>(() => ({ available: tour !== null, replayLabel: REPLAY_LABEL[lang ?? "en"], replay: start }), [tour, lang, start]);

  return (
    <TourContext.Provider value={value}>
      {children}
      {tour && openKey === tour.key && steps.length > 0 ? (
        <GuidedTour
          key={`${tour.key}-${run}`}
          steps={steps}
          labels={TOUR_LABELS[shownLanguage]}
          language={shownLanguage}
          languagePick={lang === null}
          onPickLanguage={choose}
          onSwitchLanguage={choose}
          onFinish={finish}
        />
      ) : null}
    </TourContext.Provider>
  );
}
