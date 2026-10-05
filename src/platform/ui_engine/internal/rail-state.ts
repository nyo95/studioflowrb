/**
 * The narrow-navigation media query. It must select exactly the widths the shell's `max-[840px]:` utilities
 * style: Tailwind v4 compiles `max-[840px]` to `(width < 840px)`. A JS query of `(max-width: 840px)` also
 * matched exactly 840px, where CSS still drew the desktop rail — so at 840px the rail stood vertical but was
 * forced expanded with no collapse control (external audit, 2026-10-04).
 */
export const NARROW_NAVIGATION_QUERY = "(width < 840px)";

export function getEffectiveRailCollapsed(
  collapsible: boolean,
  narrowNavigation: boolean,
  storedCollapsed: boolean,
): boolean {
  return collapsible && !narrowNavigation && storedCollapsed;
}
