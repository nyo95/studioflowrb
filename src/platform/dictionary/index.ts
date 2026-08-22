/** Shared business vocabulary and enums belong here when truly cross-app. */
export const APP_IDS = ["studioflow", "masterdata", "bq"] as const;
export type AppId = (typeof APP_IDS)[number];
