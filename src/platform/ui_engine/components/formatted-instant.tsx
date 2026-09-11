import { formatInstant } from "@platform/utilities/date";

/**
 * Renders a UTC instant as a `<time>` element using the platform canonical
 * date formatters. Locale and timezone are passed explicitly so this
 * component is safe in both Server Components (settings from DB) and Client
 * Components (settings from `useDisplaySettings()`).
 *
 * @param value     A UTC ISO-8601 string or a Date object.
 * @param locale    BCP-47 locale tag sourced from platform settings (e.g. "id-ID").
 * @param timeZone  IANA timezone sourced from platform settings (e.g. "Asia/Jakarta").
 * @param style     "date" (default) — medium date only; "datetime" — date + short time.
 */
export function FormattedInstant({
  value,
  locale,
  timeZone,
  style = "date",
}: {
  value: Date | string;
  locale: string;
  timeZone: string;
  style?: "date" | "datetime";
}) {
  const iso = typeof value === "string" ? value : value.toISOString();
  return <time dateTime={iso}>{formatInstant(iso, { locale, timeZone, style })}</time>;
}
