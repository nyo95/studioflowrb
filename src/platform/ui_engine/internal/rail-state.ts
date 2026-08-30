export function getEffectiveRailCollapsed(
  collapsible: boolean,
  narrowNavigation: boolean,
  storedCollapsed: boolean,
): boolean {
  return collapsible && !narrowNavigation && storedCollapsed;
}
