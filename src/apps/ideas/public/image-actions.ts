"use server";

import {
  applyNoteImageToScheduleAction as applySchedule,
  saveNoteImageToIdeasAction as saveIdea,
} from "../actions";

export async function applyNoteImageToScheduleAction(input: Parameters<typeof applySchedule>[0]) {
  return applySchedule(input);
}

export async function saveNoteImageToIdeasAction(input: Parameters<typeof saveIdea>[0]) {
  return saveIdea(input);
}
