import "server-only";

import { ideas } from "@/apps/ideas/runtime";
import { addStoredImageToMoodboard } from "@/apps/presentation/public/lifecycle";
import type { IdeasContext } from "@/apps/ideas/public/service";

export async function addIdeaImageToMoodboard(input: IdeasContext & { cardId: string; projectId: string }) {
  const source = await ideas.readIdeaImageSource(input);
  return addStoredImageToMoodboard({ ...input, source });
}
