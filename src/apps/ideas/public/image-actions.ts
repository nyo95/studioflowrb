"use server";

import { saveNoteImageToIdeasAction as saveIdea } from "../actions";

export async function saveNoteImageToIdeasAction(input: Parameters<typeof saveIdea>[0]) {
  return saveIdea(input);
}
