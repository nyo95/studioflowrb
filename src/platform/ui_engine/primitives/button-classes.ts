import { cx } from "../internal/cx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "danger-primary";
export type ButtonSize = "sm" | "md";

export const BUTTON_BASE_CLASSES =
  "inline-flex min-w-0 shrink-0 items-center justify-center gap-[7px] whitespace-nowrap rounded-action border border-transparent font-medium leading-none cursor-pointer transition-[background-color,border-color,color] duration-[120ms] disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0";

export const BUTTON_SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "min-h-(--ui-control-height-sm) px-2.5 text-xs",
  md: "min-h-(--ui-control-height-md) px-3 text-sm",
};

export const BUTTON_VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-action text-ink-inverse enabled:hover:bg-action-hover",
  secondary: "bg-surface text-ink border-line enabled:hover:bg-surface-muted enabled:hover:border-line-strong",
  ghost: "bg-transparent text-ink-secondary enabled:hover:bg-surface-muted enabled:hover:text-ink",
  danger: "bg-danger-surface text-danger border-danger-line",
  "danger-primary": "bg-danger text-ink-inverse border-danger enabled:hover:brightness-90",
};

/**
 * Button chrome for non-button elements (e.g. next/link) that must read as
 * actions. Lives outside the client boundary so server components can call it.
 */
export function buttonClasses(variant: ButtonVariant = "secondary", size: ButtonSize = "md"): string {
  return cx(BUTTON_BASE_CLASSES, BUTTON_SIZE_CLASSES[size], BUTTON_VARIANT_CLASSES[variant]);
}

export const FILTER_CHIP_BASE_CLASSES =
  "inline-flex min-h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill border px-2.5 text-xs leading-none no-underline cursor-pointer transition-[background-color,border-color,color] duration-[120ms] disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:shrink-0";

/**
 * Filter chip chrome. Selection is carried by fill and weight, not colour
 * alone, and the caller is expected to also set aria-pressed (button) or
 * aria-current (link) so the state reaches assistive technology.
 */
export function filterChipClasses(selected = false): string {
  return cx(
    FILTER_CHIP_BASE_CLASSES,
    selected
      ? "border-action bg-action font-semibold text-ink-inverse"
      : "border-line bg-surface font-medium text-ink-secondary hover:bg-surface-muted hover:text-ink",
  );
}
