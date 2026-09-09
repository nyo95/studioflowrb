"use client";

import { LoaderCircle } from "lucide-react";
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from "react";

import { cx } from "../internal/cx";

import { buttonClasses, BUTTON_BASE_CLASSES, BUTTON_SIZE_CLASSES, BUTTON_VARIANT_CLASSES, type ButtonSize, type ButtonVariant, filterChipClasses } from "./button-classes";

export type { ButtonVariant, ButtonSize } from "./button-classes";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  pending?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "secondary",
    size = "md",
    pending = false,
    leadingIcon,
    trailingIcon,
    className,
    children,
    disabled,
    type = "button",
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(BUTTON_BASE_CLASSES, BUTTON_SIZE_CLASSES[size], BUTTON_VARIANT_CLASSES[variant], className)}
      aria-busy={pending || undefined}
      disabled={disabled || pending}
      {...props}
    >
      {pending ? <LoaderCircle className="animate-ui-spin" aria-hidden="true" /> : leadingIcon}
      <span className="inline-flex items-center gap-[7px] whitespace-nowrap">{children}</span>
      {!pending && trailingIcon}
    </button>
  );
});

export type IconButtonProps = Omit<ButtonProps, "children" | "leadingIcon" | "trailingIcon"> & {
  label: string;
  icon: ReactNode;
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, className, title, size = "md", ...props },
  ref,
) {
  return (
    <Button
      ref={ref}
      size={size}
      className={cx("w-(--ui-control-height-md) !p-0", size === "sm" && "w-(--ui-control-height-sm)", className)}
      aria-label={label}
      // The native tooltip stays the fallback for an icon button nobody wrapped.
      // The shared Tooltip strips it from its own child, so the two never race.
      title={title ?? label}
      {...props}
    >
      {icon}
    </Button>
  );
});

export function Spinner({
  label = "Loading",
  decorative = false,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  label?: string;
  /** Use inside a container that already announces the loading state, so the
   *  same message is not read out twice. */
  decorative?: boolean;
}) {
  return (
    <span
      className={cx("inline-flex text-ink-secondary [&_svg]:h-[18px] [&_svg]:w-[18px] [&_svg]:animate-ui-spin", className)}
      role={decorative ? undefined : "status"}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative || undefined}
      {...props}
    >
      <LoaderCircle aria-hidden="true" />
    </span>
  );
}

export type FilterChipProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
  selected?: boolean;
  /** Optional trailing count, e.g. "Unassigned · 3". */
  count?: ReactNode;
};

/**
 * A single toggle in a filter row. Rendered as a real button with
 * aria-pressed so the selected filter is announced, not merely filled.
 */
export function FilterChip({ selected = false, count, className, children, ...props }: FilterChipProps) {
  return (
    <button type="button" aria-pressed={selected} className={cx(filterChipClasses(selected), className)} {...props}>
      {children}
      {count !== undefined && count !== null ? (
        <span className={cx("tabular-nums", selected ? "opacity-80" : "text-ink-tertiary")}>
          <span aria-hidden="true">· </span>
          {count}
        </span>
      ) : null}
    </button>
  );
}
