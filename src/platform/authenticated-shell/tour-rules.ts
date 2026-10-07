import type { AppTutorial, TutorialProgress } from "@platform/core/tutorials";
import type { GuidedTourLabels, GuidedTourLanguage, GuidedTourStep } from "@/platform/ui_engine";

/** One app's registered tour and the path prefix it belongs to. The app owns the steps; the shell only plays them. */
export type ShellTour = { appRootPath: string; tour: AppTutorial };

export const TOUR_LABELS: Record<GuidedTourLanguage, GuidedTourLabels> = {
  id: {
    next: "Lanjut", back: "Kembali", skip: "Lewati", done: "Selesai", close: "Tutup panduan",
    progress: (step, total) => `Langkah ${step} dari ${total}`,
    pickTitle: "Pilih bahasa panduan", pickBody: "Panduan singkat ini membantu Anda mulai. Anda bisa menutupnya kapan saja dan membukanya lagi dari menu akun.",
  },
  en: {
    next: "Next", back: "Back", skip: "Skip", done: "Done", close: "Close guide",
    progress: (step, total) => `Step ${step} of ${total}`,
    pickTitle: "Choose the guide language", pickBody: "This short guide helps you get started. Close it any time and reopen it from the account menu.",
  },
};

export const REPLAY_LABEL: Record<GuidedTourLanguage, string> = { id: "Bantuan: ulangi panduan", en: "Help: replay guide" };

/** The tour of the app the person is in, or null outside any app with a tour (the launcher, Settings, Account). */
export function tourForPath(pathname: string, tours: readonly ShellTour[]): ShellTour | null {
  return tours.find(({ appRootPath }) => pathname === appRootPath || pathname.startsWith(`${appRootPath}/`)) ?? null;
}

/** First-use rule: never seen (completed or dismissed) means show once; a stored row, of any version, stops it. */
export function shouldAutoShow(tour: AppTutorial, progress: readonly Pick<TutorialProgress, "tourKey">[]): boolean {
  return !progress.some((row) => row.tourKey === tour.key);
}

/** The steps this person may see (permission-gated steps drop out) in the chosen language. */
export function stepsFor(tour: AppTutorial, grants: readonly string[], language: GuidedTourLanguage): GuidedTourStep[] {
  return tour.steps
    .filter((step) => !step.requires || grants.includes(step.requires))
    .map((step) => ({ id: step.id, anchor: step.anchor, title: step.title[language], body: step.body[language] }));
}
