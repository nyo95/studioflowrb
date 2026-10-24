import "server-only";

import { prisma } from "@platform/core/db";
import { readPlatformGeneralSettings } from "@platform/core/settings";
import { currentDateOnly } from "@platform/utilities/date";

/** Today's calendar date (`YYYY-MM-DD`) in the platform time zone: what a to-do's due date is compared with. */
export async function todayInPlatformZone(): Promise<string> {
  const { timezone } = await readPlatformGeneralSettings(prisma);
  return currentDateOnly({ timeZone: timezone });
}
