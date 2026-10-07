import type { AppTutorial } from "@platform/core/tutorials";

/**
 * StudioFlow's first-use tour (WO-PLAT-TOUR-01). The app owns the words and the anchors; the platform shell
 * only plays it. An `anchor` is a CSS selector for a control that must be on screen, or `center` for a card
 * with no highlight; a step whose control is hidden (another role, a phone layout) is skipped.
 */
export const STUDIOFLOW_TOUR: AppTutorial = {
  key: "studioflow",
  version: 1,
  steps: [
    {
      id: "home",
      anchor: 'a[href="/studioflow"]',
      title: { id: "Mulai dari Home", en: "Start from Home" },
      body: {
        id: "Di sini Anda melihat pekerjaan yang sedang berjalan dan apa yang menunggu Anda.",
        en: "Here you see the work in progress and what is waiting on you.",
      },
    },
    {
      id: "projects",
      anchor: 'a[href="/studioflow/projects"]',
      requires: "studioflow.project.read",
      title: { id: "Buka proyek", en: "Open a project" },
      body: {
        id: "Semua dokumen dan perkembangan satu proyek ada di satu tempat.",
        en: "All the documents and progress of a project are in one place.",
      },
    },
    {
      id: "phases",
      anchor: "center",
      title: { id: "Kerjakan per fase", en: "Work phase by phase" },
      body: {
        id: "Di dalam proyek, kerjakan satu fase demi satu fase: kirim hasil ke klien, baca masukan mereka, lalu lanjutkan ke putaran berikutnya.",
        en: "Inside a project, work one phase at a time: send the result to the client, read their feedback, then continue with the next round.",
      },
    },
    {
      id: "reminders",
      anchor: 'button[aria-label^="Notifications"]',
      title: { id: "Cek pengingat dan berkas", en: "Check reminders and files" },
      body: {
        id: "Pengingat muncul di lonceng ini. Cek juga berkas proyek, supaya kebutuhan dan hasil kerja tidak ada yang tertinggal.",
        en: "Reminders show up on this bell. Also check the project files, so no requirement or deliverable is left behind.",
      },
    },
  ],
};
