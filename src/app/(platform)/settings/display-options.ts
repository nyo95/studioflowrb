/** Timezones offered by General Settings (organisation default) and My preferences (personal override). */
export const TIMEZONE_CHOICES = [
  "Asia/Jakarta",
  "Asia/Makassar",
  "Asia/Jayapura",
  "Asia/Singapore",
  "Asia/Tokyo",
  "UTC",
  "Europe/London",
  "America/New_York",
] as const;

/** Date and number formats a person may pick for themselves; the organisation default is set in General Settings. */
export const LOCALE_CHOICES = [
  { value: "id-ID", label: "Indonesia (id-ID)" },
  { value: "en-US", label: "English, US (en-US)" },
  { value: "en-GB", label: "English, UK (en-GB)" },
] as const;
