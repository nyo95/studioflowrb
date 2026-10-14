"use server";

import { addWorkspaceImageToMoodboardAction as addWorkspaceImage } from "../actions";

export async function addWorkspaceImageToMoodboardAction(input: Parameters<typeof addWorkspaceImage>[0]) {
  return addWorkspaceImage(input);
}
