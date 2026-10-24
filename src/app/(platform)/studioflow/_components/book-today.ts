import "server-only";

import { prisma } from "@platform/core/db";
import { readPlatformGeneralSettings } from "@platform/core/settings";
import { currentDateOnly } from "@platform/utilities/date";

/** Date display settings for the book, read once from the platform-wide settings. */
export async function bookDateDisplaySettings(): Promise<{ today: string; locale: string }> {
  const { timezone, locale } = await readPlatformGeneralSettings(prisma);
  return { today: currentDateOnly({ timeZone: timezone }), locale };
}
