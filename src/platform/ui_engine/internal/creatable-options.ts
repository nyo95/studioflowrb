/**
 * A value created from the search box exists before the app's option list knows about it — an app may
 * keep the typed text as the value without adding an option, or refresh its list only later. Until the
 * list carries an option with that id, the engine keeps showing the created one, so the trigger names
 * the new value instead of falling back to the placeholder as if nothing were chosen.
 */
export function withCreatedOption<T extends { id: string; label: string }>(options: readonly T[], created: T | null): readonly T[] {
  if (!created || options.some((option) => option.id === created.id)) return options;
  return [...options, created];
}
