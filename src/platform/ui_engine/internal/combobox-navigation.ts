export type ComboboxNavigationKey = "ArrowDown" | "ArrowUp" | "Home" | "End";

export function getComboboxNavigationIndex(
  disabled: readonly boolean[],
  currentIndex: number,
  key: ComboboxNavigationKey,
): number | null {
  const enabled = disabled
    .map((isDisabled, index) => isDisabled ? null : index)
    .filter((index): index is number => index !== null);

  if (!enabled.length) return null;
  if (key === "Home") return enabled[0];
  if (key === "End") return enabled[enabled.length - 1];

  const position = enabled.indexOf(currentIndex);
  if (position === -1) return key === "ArrowUp" ? enabled[enabled.length - 1] : enabled[0];
  const offset = key === "ArrowDown" ? 1 : -1;
  return enabled[(position + offset + enabled.length) % enabled.length];
}
