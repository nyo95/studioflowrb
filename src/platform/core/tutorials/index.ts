import type { PrismaClient } from "@/generated/prisma/client";
import { AppError } from "@platform/core/errors";
import type { PermissionId } from "@platform/core/rbac";

export const TUTORIAL_STATES = ["completed", "dismissed"] as const;
export type TutorialState = (typeof TUTORIAL_STATES)[number];
export type TutorialText = { id: string; en: string };
export type TutorialStep = { id: string; anchor: string; requires?: PermissionId; title: TutorialText; body: TutorialText };
export type AppTutorial = { key: string; version: number; steps: readonly TutorialStep[] };
export type TutorialProgress = { tourKey: string; version: number; state: TutorialState; updatedAt: Date };
export type ShellTutorialState = { language: "id" | "en" | null; tutorials: TutorialProgress[] };

const TOUR_KEY = /^[a-z][a-z0-9-]{0,39}$/;

function invalid(code: string, message: string): never { throw new AppError("VALIDATION", code, message); }
function isState(value: string): value is TutorialState { return (TUTORIAL_STATES as readonly string[]).includes(value); }
function requireTourKey(value: unknown): asserts value is string {
  if (typeof value !== "string" || !TOUR_KEY.test(value)) invalid("TUTORIAL_KEY", "Choose a valid tour key.");
}
function requireVersion(value: unknown): asserts value is number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) invalid("TUTORIAL_VERSION", "Choose a whole tour version of at least 1.");
}
function requireState(value: unknown): asserts value is TutorialState {
  if (typeof value !== "string" || !isState(value)) invalid("TUTORIAL_STATE", "Choose Completed or Dismissed.");
}
function toProgress(row: { tour_key: string; version: number; state: string; updated_at: Date }): TutorialProgress {
  // The SQL check is the persistence authority; this preserves a safe public type if old data is corrupt.
  if (!isState(row.state)) invalid("TUTORIAL_STATE", "The saved tutorial state is invalid.");
  return { tourKey: row.tour_key, version: row.version, state: row.state, updatedAt: row.updated_at };
}

/** Validates app-owned tour content without registering it or importing app code. */
export function validateAppTutorial(tour: AppTutorial): AppTutorial {
  requireTourKey(tour.key);
  requireVersion(tour.version);
  if (!Array.isArray(tour.steps) || tour.steps.length < 1 || tour.steps.length > 4) invalid("TUTORIAL_STEPS", "A tour needs 1 to 4 steps.");
  const stepIds = new Set<string>();
  for (const step of tour.steps) {
    if (!step || typeof step.id !== "string" || step.id.trim() === "" || typeof step.anchor !== "string" || step.anchor.trim() === "") {
      invalid("TUTORIAL_STEP", "Each tour step needs an id and screen anchor.");
    }
    if (stepIds.has(step.id)) invalid("TUTORIAL_STEP", "Each tour step needs its own id.");
    stepIds.add(step.id);
    for (const text of [step.title, step.body]) {
      if (!text || typeof text.id !== "string" || text.id.trim() === "" || typeof text.en !== "string" || text.en.trim() === "") {
        invalid("TUTORIAL_TEXT", "Each tour step needs Indonesian and English text.");
      }
    }
  }
  return tour;
}

export function createUserTutorialService(db: PrismaClient) {
  return {
    async list(input: { userId: string }): Promise<TutorialProgress[]> {
      return (await db.userTutorial.findMany({ where: { user_id: input.userId }, orderBy: { tour_key: "asc" } })).map(toProgress);
    },
    async record(input: { userId: string; tourKey: string; version: number; state: TutorialState }): Promise<TutorialProgress> {
      requireTourKey(input.tourKey);
      requireVersion(input.version);
      requireState(input.state);
      return toProgress(await db.userTutorial.upsert({
        where: { user_id_tour_key: { user_id: input.userId, tour_key: input.tourKey } },
        create: { user_id: input.userId, tour_key: input.tourKey, version: input.version, state: input.state },
        update: { version: input.version, state: input.state },
      }));
    },
    async clear(input: { userId: string; tourKey: string }): Promise<void> {
      requireTourKey(input.tourKey);
      await db.userTutorial.deleteMany({ where: { user_id: input.userId, tour_key: input.tourKey } });
    },
    /** One runtime call for shell consumers: guide language plus this person's progress only. */
    async getShellState(input: { userId: string; language: ShellTutorialState["language"] }): Promise<ShellTutorialState> {
      const tutorials = await db.userTutorial.findMany({ where: { user_id: input.userId }, orderBy: { tour_key: "asc" } });
      return { language: input.language, tutorials: tutorials.map(toProgress) };
    },
  };
}
