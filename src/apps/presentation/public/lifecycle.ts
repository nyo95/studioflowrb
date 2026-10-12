import "server-only";

import type { PresentationCommandContext, PresentationReadContext } from "../shared";
import { presentation } from "../runtime";

export function countProjectBoards(input: PresentationReadContext & { projectId: string }) { return presentation.countProjectBoards(input); }
export function addStoredImageToMoodboard(input: PresentationCommandContext & { projectId: string; source: { key: string; contentType: string } }) { return presentation.addStoredImageToMoodboard(input); }
export function clearScheduleEntryLink(entryId: string) { return presentation.clearScheduleEntryLink(entryId); }
export function purgeArchivedProjectAssets(projectId: string) { return presentation.purgeArchivedProjectAssets(projectId); }
export function retryPresentationAssetCleanup(limit?: number) { return presentation.retryAssetCleanup(limit); }
