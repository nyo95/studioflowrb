import type { HTMLAttributes, ReactNode } from "react";

import { cx } from "../internal/cx";

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export type HeadingProps = HTMLAttributes<HTMLHeadingElement> & {
  level?: HeadingLevel;
};

/* H1–H2 carry the serif product identity; H3–H6 are sans operational heads. */
const HEADING_LEVEL_CLASSES: Record<HeadingLevel, string> = {
  1: "font-display font-[650] tracking-[-0.025em] text-[2rem]",
  2: "font-display font-[650] tracking-[-0.025em] text-[1.5rem]",
  3: "text-[1.125rem] font-semibold",
  4: "text-base font-semibold",
  5: "text-sm font-semibold",
  6: "text-xs font-semibold",
};

export function Heading({ level = 2, className, ...props }: HeadingProps) {
  const Tag = `h${level}` as keyof Pick<HTMLElementTagNameMap, "h1" | "h2" | "h3" | "h4" | "h5" | "h6">;
  return <Tag className={cx("m-0 leading-[1.2] text-ink", HEADING_LEVEL_CLASSES[level], className)} {...props} />;
}

export type TextProps = HTMLAttributes<HTMLElement> & {
  as?: "span" | "p" | "div";
  tone?: "primary" | "secondary" | "tertiary";
  size?: "sm" | "md";
  weight?: "regular" | "medium" | "semibold";
  meta?: boolean;
};

const TEXT_TONE_CLASSES = {
  primary: "text-ink",
  secondary: "text-ink-secondary",
  tertiary: "text-ink-tertiary",
} as const;

const TEXT_SIZE_CLASSES = {
  sm: "text-xs",
  md: "text-sm",
} as const;

const TEXT_WEIGHT_CLASSES = {
  regular: "font-normal",
  medium: "font-medium",
  semibold: "font-semibold",
} as const;

export function Text({
  as: Tag = "span",
  tone = "primary",
  size = "md",
  weight = "regular",
  meta = false,
  className,
  ...props
}: TextProps) {
  return (
    <Tag
      className={cx(
        "m-0",
        TEXT_TONE_CLASSES[tone],
        TEXT_SIZE_CLASSES[size],
        TEXT_WEIGHT_CLASSES[weight],
        meta && "text-[0.6875rem] font-bold tracking-[0.1em] uppercase",
        className,
      )}
      {...props}
    />
  );
}

export function Divider({ className, ...props }: HTMLAttributes<HTMLHRElement>) {
  return <hr className={cx("h-px w-full m-0 border-0 bg-line", className)} {...props} />;
}

export type SemanticTone = "neutral" | "success" | "warning" | "danger";

export function Badge({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: SemanticTone }) {
  return (
    <span
      className={cx(
        "inline-flex min-h-[22px] w-fit items-center gap-[5px] rounded-pill border px-2 py-[2px] text-xs font-semibold leading-none",
        tone === "neutral"
          ? "border-line bg-surface-muted text-ink-secondary"
          : tone === "success"
            ? "border-success-line bg-success-surface text-success"
            : tone === "warning"
              ? "border-warning-line bg-warning-surface text-warning"
              : "border-danger-line bg-danger-surface text-danger",
        className,
      )}
      {...props}
    />
  );
}

export function Skeleton({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "block min-h-[12px] rounded-control bg-[linear-gradient(90deg,var(--ui-surface-muted),var(--ui-border-subtle),var(--ui-surface-muted))] bg-[length:200%_100%] animate-ui-skeleton",
        className,
      )}
      {...props}
    />
  );
}

export function Surface({
  as: Tag = "div",
  elevated = false,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLElement> & {
  as?: "div" | "section" | "article";
  elevated?: boolean;
  children?: ReactNode;
}) {
  return (
    <Tag className={cx("bg-surface border border-line rounded-card", elevated && "shadow-elevated", className)} {...props}>
      {children}
    </Tag>
  );
}
