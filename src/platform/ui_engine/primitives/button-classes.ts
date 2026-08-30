import { cx } from "../internal/cx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

export const BUTTON_BASE_CLASSES =
  "inline-flex min-w-0 items-center justify-center gap-[7px] rounded-action border border-transparent font-semibold leading-none cursor-pointer transition-[background-color,border-color,color] duration-[120ms] disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0";

export const BUTTON_SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "min-h-(--ui-control-height-sm) px-2.5 text-xs",
  md: "min-h-(--ui-control-height-md) px-3 text-sm",
};

export const BUTTON_VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-action text-ink-inverse enabled:hover:bg-action-hover",
  secondary: "bg-surface text-ink border-line enabled:hover:bg-surface-muted enabled:hover:border-line-strong",
  ghost: "bg-transparent text-ink-secondary enabled:hover:bg-surface-muted enabled:hover:text-ink",
  danger: "bg-danger-surface text-danger border-danger-line",
};

/**
 * Button chrome for non-button elements (e.g. next/link) that must read as
 * actions. Lives outside the client boundary so server components can call it.
 */
export function buttonClasses(variant: ButtonVariant = "secondary", size: ButtonSize = "md"): string {
  return cx(BUTTON_BASE_CLASSES, BUTTON_SIZE_CLASSES[size], BUTTON_VARIANT_CLASSES[variant]);
}
