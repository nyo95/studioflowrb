import "server-only";

import type { CommandContext } from "../shared";
import { studioFlow } from "../runtime";

/** Transitional public door; ownership moves unchanged to Presentation in its M3 revision. */
export function addStoredImageToMoodboard(input: CommandContext & { projectId: string; source: { key: string; contentType: string } }) {
  return studioFlow.presentation.addStoredImageToMoodboard(input);
}
