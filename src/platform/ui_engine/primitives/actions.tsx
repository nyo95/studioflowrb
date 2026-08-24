"use client";

import { LoaderCircle } from "lucide-react";
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from "react";

import { cx } from "../internal/cx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

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
      className={cx("ui-button", className)}
      data-variant={variant}
      data-size={size}
      aria-busy={pending || undefined}
      disabled={disabled || pending}
      {...props}
    >
      {pending ? <LoaderCircle className="ui-button-spinner" aria-hidden="true" /> : leadingIcon}
      <span>{children}</span>
      {!pending && trailingIcon}
    </button>
  );
});

export type IconButtonProps = Omit<ButtonProps, "children" | "leadingIcon" | "trailingIcon"> & {
  label: string;
  icon: ReactNode;
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, className, title, ...props },
  ref,
) {
  return (
    <Button
      ref={ref}
      className={cx("ui-icon-button", className)}
      aria-label={label}
      title={title ?? label}
      {...props}
    >
      {icon}
    </Button>
  );
});

export function Spinner({
  label = "Loading",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { label?: string }) {
  return (
    <span className={cx("ui-spinner", className)} role="status" aria-label={label} {...props}>
      <LoaderCircle aria-hidden="true" />
    </span>
  );
}
